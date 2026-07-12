import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { sessionMessages, usageEvents } from "../../db/schema";
import { discoverProjects } from "../projects/discover";
import { getNotes, extractWikilinks } from "./notes";
import { getOntology } from "./ontology";
import { getLinks } from "./links";

export type GraphInclude = "notes" | "concepts";

export interface GraphNode {
  id: string;
  type: "session" | "topic" | "memory" | "project" | "concept" | "note";
  label: string;
  /** Relative size hint (1–20). */
  size: number;
  color: string;
  /** Unix ms — for session nodes. */
  ts?: number;
  sessionId?: string;
  tokenCount?: number;
  /** For project nodes (global graph) — slug for navigation. */
  projectSlug?: string;
  /** For concept nodes (ontology) — concept kind + optional rationale. */
  kind?: string;
  /** Owning project path — set on global-graph overlay (project/note/concept)
   *  nodes so the UI can resolve detail without parsing the namespaced id. */
  projectPath?: string;
  /** Source identifier within the project — note slug or concept id. */
  ref?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  /** temporal: session↔session · topic: session↔file · related: file↔file
      · relation: typed ontology edge (label carries the relation name)
      · wikilink: note↔note [[slug]] link · mentions: note→concept cross-layer link */
  type: "temporal" | "topic" | "related" | "relation" | "wikilink" | "mentions";
  /** Edge label (e.g. ontology relation type) — rendered when enabled. */
  label?: string;
  /** Optional edge color override. */
  color?: string;
}

export interface ProjectGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Colors per model family
const MODEL_COLOR: Record<string, string> = {
  opus: "#7c3aed",
  sonnet: "#2563eb",
  haiku: "#0891b2",
  unknown: "#6b7280",
};

function modelColor(model: string): string {
  if (model.includes("opus")) return MODEL_COLOR.opus;
  if (model.includes("sonnet")) return MODEL_COLOR.sonnet;
  if (model.includes("haiku")) return MODEL_COLOR.haiku;
  return MODEL_COLOR.unknown;
}

// File/code references in conversation text — language-neutral, project-
// specific entities that connect the sessions which touched the same code.
const FILE_RE =
  /\b[\w.\-/]*[\w-]+\.(tsx?|jsx?|mjs|cjs|py|rs|go|java|rb|c|cc|cpp|hpp?|cs|css|scss|less|html?|json|jsonc|sql|sh|bash|zsh|mdx?|ya?ml|toml|tf|svelte|vue|prisma|proto)\b/gi;
const MAX_FILE_TOPICS = 15;
const MIN_NAME_LEN = 3;
const EDGE_WEIGHT_CAP = 5;

// Files mentioned in (almost) every session carry no project-distinguishing
// signal — they're the "stopwords" of a code graph. Two-layer filter:
//   1. an explicit denylist of universally-ubiquitous config/meta files
//   2. a document-frequency cap (dropped if in >80% of sessions, when there
//      are enough sessions to make the ratio meaningful)
const NOISE_FILES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
  "claude.md",
  "readme.md",
  "license",
  "license.md",
  ".gitignore",
  ".gitattributes",
  ".npmrc",
  ".editorconfig",
  ".prettierrc",
  ".env",
  ".env.local",
  ".env.example",
]);
const DF_STOPWORD_RATIO = 0.8;
const DF_MIN_SESSIONS = 5;
/** Two files must co-occur in at least this many sessions to be "related". */
const RELATED_MIN_SHARED = 2;
/** Each file links only to its K strongest co-occurring files — a mutual
 *  k-NN graph. Prevents the all-pairs hairball when every file co-occurs. */
const RELATED_TOP_K = 3;

interface FileTopic {
  key: string;
  display: string;
  sessions: Set<string>;
  count: number;
}

export interface TopicExtraction {
  topics: FileTopic[];
  /** sessionId → (fileKey → mention count) */
  sessionMentions: Map<string, Map<string, number>>;
}

/**
 * Pure: extract code-file topics from session messages. Files are keyed by
 * basename (so `src/foo.ts` and `foo.ts` merge) and ranked by how many distinct
 * sessions mention them — files spanning multiple sessions are the ones that
 * meaningfully link the graph. Capped at MAX_FILE_TOPICS.
 */
