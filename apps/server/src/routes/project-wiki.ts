import { type FastifyInstance } from "fastify";
import { getDb } from "../db";
import {
  generateProjectWiki,
  getProjectWiki,
  listProjectWikis,
  rollbackProjectWiki,
} from "../services/memory/wiki";
import { listWikiHistory } from "../services/memory/wiki-history";
import { buildProjectGraph, buildGlobalGraph, buildSessionLocalGraph } from "../services/memory/graph";
import { generateOntology, getOntology } from "../services/memory/ontology";
import { generateNotes, getNotes } from "../services/memory/notes";
import { askProjectBrain } from "../services/memory/ask";
import { selectRelevantNotesSemantic } from "../services/memory/recall";
import { generateLinks, getLinks } from "../services/memory/links";
import { exportVault } from "../services/memory/vault";
import { getAutoWikiStatus } from "../services/memory/auto-wiki";
import { generateEval, getEval, getEvalHistory } from "../services/memory/eval";
import { coerceModel } from "../services/memory/claude-cli";
import { discoverProjects, isKnownProjectPath } from "../services/projects/discover";

export async function registerProjectWikiRoutes(app: FastifyInstance) {
  /**
   * GET /api/wiki/graph?projectPath=
   * Returns graph nodes + edges for the project. No LLM — pure DB aggregation.
   */
  app.get<{ Querystring: { projectPath?: string } }>("/api/wiki/graph", async (req, reply) => {
    const { projectPath } = req.query;
    if (!projectPath) {
      reply.code(400).send({ error: "projectPath is required" });
      return;
    }
    const db = getDb();
    reply.header("Cache-Control", "no-store");
    return buildProjectGraph(projectPath, db);
  });

  /**
   * GET /api/wiki/graph/global?include=notes,concepts
   * Cross-project graph — projects linked by shared signal files. No LLM.
   * `include` layers each project's atomic notes / ontology concepts on top.
   */
  app.get<{ Querystring: { include?: string } }>("/api/wiki/graph/global", async (req, reply) => {
    const db = getDb();
    reply.header("Cache-Control", "no-store");
    // Duplicate keys (?include=notes&include=concepts) arrive as an array — join
    // so .split doesn't crash; single value passes through unchanged.
    const raw = Array.isArray(req.query.include)
      ? req.query.include.join(",")
      : (req.query.include ?? "");
    const include = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is "notes" | "concepts" => s === "notes" || s === "concepts");
    return buildGlobalGraph(db, include);
  });

  /**
   * GET /api/wiki/graph/session?sessionId=
   * Local 2-hop graph around one session (its files + sessions sharing them).
   */
  app.get<{ Querystring: { sessionId?: string } }>("/api/wiki/graph/session", async (req, reply) => {
    const { sessionId } = req.query;
    if (!sessionId) {
      reply.code(400).send({ error: "sessionId is required" });
      return;
    }
    const db = getDb();
    reply.header("Cache-Control", "no-store");
    return buildSessionLocalGraph(sessionId, db);
  });

  /**
   * GET /api/wiki/ontology?projectPath=
   * Stored typed ontology (concept nodes + typed relation edges) as graph data.
   * 404 if not yet extracted.
   */
  app.get<{ Querystring: { projectPath?: string } }>("/api/wiki/ontology", async (req, reply) => {
    const { projectPath } = req.query;
    if (!projectPath) {
      reply.code(400).send({ error: "projectPath is required" });
      return;
    }
    const result = getOntology(projectPath, getDb());
    if (!result) {
      reply.code(404).send({ error: "ontology not found", projectPath });
      return;
    }
    reply.header("Cache-Control", "no-store");
    return result;
  });

  /**
   * POST /api/wiki/ontology/generate  { projectPath, model? }
   * Extract the typed ontology from the project wiki via the agent.
   */
  app.post<{ Body: { projectPath?: string; model?: string } }>(
    "/api/wiki/ontology/generate",
    async (req, reply) => {
      const { projectPath, model: modelRaw } = req.body ?? {};
      if (!projectPath || typeof projectPath !== "string") {
        reply.code(400).send({ error: "projectPath is required" });
        return;
      }
      const model = coerceModel(modelRaw);

      const db = getDb();
      const known = (await discoverProjects(db)).map((p) => p.absolutePath);
      if (!isKnownProjectPath(known, projectPath)) {
        reply.code(403).send({ error: "unknown project path", projectPath });
        return;
      }

      try {
        const result = await generateOntology(projectPath, model, db);
        reply.header("Cache-Control", "no-store");
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err, projectPath }, "ontology generation failed");
        reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * GET /api/wiki/notes?projectPath=
   * Stored atomic notes (Zettelkasten) + wikilink graph. 404 if not yet split.
   */
  app.get<{ Querystring: { projectPath?: string } }>("/api/wiki/notes", async (req, reply) => {
    const { projectPath } = req.query;
    if (!projectPath) {
      reply.code(400).send({ error: "projectPath is required" });
      return;
    }
    const result = getNotes(projectPath, getDb());
    if (!result) {
      reply.code(404).send({ error: "notes not found", projectPath });
      return;
    }
    reply.header("Cache-Control", "no-store");
    return result;
  });

  /**
   * POST /api/wiki/notes/generate  { projectPath, model? }
   * Split the project wiki into atomic notes via the agent.
   */
  app.post<{ Body: { projectPath?: string; model?: string } }>(
    "/api/wiki/notes/generate",
    async (req, reply) => {
      const { projectPath, model: modelRaw } = req.body ?? {};
      if (!projectPath || typeof projectPath !== "string") {
        reply.code(400).send({ error: "projectPath is required" });
        return;
      }
      const model = coerceModel(modelRaw);

      const db = getDb();
      const known = (await discoverProjects(db)).map((p) => p.absolutePath);
      if (!isKnownProjectPath(known, projectPath)) {
        reply.code(403).send({ error: "unknown project path", projectPath });
        return;
      }

      try {
        const result = await generateNotes(projectPath, model, db);
        reply.header("Cache-Control", "no-store");
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err, projectPath }, "notes generation failed");
        reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * POST /api/wiki/ask  { projectPath, question, model? }
   * Answer a question against the project's second brain (wiki + relevant
   * conversation excerpts) with source attribution. Read-only + LLM; no file writes.
   */
  app.post<{ Body: { projectPath?: string; question?: string; model?: string } }>(
    "/api/wiki/ask",
    async (req, reply) => {
      const { projectPath, question, model: modelRaw } = req.body ?? {};
      if (!projectPath || typeof projectPath !== "string") {
        reply.code(400).send({ error: "projectPath is required" });
        return;
      }
      if (!question || typeof question !== "string" || !question.trim()) {
        reply.code(400).send({ error: "question is required" });
        return;
      }
      const model = coerceModel(modelRaw);
      try {
        const result = await askProjectBrain(projectPath, question.trim(), model, getDb());
        reply.header("Cache-Control", "no-store");
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err, projectPath }, "ask failed");
        reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * POST /api/wiki/notes/search  { projectPath, query, model? }
   * Meaning-based note search for the graph "의미로 찾기": the agent reads the
   * note index and returns the slugs it judges relevant (the same selector
   * recall uses). Returns { slugs } — the graph highlights matching nodes.
   */
  app.post<{ Body: { projectPath?: string; query?: string; model?: string } }>(
    "/api/wiki/notes/search",
    async (req, reply) => {
      const { projectPath, query, model: modelRaw } = req.body ?? {};
      if (!projectPath || typeof projectPath !== "string") {
        reply.code(400).send({ error: "projectPath is required" });
        return;
      }
      if (!query || typeof query !== "string" || !query.trim()) {
        reply.code(400).send({ error: "query is required" });
        return;
      }
      const notes = getNotes(projectPath, getDb());
      if (!notes) return { slugs: [] };
      try {
        const scored = await selectRelevantNotesSemantic(notes.notes, query.trim(), coerceModel(modelRaw));
        // Seeds only (hop 0) — the agent's direct meaning matches. Wikilink
        // neighbours are already visible as edges in the graph.
        reply.header("Cache-Control", "no-store");
        return { slugs: scored.filter((s) => s.hop === 0).map((s) => s.note.slug) };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err, projectPath }, "notes search failed");
        reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * GET /api/wiki/links?projectPath=
   * Note↔concept cross-layer links + unified graph. 404 if not yet linked.
   */
  app.get<{ Querystring: { projectPath?: string } }>("/api/wiki/links", async (req, reply) => {
    const { projectPath } = req.query;
    if (!projectPath) {
      reply.code(400).send({ error: "projectPath is required" });
      return;
    }
    const result = getLinks(projectPath, getDb());
    if (!result) {
      reply.code(404).send({ error: "links not found", projectPath });
      return;
    }
    reply.header("Cache-Control", "no-store");
    return result;
  });

  /**
   * POST /api/wiki/links/generate  { projectPath, model? }
   * Link atomic notes to ontology concepts via the agent (both must exist).
   */
  app.post<{ Body: { projectPath?: string; model?: string } }>(
    "/api/wiki/links/generate",
    async (req, reply) => {
      const { projectPath, model: modelRaw } = req.body ?? {};
      if (!projectPath || typeof projectPath !== "string") {
        reply.code(400).send({ error: "projectPath is required" });
        return;
      }
      const model = coerceModel(modelRaw);
      const db = getDb();
      const known = (await discoverProjects(db)).map((p) => p.absolutePath);
      if (!isKnownProjectPath(known, projectPath)) {
        reply.code(403).send({ error: "unknown project path", projectPath });
        return;
      }
      try {
        const result = await generateLinks(projectPath, model, db);
        reply.header("Cache-Control", "no-store");
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err, projectPath }, "links generation failed");
        reply.code(500).send({ error: message });
      }
    },
  );

  /**
   * GET /api/wiki/auto-status — self-improving loop state: is the scheduler
   * armed, and which projects are queued for an auto-update. Read-only.
   */
  app.get("/api/wiki/auto-status", async (_req, reply) => {
    reply.header("Cache-Control", "no-store");
    return getAutoWikiStatus(getDb());
  });

  /**
   * POST /api/wiki/vault/export  { projectPath }
   * Materialize the project's notes + wiki as an Obsidian vault under
   * <projectPath>/.haetae/vault/ — markdown files the user owns.
   */
  app.post<{ Body: { projectPath?: string } }>("/api/wiki/vault/export", async (req, reply) => {
    const { projectPath } = req.body ?? {};
    if (!projectPath || typeof projectPath !== "string") {
      reply.code(400).send({ error: "projectPath is required" });
      return;
    }
    const db = getDb();
    const known = (await discoverProjects(db)).map((p) => p.absolutePath);
    if (!isKnownProjectPath(known, projectPath)) {
      reply.code(403).send({ error: "unknown project path", projectPath });
      return;
    }
    try {
      const result = await exportVault(projectPath, db);
      reply.header("Cache-Control", "no-store");
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      app.log.error({ err, projectPath }, "vault export failed");
      reply.code(500).send({ error: message });
    }
  });

  /**
   * GET /api/wiki/eval?projectPath=  — latest wiki self-evaluation (or null).
   */
  app.get<{ Querystring: { projectPath?: string } }>("/api/wiki/eval", async (req, reply) => {
    const { projectPath } = req.query;
    if (!projectPath) {
      reply.code(400).send({ error: "projectPath is required" });
      return;
    }
    reply.header("Cache-Control", "no-store");
    return { eval: getEval(projectPath, getDb()) };
  });

  /**
   * GET /api/wiki/eval/history?projectPath=
   * Eval score trend (oldest→newest) — does the self-correcting loop lift trust?
   */
  app.get<{ Querystring: { projectPath?: string } }>("/api/wiki/eval/history", async (req, reply) => {
    const { projectPath } = req.query;
    if (!projectPath) {
      reply.code(400).send({ error: "projectPath is required" });
      return;
    }
    reply.header("Cache-Control", "no-store");
    return { history: getEvalHistory(projectPath, getDb()) };
  });

  /**
   * POST /api/wiki/eval/generate  { projectPath, model? }
   * Audit the wiki against conversations + the user's voice profile.
   */
  app.post<{ Body: { projectPath?: string; model?: string } }>(
    "/api/wiki/eval/generate",
    async (req, reply) => {
      const { projectPath, model: modelRaw } = req.body ?? {};
      if (!projectPath || typeof projectPath !== "string") {
        reply.code(400).send({ error: "projectPath is required" });
        return;
      }
      const model = coerceModel(modelRaw);
      const db = getDb();
      const known = (await discoverProjects(db)).map((p) => p.absolutePath);
      if (!isKnownProjectPath(known, projectPath)) {
        reply.code(403).send({ error: "unknown project path", projectPath });
        return;
      }
      try {
        const result = await generateEval(projectPath, model, db);
        reply.header("Cache-Control", "no-store");
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err, projectPath }, "eval generation failed");
        reply.code(500).send({ error: message });
      }
    },
  );

  app.get("/api/wiki", async (_req, reply) => {
    const db = getDb();
    reply.header("Cache-Control", "no-store");
    return { data: listProjectWikis(db) };
  });

  /**
   * GET /api/wiki/history?projectPath=
   * Snapshots of prior wiki versions (newest first), without content payload.
   */
  app.get<{ Querystring: { projectPath?: string } }>("/api/wiki/history", async (req, reply) => {
    const { projectPath } = req.query;
    if (!projectPath) {
      reply.code(400).send({ error: "projectPath is required" });
      return;
    }
    const db = getDb();
    reply.header("Cache-Control", "no-store");
    return { data: listWikiHistory(db, projectPath) };
  });

  /**
   * POST /api/wiki/rollback  { projectPath, historyId }
   * Restore the wiki (content + watermark) to a snapshot and re-inject CLAUDE.md.
   */
  app.post<{ Body: { projectPath?: string; historyId?: number } }>(
    "/api/wiki/rollback",
    async (req, reply) => {
      const { projectPath, historyId } = req.body ?? {};
      if (!projectPath || typeof projectPath !== "string") {
        reply.code(400).send({ error: "projectPath is required" });
        return;
      }
      if (typeof historyId !== "number") {
        reply.code(400).send({ error: "historyId is required" });
        return;
      }

      const db = getDb();
      const known = (await discoverProjects(db)).map((p) => p.absolutePath);
      if (!isKnownProjectPath(known, projectPath)) {
        reply.code(403).send({ error: "unknown project path", projectPath });
        return;
      }

      try {
        const result = await rollbackProjectWiki(projectPath, historyId, db);
        reply.header("Cache-Control", "no-store");
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err, projectPath, historyId }, "wiki rollback failed");
        reply.code(400).send({ error: message });
      }
    },
  );

  app.get<{ Querystring: { projectPath?: string } }>("/api/wiki/page", async (req, reply) => {
    const { projectPath } = req.query;
    if (!projectPath) {
      reply.code(400).send({ error: "projectPath is required" });
      return;
    }
    const db = getDb();
    const row = getProjectWiki(projectPath, db);
    if (!row) {
      reply.code(404).send({ error: "wiki not found", projectPath });
      return;
    }
    reply.header("Cache-Control", "no-store");
    return row;
  });

  app.post<{ Body: { projectPath?: string; model?: string; reset?: boolean } }>(
    "/api/wiki/generate",
    async (req, reply) => {
      const { projectPath, model: modelRaw, reset } = req.body ?? {};
      if (!projectPath || typeof projectPath !== "string") {
        reply.code(400).send({ error: "projectPath is required" });
        return;
      }

      const model = coerceModel(modelRaw);

      const db = getDb();

      // Path-traversal guard: generation writes .claude/CLAUDE.md and spawns a
      // subprocess, so only allow paths that are registered project roots.
      const known = (await discoverProjects(db)).map((p) => p.absolutePath);
      if (!isKnownProjectPath(known, projectPath)) {
        reply.code(403).send({ error: "unknown project path", projectPath });
        return;
      }

      try {
        const result = await generateProjectWiki(projectPath, model, db, { reset: reset === true });
        reply.header("Cache-Control", "no-store");
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        app.log.error({ err, projectPath }, "wiki generation failed");
        reply.code(500).send({ error: message });
      }
    },
  );
}
