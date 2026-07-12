import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { projectLinks, projectNotes, projectOntology } from "../../db/schema";
import { callClaude, extractJson, type ClaudeModel } from "./claude-cli";
import { isDerivedStale, getWikiGeneratedAt } from "./staleness";
import { type AtomicNote, notesToGraph } from "./notes";
import { type Ontology, type OntologyConcept, ontologyToGraph } from "./ontology";
import type { GraphEdge, ProjectGraphData } from "./graph";

/**
 * Cross-layer linking: which ontology concept(s) each atomic note discusses.
 * The agent judges this by MEANING (a note about reading the keychain links to
 * the "인증" concept even without the word), then we draw note→concept edges so
 * the two derived layers form one connected knowledge graph instead of two
 * disjoint views. Stored as one JSON blob per project, regenerated whole.
 */

export interface NoteConceptLink {
  noteSlug: string;
  conceptId: string;
}

// Opaque slate, thicker than within-layer edges (see weight below) so the
// cross-layer note→concept ties read clearly across the two clusters rather
// than fading out. Neutral hue avoids clashing with wikilink/relation colors.
const MENTION_COLOR = "#64748b";

export function buildLinkPrompt(notes: AtomicNote[], concepts: OntologyConcept[]): string {
  const noteIndex = notes.map((n) => `- [${n.slug}] ${n.title}`).join("\n");
  const conceptIndex = concepts.map((c) => `- [${c.id}] ${c.label} (${c.kind})`).join("\n");
  return `You connect two layers of a knowledge base: atomic NOTES and ontology CONCEPTS. For each note, decide which concept(s) it discusses — by MEANING, not exact word overlap.

NOTES:
${noteIndex}

CONCEPTS:
${conceptIndex}

Output ONLY JSON: {"links": [{"noteSlug": "...", "conceptId": "..."}]}. Link a note to the 0-3 concepts it is genuinely about (most notes touch 1-2). Only use slugs/ids from the lists above. Omit notes that match no concept.`;
}

/** Parse the agent's links, keeping only known (noteSlug, conceptId) pairs, deduped. */
export function parseLinks(raw: string, validSlugs: string[], validConceptIds: string[]): NoteConceptLink[] {
  let data: { links?: unknown };
  try {
    data = extractJson<{ links?: unknown }>(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data.links)) return [];
  const slugs = new Set(validSlugs);
  const cids = new Set(validConceptIds);
  const seen = new Set<string>();
  const out: NoteConceptLink[] = [];
  for (const l of data.links as NoteConceptLink[]) {
    if (!l || typeof l.noteSlug !== "string" || typeof l.conceptId !== "string") continue;
    const noteSlug = l.noteSlug.trim();
    const conceptId = l.conceptId.trim();
    const key = `${noteSlug}|${conceptId}`;
    if (!slugs.has(noteSlug) || !cids.has(conceptId) || seen.has(key)) continue;
    seen.add(key);
    out.push({ noteSlug, conceptId });
  }
  return out;
}

/** note→concept "mentions" edges, dropping links whose endpoints don't exist. */
function linksToEdges(links: NoteConceptLink[], noteSlugs: Set<string>, conceptIds: Set<string>): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (const l of links) {
    if (!noteSlugs.has(l.noteSlug) || !conceptIds.has(l.conceptId)) continue;
    edges.push({
      id: `mention:${l.noteSlug}:${l.conceptId}`,
      source: `note:${l.noteSlug}`,
      target: `concept:${l.conceptId}`,
      weight: 2.5, // thicker than wikilink(1.5)/relation(2) so the bridge stands out
      type: "mentions",
      color: MENTION_COLOR,
    });
  }
  return edges;
}

/**
 * Unified graph = note layer (wikilinks) + concept layer (typed relations) +
 * the note→concept mention edges that tie them together.
 */