export function extractFileTopics(
  msgRows: Array<{ sessionId: string; content: string | null }>,
  limit = MAX_FILE_TOPICS,
): TopicExtraction {
  const byFile = new Map<string, FileTopic>();
  const sessionMentions = new Map<string, Map<string, number>>();

  for (const row of msgRows) {
    const text = row.content ?? "";
    if (!text) continue;
    const matches = text.match(FILE_RE);
    if (!matches) continue;
    for (const raw of matches) {
      const base = raw.split(/[\\/]/).pop() ?? raw;
      if (base.length < MIN_NAME_LEN) continue;
      const key = base.toLowerCase();

      let ft = byFile.get(key);
      if (!ft) {
        ft = { key, display: base, sessions: new Set(), count: 0 };
        byFile.set(key, ft);
      }
      ft.sessions.add(row.sessionId);
      ft.count += 1;

      let sm = sessionMentions.get(row.sessionId);
      if (!sm) {
        sm = new Map();
        sessionMentions.set(row.sessionId, sm);
      }
      sm.set(key, (sm.get(key) ?? 0) + 1);
    }
  }

  const totalSessions = new Set(msgRows.map((r) => r.sessionId)).size;
  const topics = [...byFile.values()]
    .filter((ft) => {
      if (NOISE_FILES.has(ft.key)) return false;
      if (totalSessions >= DF_MIN_SESSIONS && ft.sessions.size / totalSessions > DF_STOPWORD_RATIO) {
        return false; // appears almost everywhere → stopword-like, no signal
      }
      return true;
    })
    .sort((a, b) => b.sessions.size - a.sessions.size || b.count - a.count)
    .slice(0, limit);

  return { topics, sessionMentions };
}

export function buildProjectGraph(projectPath: string, db: Db = getDb()): ProjectGraphData {
  // 1. Sessions with aggregated token counts (drives session nodes).
  const sessionRows = db
    .select({
      sessionId: usageEvents.sessionId,
      totalTokens: sql<number>`sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens})`,
      lastTs: sql<number>`max(${usageEvents.ts})`,
      model: sql<string>`(select model from ${usageEvents} ue2 where ue2.session_id = ${usageEvents.sessionId} order by ts desc limit 1)`,
    })
    .from(usageEvents)
    .where(sql`${usageEvents.projectPath} = ${projectPath}`)
    .groupBy(usageEvents.sessionId)
    .orderBy(sql`max(${usageEvents.ts}) ASC`)
    .all();

  if (sessionRows.length === 0) {
    return { nodes: [], edges: [] };
  }

  // 2. Conversation content → file/code topics (no wiki dependency, no LLM).
  const msgRows = db
    .select({ sessionId: sessionMessages.sessionId, content: sessionMessages.content })
    .from(sessionMessages)
    .where(
      sql`${sessionMessages.projectPath} = ${projectPath}
        AND ${sessionMessages.content} IS NOT NULL
        AND ${sessionMessages.type} IN ('user', 'assistant')
        AND ${sessionMessages.isCompactSummary} = 0`,
    )
    .all();

  const { topics, sessionMentions } = extractFileTopics(msgRows);

  // 3. Build nodes.
  const sessionIds = new Set(sessionRows.map((s) => s.sessionId));
  const maxTokens = Math.max(...sessionRows.map((r) => r.totalTokens), 1);
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  for (const s of sessionRows) {
    const size = Math.max(4, Math.round((s.totalTokens / maxTokens) * 18));
    nodes.push({
      id: `session:${s.sessionId}`,
      type: "session",
      label: new Date(s.lastTs).toISOString().slice(0, 10),
      size,
      color: modelColor(s.model ?? ""),
      ts: s.lastTs,
      sessionId: s.sessionId,
      tokenCount: s.totalTokens,
    });
  }

  for (const t of topics) {
    nodes.push({
      id: `topic:${t.key}`,
      type: "topic",
      label: t.display,
      size: Math.max(6, Math.min(16, 4 + t.sessions.size * 2)),
      color: "#16a34a",
    });
  }

  // 4. Temporal edges — consecutive sessions within 7 days.
  for (let i = 1; i < sessionRows.length; i++) {
    const prev = sessionRows[i - 1];
    const curr = sessionRows[i];
    const dayDiff = (curr.lastTs - prev.lastTs) / 86_400_000;
    if (dayDiff <= 7) {
      edges.push({
        id: `temporal:${i}`,
        source: `session:${prev.sessionId}`,
        target: `session:${curr.sessionId}`,
        weight: Math.max(0.1, 1 - dayDiff / 7),
        type: "temporal",
      });
    }
  }

  // 5. Topic edges — a session that mentions a file links to that topic node.
  const topicKeys = new Set(topics.map((t) => t.key));
  for (const [sessionId, mentions] of sessionMentions) {
    if (!sessionIds.has(sessionId)) continue; // no matching session node
    for (const [key, count] of mentions) {
      if (!topicKeys.has(key)) continue; // not a top-N topic
      edges.push({
        id: `topic:${sessionId}:${key}`,
        source: `session:${sessionId}`,
        target: `topic:${key}`,
        weight: Math.min(count, EDGE_WEIGHT_CAP),
        type: "topic",
      });
    }
  }

  // 6. Related edges — files co-mentioned in the same session are related
  //    modules. Count shared sessions per file pair, then keep only each file's
  //    top-K strongest partners (mutual k-NN) so a densely co-occurring project
  //    doesn't collapse into an all-pairs hairball.
  const partners = new Map<string, Map<string, number>>(); // key → (partner → shared)
  const bump = (a: string, b: string) => {
    let m = partners.get(a);
    if (!m) {
      m = new Map();
      partners.set(a, m);
    }
    m.set(b, (m.get(b) ?? 0) + 1);
  };
  for (const [sessionId, mentions] of sessionMentions) {
    if (!sessionIds.has(sessionId)) continue;
    const keys = [...mentions.keys()].filter((k) => topicKeys.has(k));
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        bump(keys[i], keys[j]);
        bump(keys[j], keys[i]);
      }
    }
  }

  const seenPair = new Set<string>();
  for (const [key, m] of partners) {
    const top = [...m.entries()]
      .filter(([, shared]) => shared >= RELATED_MIN_SHARED)
      .sort((a, b) => b[1] - a[1])
      .slice(0, RELATED_TOP_K);
    for (const [other, shared] of top) {
      const pair = [key, other].sort().join("|");
      if (seenPair.has(pair)) continue;
      seenPair.add(pair);
      const [a, b] = pair.split("|");
      edges.push({
        id: `related:${pair}`,
        source: `topic:${a}`,
        target: `topic:${b}`,
        weight: Math.min(shared, EDGE_WEIGHT_CAP),
        type: "related",
      });
    }
  }

  return { nodes, edges };
}

