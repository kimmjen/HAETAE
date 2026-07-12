import "./env";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyHttpProxy from "@fastify/http-proxy";
import { openDb, runMigrations } from "./db";
import { getDbFilePath } from "./db/path";
import { registerClaudeMdRoutes } from "./routes/claude-md";
import { registerProjectsRoutes } from "./routes/projects";
import { registerRulesRoutes } from "./routes/rules";
import { registerSystemRoutes } from "./routes/system";
import { registerTerminalRoutes } from "./routes/terminal-ws";
import { registerUsageLocalRoutes } from "./routes/usage-local";
import { registerUsageApiRoutes } from "./routes/usage-api";
import { registerMemoriesRoutes } from "./routes/memories";
import { registerProjectWikiRoutes } from "./routes/project-wiki";
import { registerBrainRoutes } from "./routes/brain";
import { registerVoiceRoutes } from "./routes/voice";
import { indexAll } from "./services/usage";
import { startWikiAutoScheduler } from "./services/memory/auto-wiki";
import { registerLocalGuard } from "./security/local-guard";

const PORT = Number(process.env.HAETAE_SERVER_PORT ?? 3001);
const HOST = "127.0.0.1";
const IS_PROD = process.env.NODE_ENV === "production";
// ADR 0010 — NotebookLM Python (FastAPI) app. In prod, this server proxies
// /py/* to it so everything stays single-origin (:3001). Dev uses the Vite proxy.
const NOTEBOOKLM_PORT = Number(process.env.HAETAE_NOTEBOOKLM_PORT ?? 4100);
// Periodic re-index cadence. `usage_file_cursor` makes ticks effectively
// free when nothing changed, so 30s is generous. Set to 0 to disable —
// the Sync button still works in that case.
const INDEXER_INTERVAL_MS = Number(
  process.env.HAETAE_INDEXER_INTERVAL_MS ?? 30_000,
);

async function startServer() {
  const app = Fastify({
    logger: {
      level: process.env.HAETAE_DEBUG === "true" ? "debug" : "info",
    },
  });

  const dbPath = getDbFilePath();
  app.log.info({ dbPath }, "opening sqlite database");
  const db = openDb();
  runMigrations(db);
  app.log.info("migrations applied");

  // Reject non-loopback Host / cross-origin requests before anything else —
  // defends the file-writing / process-spawning API against DNS rebinding + CSRF.
  registerLocalGuard(app);

  await registerClaudeMdRoutes(app);
  await registerProjectsRoutes(app);
  await registerRulesRoutes(app);
  await registerSystemRoutes(app);
  await registerUsageLocalRoutes(app);
  await registerUsageApiRoutes(app);
  await registerMemoriesRoutes(app);
  await registerProjectWikiRoutes(app);
  await registerBrainRoutes(app);
  await registerVoiceRoutes(app);
  await registerTerminalRoutes(app);

  if (IS_PROD) {
    // Single-origin production mode: serve apps/web/dist + SPA fallback so
    // the user only points the browser at http://127.0.0.1:3001 and the
    // /api/* routes work without a separate proxy. Dev mode keeps Vite on
    // 5173 with its own proxy → server.

    // Proxy /py/* to the NotebookLM Python app (ADR 0010) so it's same-origin
    // in prod too. Registered before the SPA fallback so /py/ never hits it.
    await app.register(fastifyHttpProxy, {
      upstream: `http://127.0.0.1:${NOTEBOOKLM_PORT}`,
      prefix: "/py",
      rewritePrefix: "/py",
    });

    const webDist = path.resolve(import.meta.dirname, "../../web/dist");
    await app.register(fastifyStatic, {
      root: webDist,
      wildcard: false,
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/") || req.url.startsWith("/py/")) {
        reply.code(404).send({ error: "not found" });
        return;
      }
      reply.sendFile("index.html");
    });
    app.log.info({ webDist }, "serving web build (NODE_ENV=production)");
  }

  await app.listen({ port: PORT, host: HOST });

  // Boot indexer — fire-and-forget so the server is responsive immediately.
  // First boot on a fresh machine can take a few seconds (hundreds of MB
  // of jsonl); subsequent runs are near-instant thanks to the per-file
  // cursor.
  void indexAll(db)
    .then((r) =>
      app.log.info(
        { filesScanned: r.filesScanned, inserted: r.totalInserted },
        "boot indexer done",
      ),
    )
    .catch((err) => app.log.error({ err }, "boot indexer failed"));

  // Periodic re-index so new sessions show up without the user pressing
  // the Sync button. Re-entrancy guard skips a tick if the previous run
  // is still in flight (only matters during the initial cold-cache scan).
  // Idle ticks stay silent — DEBUG-level only when inserted == 0.
  if (INDEXER_INTERVAL_MS > 0) {
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const r = await indexAll(db);
        if (r.totalInserted > 0) {
          app.log.info(
            { filesScanned: r.filesScanned, inserted: r.totalInserted },
            "periodic indexer tick",
          );
        }
      } catch (err) {
        app.log.error({ err }, "periodic indexer failed");
      } finally {
        inFlight = false;
      }
    };
    const handle = setInterval(tick, INDEXER_INTERVAL_MS);
    // Don't keep the event loop alive on shutdown signals just for this.
    handle.unref();
    app.log.info({ intervalMs: INDEXER_INTERVAL_MS }, "periodic indexer armed");
  }

  // Optional background wiki auto-updates (opt-in via HAETAE_WIKI_AUTO=true).
  // Spends Claude quota, so it's off by default and heavily rate-limited.
  startWikiAutoScheduler(db, app.log);
}

startServer().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
