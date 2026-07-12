import { type FastifyInstance } from "fastify";
import { getDb } from "../db";
import { buildBrainIndex } from "../services/memory/brain-index";
import { searchSessionMessages, searchMode } from "../services/usage/session-search";
import { recallGlobalNotes } from "../services/memory/recall-global";
import { coerceModel } from "../services/memory/claude-cli";

/** Fastify turns duplicate query keys (?q=a&q=b) into arrays — collapse to one
 *  so downstream string/number ops don't crash. */
function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export async function registerBrainRoutes(app: FastifyInstance) {
  // Cross-project knowledge catalog — all projects' wiki meta + notes + concepts
  // in one payload for the "한번에 확인" knowledge explorer. DB-only, no LLM.
  app.get("/api/brain/index", async (_req, reply) => {
    const db = getDb();
    reply.header("Cache-Control", "no-store");
    const index = buildBrainIndex(db);
    return {
      data: index,
      meta: {
        projectCount: index.projects.length,
        noteCount: index.notes.length,
        conceptCount: index.concepts.length,
        generatedAt: new Date().toISOString(),
      },
    };
  });

  // Cross-project full-text conversation search (P7.2). LIKE-based first cut.
  app.get<{
    Querystring: { q?: string; projectPath?: string; days?: string; limit?: string };
  }>("/api/brain/search", async (req, reply) => {
    const db = getDb();
    reply.header("Cache-Control", "no-store");
    const q = firstParam(req.query.q) ?? "";
    const projectPath = firstParam(req.query.projectPath);
    const daysRaw = firstParam(req.query.days);
    const limitRaw = firstParam(req.query.limit);
    const days = daysRaw ? Number(daysRaw) : undefined;
    const limit = limitRaw ? Number(limitRaw) : undefined;
    const hits = searchSessionMessages({ q, projectPath, days, limit }, db);
    return { data: hits, meta: { total: hits.length, mode: searchMode(q), q } };
  });

  // Cross-project meaning-based note recall — the web surface for recall_global
  // (P7.4). LLM call (claude-cli), so POST. Per-project synthesized "ask" stays
  // on /api/wiki/ask; this is the "ask the whole brain" side.
  app.post<{ Body: { query?: string; model?: string } }>(
    "/api/brain/recall",
    async (req, reply) => {
      reply.header("Cache-Control", "no-store");
      const query = (req.body?.query ?? "").trim();
      if (!query) {
        reply.code(400).send({ error: "query is required" });
        return;
      }
      const model = coerceModel(req.body?.model);
      try {
        const notes = await recallGlobalNotes(query, model, getDb());
        return {
          data: notes.map((g) => ({
            projectPath: g.projectPath,
            projectName: g.projectName,
            slug: g.note.slug,
            title: g.note.title,
            content: g.note.content,
          })),
          meta: { count: notes.length, model, query },
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err }, "brain recall failed");
        reply.code(500).send({ error: message });
      }
    },
  );
}