/** Two projects must share at least this many distinctive files to be linked. */
const GLOBAL_MIN_SHARED_FILES = 2;
/** A file present in more than this fraction of projects is a cross-project
 *  stopword (index.ts, config.ts, app.tsx…) — ignored when linking projects. */
const GLOBAL_FILE_DF_RATIO = 0.5;
/** Each project keeps only its K strongest links (mutual k-NN) so a web of
 *  interrelated repos doesn't collapse into a near-complete hairball. */
const GLOBAL_TOP_K = 3;

// Knowledge-overlay tuning — caps keep the cross-project graph from collapsing
// into a hairball when notes/concepts are layered onto the project nodes.
const NOTE_NODE_COLOR = "#d97706";
const OVERLAY_NOTES_PER_PROJECT = 6;
// Sanity ceiling once concept-anchor notes are added beyond the degree cap.
const OVERLAY_MAX_NOTES_PER_PROJECT = 30;
const CONCEPT_KIND_COLOR: Record<string, string> = {
  decision: "#ef4444",
  component: "#2563eb",
  tech: "#0891b2",
  problem: "#f59e0b",
  goal: "#16a34a",
};

/** Bidirectional wikilink degree within a note set — hub ranking for the cap. */
function overlayNoteDegrees(notes: Array<{ slug: string; content: string }>): Map<string, number> {
  const slugs = new Set(notes.map((n) => n.slug));
  const deg = new Map<string, number>();
  for (const n of notes) {
    for (const target of extractWikilinks(n.content)) {
      if (!slugs.has(target) || target === n.slug) continue;
      deg.set(n.slug, (deg.get(n.slug) ?? 0) + 1);
      deg.set(target, (deg.get(target) ?? 0) + 1);
    }
  }
  return deg;
}

/**
 * Knowledge overlay for the global graph (P7.3): per project, the top-degree
 * atomic notes (project→note membership edges) and, with concepts, the
 * note→concept mention edges from the link layer. Node ids are namespaced by
 * project path so slugs from different projects don't collide in one graph.
 * Pure (DB read only) and independent of project discovery, so it's unit-testable.
 */
