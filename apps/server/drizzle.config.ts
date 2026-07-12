import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  // The runtime path is resolved by src/db/path.ts; drizzle-kit only needs
  // a placeholder here for commands like `studio`. `generate` does not
  // require a real database file.
  dbCredentials: {
    url: "file:./drizzle/dev.db",
  },
});
