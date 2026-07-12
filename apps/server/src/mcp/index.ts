import "../env";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openDb, runMigrations, type Db } from "../db";
import { coerceModel } from "../services/memory/claude-cli";
import { recallNotes, recallGlobal, askBrain } from "./tools";

/**
 * HAETAE second-brain MCP server (stdio). Lets a Claude Code session pull
 * just-in-time depth from the brain: the project CLAUDE.md carries the memory
 * INDEX (note titles, from inject v1); these tools fetch the relevant note
 * bodies / a grounded answer on demand (Anthropic memory-tool pattern).
 *
 * Self-contained — opens its own cache.db, so the HAETAE HTTP server need not
 * be running. stdout is reserved for JSON-RPC; everything here is silent.
 *
 * Register: claude mcp add haetae -- pnpm --filter haetae-server mcp
 */
const db: Db = openDb();
runMigrations(db);

const server = new McpServer({ name: "haetae-brain", version: "0.1.0" });

server.registerTool(
  "recall_notes",
  {
    description:
      "Retrieve the project's atomic notes most relevant to a query, by meaning. Use when the project CLAUDE.md '기억 인덱스' lists a topic by title and you need its detail.",
    inputSchema: { projectPath: z.string(), query: z.string(), model: z.string().optional() },
  },
  async ({ projectPath, query, model }) => ({
    content: [{ type: "text", text: await recallNotes(projectPath, query, coerceModel(model), db) }],
  }),
);

server.registerTool(
  "recall_global",
  {
    description:
      "Retrieve atomic notes relevant to a query across ALL projects' brains — use when the answer may live in another project's memory (cross-project recall).",
    inputSchema: { query: z.string(), model: z.string().optional() },
  },
  async ({ query, model }) => ({
    content: [{ type: "text", text: await recallGlobal(query, coerceModel(model), db) }],
  }),
);

server.registerTool(
  "ask_brain",
  {
    description:
      "Ask the project's second brain a question; returns a grounded answer with source citations from the wiki/notes and conversation history.",
    inputSchema: { projectPath: z.string(), question: z.string(), model: z.string().optional() },
  },
  async ({ projectPath, question, model }) => ({
    content: [{ type: "text", text: await askBrain(projectPath, question, coerceModel(model), db) }],
  }),
);

server.connect(new StdioServerTransport()).catch((err) => {
  console.error("haetae mcp failed to start:", err);
  process.exit(1);
});