export function buildUnifiedGraph(
  notes: AtomicNote[],
  ontology: Ontology,
  links: NoteConceptLink[],
): ProjectGraphData {
  const noteGraph = notesToGraph(notes);
  const ontoGraph = ontologyToGraph(ontology);
  const noteSlugs = new Set(notes.map((n) => n.slug));
  const conceptIds = new Set(ontology.concepts.map((c) => c.id));
  return {
    nodes: [...noteGraph.nodes, ...ontoGraph.nodes],
    edges: [...noteGraph.edges, ...ontoGraph.edges, ...linksToEdges(links, noteSlugs, conceptIds)],
  };
}

export interface LinksResult {
  projectPath: string;
  links: NoteConceptLink[];
  graph: ProjectGraphData;
  model: string;
  generatedAt: number;
  wikiGeneratedAt: number | null;
  /** True when the wiki was regenerated since these links were built. */
  isStale: boolean;
}

function loadNotes(projectPath: string, db: Db): AtomicNote[] | null {
  const row = db
    .select({ content: projectNotes.content })
    .from(projectNotes)
    .where(sql`${projectNotes.projectPath} = ${projectPath}`)
    .get();
  return row ? (JSON.parse(row.content) as { notes: AtomicNote[] }).notes : null;
}

function loadOntology(projectPath: string, db: Db): Ontology | null {
  const row = db
    .select({ content: projectOntology.content })
    .from(projectOntology)
    .where(sql`${projectOntology.projectPath} = ${projectPath}`)
    .get();
  return row ? (JSON.parse(row.content) as Ontology) : null;
}

/** Stored cross-layer links + the unified graph, or null if not yet linked. */
export function getLinks(projectPath: string, db: Db = getDb()): LinksResult | null {
  const row = db
    .select()
    .from(projectLinks)
    .where(sql`${projectLinks.projectPath} = ${projectPath}`)
    .get();
  if (!row) return null;
  const links = (JSON.parse(row.content) as { links: NoteConceptLink[] }).links;
  const notes = loadNotes(projectPath, db) ?? [];
  const ontology = loadOntology(projectPath, db) ?? { concepts: [], relations: [] };
  const wikiGeneratedAt = getWikiGeneratedAt(projectPath, db);
  return {
    projectPath,
    links,
    graph: buildUnifiedGraph(notes, ontology, links),
    model: row.model,
    generatedAt: row.generatedAt,
    wikiGeneratedAt,
    isStale: isDerivedStale(row.generatedAt, wikiGeneratedAt),
  };
}

/**
 * Link the project's atomic notes to its ontology concepts via the agent, store
 * the links, and return the unified graph. Requires both notes and ontology to
 * exist — links tie the two layers, so both must be generated first.
 */
export async function generateLinks(
  projectPath: string,
  model: ClaudeModel = "claude-opus-4-8",
  db: Db = getDb(),
): Promise<LinksResult> {
  const notes = loadNotes(projectPath, db);
  const ontology = loadOntology(projectPath, db);
  if (!notes || notes.length === 0 || !ontology || ontology.concepts.length === 0) {
    throw new Error("노트와 온톨로지가 모두 있어야 연결할 수 있습니다 — 둘 다 먼저 생성하세요.");
  }

  const raw = await callClaude(buildLinkPrompt(notes, ontology.concepts), model);
  const links = parseLinks(raw, notes.map((n) => n.slug), ontology.concepts.map((c) => c.id));
  const now = Date.now();

  db.insert(projectLinks)
    .values({ projectPath, content: JSON.stringify({ links }), model, generatedAt: now })
    .onConflictDoUpdate({
      target: projectLinks.projectPath,
      set: { content: JSON.stringify({ links }), model, generatedAt: now, updatedAt: sql`(unixepoch() * 1000)` },
    })
    .run();

  const wikiGeneratedAt = getWikiGeneratedAt(projectPath, db);
  return {
    projectPath,
    links,
    graph: buildUnifiedGraph(notes, ontology, links),
    model,
    generatedAt: now,
    wikiGeneratedAt,
    isStale: isDerivedStale(now, wikiGeneratedAt),
  };
}
