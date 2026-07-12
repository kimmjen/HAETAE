import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-vite-plugin";
import path from "node:path";
import { defineConfig } from "vite";

const SERVER_PORT = process.env.HAETAE_SERVER_PORT ?? "3001";
const NOTEBOOKLM_PORT = process.env.HAETAE_NOTEBOOKLM_PORT ?? "4100";

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${SERVER_PORT}`,
        changeOrigin: true,
      },
      // ADR 0010 — NotebookLM Python (FastAPI) app. Same-origin via proxy so
      // the loopback guard passes (changeOrigin sets Host to the target).
      "/py": {
        target: `http://127.0.0.1:${NOTEBOOKLM_PORT}`,
        changeOrigin: true,
      },
      // Phase 3 PTY WebSocket. Without ws:true Vite serves /ws/terminal
      // as a 404 from its own dev server and the connection closes
      // before the upgrade handshake reaches Fastify.
      "/ws": {
        target: `ws://127.0.0.1:${SERVER_PORT}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