export function buildKnowledgeOverlay(
  projectPaths: string[],
  include: GraphInclude[],
  db: Db = getDb(),
): ProjectGraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  if (!include.includes("notes")) return { nodes, edges }; // notes are the entry layer
  const wantConcepts = include.includes("concepts");

  for (const path of projectPaths) {
    const noteRes = getNotes(path, db);
    if (!noteRes || noteRes.notes.length === 0) continue;

    // Concept layer needs its anchor notes visible, so resolve links first and
    // fold the linked notes into the shown set (the degree cap alone would hide
    // them and the mention edges would dangle).
    const ontologyRes = wantConcepts ? getOntology(path, db) : null;
    const linksRes = wantConcepts ? getLinks(path, db) : null;
    const linkedSlugs = new Set((linksRes?.links ?? []).map((l) => l.noteSlug));

    const deg = overlayNoteDegrees(noteRes.notes);
    const byDegree = [...noteRes.notes].sort(
      (a, b) => (deg.get(b.slug) ?? 0) - (deg.get(a.slug) ?? 0),
    );
    const shown = new Set(byDegree.slice(0, OVERLAY_NOTES_PER_PROJECT).map((n) => n.slug));
    for (const n of byDegree) {
      if (shown.size >= OVERLAY_MAX_NOTES_PER_PROJECT) break;
      if (linkedSlugs.has(n.slug)) shown.add(n.slug);
    }

    for (const n of noteRes.notes) {
      if (!shown.has(n.slug)) continue;
      const id = `note:${path}:${n.slug}`;
      nodes.push({
        id,
        type: "note",
        label: n.title,
        size: Math.max(4, Math.min(12, 4 + (deg.get(n.slug) ?? 0) * 2)),
        color: NOTE_NODE_COLOR,
        projectPath: path,
        ref: n.slug,
      });
      edges.push({ id: `member:${id}`, source: `project:${path}`, target: id, weight: 1, type: "related" });
    }

    if (!wantConcepts || !ontologyRes || !linksRes) continue;

    const conceptById = new Map(ontologyRes.ontology.concepts.map((c) => [c.id, c]));
    const added = new Set<string>();
    for (const link of linksRes.links) {
      if (!shown.has(link.noteSlug)) continue; // only concepts tied to a visible note
      const concept = conceptById.get(link.conceptId);
      if (!concept) continue;
      const cid = `concept:${path}:${concept.id}`;
      if (!added.has(concept.id)) {
        added.add(concept.id);
        nodes.push({
          id: cid,
          type: "concept",
          label: concept.label,
          size: 6,
          color: CONCEPT_KIND_COLOR[concept.kind] ?? "#6b7280",
          kind: concept.kind,
          projectPath: path,
          ref: concept.id,
        });
      }
      edges.push({
        id: `mentions:${path}:${link.noteSlug}:${concept.id}`,
        source: `note:${path}:${link.noteSlug}`,
        target: cid,
        weight: 2,
        type: "mentions",
      });
    }
  }

  return { nodes, edges };
}

/**
 * Cross-project graph: one node per registered project, linked when they share
 * signal files (same basenames in conversation). Surfaces project families
 * (e.g. a project and its -advance / -sim siblings) that share code. No LLM. With
 * `include`, layers each project's atomic notes / ontology concepts on top.
 */
export async function buildGlobalGraph(
  db: Db = getDb(),
  include: GraphInclude[] = [],
): Promise<ProjectGraphData> {
  const projects = await discoverProjects(db);

  const perProject: Array<{ slug: string; path: string; name: string; files: Set<string>; sessions: number }> = [];
  for (const p of projects) {
    const msgRows = db
      .select({ sessionId: sessionMessages.sessionId, content: sessionMessages.content })
      .from(sessionMessages)
      .where(
        sql`${sessionMessages.projectPath} = ${p.absolutePath}
          AND ${sessionMessages.content} IS NOT NULL
          AND ${sessionMessages.type} IN ('user', 'assistant')
          AND ${sessionMessages.isCompactSummary} = 0`,
      )
      .all();
    if (msgRows.length === 0) continue;
    // Use the full noise-filtered file set (not the top-N visual cap) so
    // cross-project family overlaps aren't undercounted.
    const { topics } = extractFileTopics(msgRows, Infinity);
    const sessions = new Set(msgRows.map((r) => r.sessionId)).size;
    perProject.push({
      slug: p.slug,
      path: p.absolutePath,
      name: p.name,
      files: new Set(topics.map((t) => t.key)),
      sessions,
    });
  }

  if (perProject.length === 0) return { nodes: [], edges: [] };

  const maxSessions = Math.max(...perProject.map((p) => p.sessions), 1);
  const nodes: GraphNode[] = perProject.map((p) => ({
    id: `project:${p.path}`,
    type: "project",
    label: p.name,
    size: Math.max(6, Math.round((p.sessions / maxSessions) * 18)),
    color: "#6b7280",
    projectSlug: p.slug,
    tokenCount: p.sessions,
    projectPath: p.path,
  }));

  // Cross-project document frequency: a basename in too many projects is a
  // generic stopword (index.ts, config.ts) that links unrelated projects.
  const projectFreq = new Map<string, number>();
  for (const p of perProject) {
    for (const f of p.files) projectFreq.set(f, (projectFreq.get(f) ?? 0) + 1);
  }
  const maxDf = Math.max(2, Math.floor(perProject.length * GLOBAL_FILE_DF_RATIO));
  const isDistinctive = (f: string) => (projectFreq.get(f) ?? 0) <= maxDf;

  // Pairwise distinctive-file overlap.
  const sharedByPair = new Map<string, number>(); // "i|j" (i<j) → shared count
  const partners = new Map<number, Array<{ j: number; shared: number }>>();
  for (let i = 0; i < perProject.length; i++) {
    for (let j = i + 1; j < perProject.length; j++) {
      let shared = 0;
      for (const f of perProject[i].files) if (isDistinctive(f) && perProject[j].files.has(f)) shared += 1;
      if (shared < GLOBAL_MIN_SHARED_FILES) continue;
      sharedByPair.set(`${i}|${j}`, shared);
      (partners.get(i) ?? partners.set(i, []).get(i)!).push({ j, shared });
      (partners.get(j) ?? partners.set(j, []).get(j)!).push({ j: i, shared });
    }
  }

  // Keep each project's top-K partners, then emit the union (deduped).
  const keptPairs = new Set<string>();
  for (const [i, list] of partners) {
    list.sort((a, b) => b.shared - a.shared);
    for (const { j } of list.slice(0, GLOBAL_TOP_K)) {
      keptPairs.add(i < j ? `${i}|${j}` : `${j}|${i}`);
    }
  }

  const edges: GraphEdge[] = [];
  for (const pair of keptPairs) {
    const [i, j] = pair.split("|").map(Number);
    const a = perProject[i];
    const b = perProject[j];
    edges.push({
      id: `related:${a.slug}:${b.slug}`,
      source: `project:${a.path}`,
      target: `project:${b.path}`,
      weight: Math.min(sharedByPair.get(pair) ?? 0, EDGE_WEIGHT_CAP),
      type: "related",
    });
  }

  if (include.length > 0) {
    const overlay = buildKnowledgeOverlay(perProject.map((p) => p.path), include, db);
    nodes.push(...overlay.nodes);
    edges.push(...overlay.edges);
  }

  return { nodes, edges };
}

/**
 * Local graph around a single session — its 2-hop neighborhood within the
 * project: the session, the files it touched, and the other sessions that
 * touched those same files. Answers "what did this session work on, and which
 * other sessions share that work." Built by pruning the project graph.
 */
export function buildSessionLocalGraph(sessionId: string, db: Db = getDb()): ProjectGraphData {
  const row = db
    .select({ projectPath: usageEvents.projectPath })
    .from(usageEvents)
    .where(sql`${usageEvents.sessionId} = ${sessionId}`)
    .limit(1)
    .get();
  if (!row) return { nodes: [], edges: [] };

  const full = buildProjectGraph(row.projectPath, db);
  const start = `session:${sessionId}`;
  if (!full.nodes.some((n) => n.id === start)) return { nodes: [], edges: [] };

  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    let s = adj.get(a);
    if (!s) {
      s = new Set();
      adj.set(a, s);
    }
    s.add(b);
  };
  for (const e of full.edges) {
    link(e.source, e.target);
    link(e.target, e.source);
  }

  // BFS to depth 2 from the focal session.
  const keep = new Set([start]);
  let frontier = [start];
  for (let depth = 0; depth < 2; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (!keep.has(nb)) {
          keep.add(nb);
          next.push(nb);
        }
      }
    }
    frontier = next;
  }

  return {
    nodes: full.nodes.filter((n) => keep.has(n.id)),
    edges: full.edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
}
