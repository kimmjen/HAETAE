import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { projectOntology, projectWiki } from "../../db/schema";
import { callClaude, extractJson, type ClaudeModel } from "./claude-cli";
import { isDerivedStale, getWikiGeneratedAt } from "./staleness";
import type { GraphNode, GraphEdge, ProjectGraphData } from "./graph";

const RELATION_TYPES = ["supports", "extends", "depends_on", "part_of", "contradicts", "similar"] as const;
type RelationType = (typeof RELATION_TYPES)[number];

export interface OntologyConcept {
  id: string;
  label: string;
  /** decision | component | tech | problem | goal */
  kind: string;
}
export interface OntologyRelation {
  source: string;
  target: string;
  type: RelationType;
  note?: string;
}
export interface Ontology {
  concepts: OntologyConcept[];
  relations: OntologyRelation[];
}

// Concept-kind colors (node) and relation-type colors/labels (edge).
const KIND_COLOR: Record<string, string> = {
  decision: "#ef4444",
  component: "#2563eb",
  tech: "#0891b2",
  problem: "#f59e0b",
  goal: "#16a34a",
};
const REL_COLOR: Record<RelationType, string> = {
  supports: "#16a34a",
  extends: "#2563eb",
  depends_on: "#f59e0b",
  part_of: "#8b5cf6",
  contradicts: "#ef4444",
  similar: "#6b7280",
};
const REL_LABEL: Record<RelationType, string> = {
  supports: "지지",
  extends: "확장",
  depends_on: "의존",
  part_of: "구성",
  contradicts: "반박",
  similar: "유사",
};

export function buildPrompt(
  projectName: string,
  wikiContent: string,
  existing: Array<{ id: string; label: string }> = [],
): string {
  // Identifier stability across wholesale regeneration (same rationale as notes):
  // reuse the id for a concept still present so note→concept links don't break.
  const existingBlock = existing.length
    ? `EXISTING CONCEPT IDS (reuse the SAME id for a concept still present — keep identifiers stable across regenerations; new id only for a genuinely new concept):
${existing.map((c) => `- ${c.id}: ${c.label}`).join("\n")}

`
    : "";
  return `You are building a TYPED knowledge ontology from a project wiki. Extract the key concepts and the typed relationships between them.

PROJECT: ${projectName}

WIKI:
${wikiContent}

${existingBlock}---

Output ONLY valid JSON (no markdown fences, no prose) shaped exactly as:
{
  "concepts": [{ "id": "kebab-case-id", "label": "짧은 라벨", "kind": "decision|component|tech|problem|goal" }],
  "relations": [{ "source": "concept-id", "target": "concept-id", "type": "supports|extends|depends_on|part_of|contradicts|similar", "note": "한 줄 근거" }]
}

Rules:
- 8–20 concepts, only ones actually present in the wiki.
- Reuse an existing id above when the concept persists (stable identifiers); a new id only for a new concept.
- Every relation's source/target MUST be an existing concept id.
- Relation type meaning: supports(근거 제공) / extends(확장·발전) / depends_on(의존) / part_of(구성요소) / contradicts(대체·반박) / similar(유사).
- Korean or English labels are both fine. Output JSON only.`;
}

/**
 * Parse + validate the model's ontology JSON. Tolerant of fences/prose. Drops
 * relations that reference unknown concept ids or have an invalid type, so the
 * graph is always internally consistent.
 */
export function parseOntology(raw: string): Ontology {
  const data = extractJson<{ concepts?: unknown; relations?: unknown }>(raw);
  const concepts: OntologyConcept[] = Array.isArray(data.concepts)
    ? (data.concepts as OntologyConcept[])
        .filter((c) => c && typeof c.id === "string" && typeof c.label === "string")
        .map((c) => ({ id: c.id, label: c.label, kind: typeof c.kind === "string" ? c.kind : "" }))
    : [];

  const ids = new Set(concepts.map((c) => c.id));
  const relSet = new Set<string>();
  const relations: OntologyRelation[] = Array.isArray(data.relations)
    ? (data.relations as OntologyRelation[])
        .filter(
          (r) =>
            r &&
            ids.has(r.source) &&
            ids.has(r.target) &&
            r.source !== r.target &&
            (RELATION_TYPES as readonly string[]).includes(r.type),
        )
        .filter((r) => {
          const k = `${r.source}|${r.target}|${r.type}`;
          if (relSet.has(k)) return false;
          relSet.add(k);
          return true;
        })
        .map((r) => ({ source: r.source, target: r.target, type: r.type, note: r.note }))
    : [];

  return { concepts, relations };
}

/** Convert a stored ontology into the shared GraphNode/GraphEdge shape. */
export function ontologyToGraph(onto: Ontology): ProjectGraphData {
  const degree = new Map<string, number>();
  for (const r of onto.relations) {
    degree.set(r.source, (degree.get(r.source) ?? 0) + 1);
    degree.set(r.target, (degree.get(r.target) ?? 0) + 1);
  }

  const nodes: GraphNode[] = onto.concepts.map((c) => ({
    id: `concept:${c.id}`,
    type: "concept",
    label: c.label,
    size: Math.max(5, Math.min(18, 5 + (degree.get(c.id) ?? 0) * 2)),
    color: KIND_COLOR[c.kind] ?? "#6b7280",
    kind: c.kind,
  }));

  const edges: GraphEdge[] = onto.relations.map((r, i) => ({
    id: `rel:${i}:${r.source}:${r.target}`,
    source: `concept:${r.source}`,
    target: `concept:${r.target}`,
    weight: 2,
    type: "relation",
    label: REL_LABEL[r.type],
    color: REL_COLOR[r.type],
  }));

  return { nodes, edges };
}

export interface OntologyResult {
  projectPath: string;
  ontology: Ontology;
  graph: ProjectGraphData;
  model: string;
  generatedAt: number;
  /** Wiki's last generation time — the source this ontology was extracted from. */
  wikiGeneratedAt: number | null;
  /** True when the wiki has been regenerated since this ontology was built. */
  isStale: boolean;
}

function rowToResult(
  row: { projectPath: string; content: string; model: string; generatedAt: number },
  wikiGeneratedAt: number | null,
): OntologyResult {
  const ontology = JSON.parse(row.content) as Ontology;
  return {
    projectPath: row.projectPath,
    ontology,
    graph: ontologyToGraph(ontology),
    model: row.model,
    generatedAt: row.generatedAt,
    wikiGeneratedAt,
    isStale: isDerivedStale(row.generatedAt, wikiGeneratedAt),
  };
}

/** Stored ontology for a project, or null if not yet generated. */
export function getOntology(projectPath: string, db: Db = getDb()): OntologyResult | null {
  const row = db
    .select()
    .from(projectOntology)
    .where(sql`${projectOntology.projectPath} = ${projectPath}`)
    .get();
  return row ? rowToResult(row, getWikiGeneratedAt(projectPath, db)) : null;
}

/**
 * Extract (or re-extract) the typed ontology from a project's wiki via the
 * agent, store it, and return the graph. Requires the wiki to exist — the wiki
 * is the distilled source the ontology is built from.
 */
export async function generateOntology(
  projectPath: string,
  model: ClaudeModel = "claude-opus-4-8",
  db: Db = getDb(),
): Promise<OntologyResult> {
  const wiki = db
    .select({ content: projectWiki.content })
    .from(projectWiki)
    .where(sql`${projectWiki.projectPath} = ${projectPath}`)
    .get();
  if (!wiki) {
    throw new Error("위키가 없습니다 — 온톨로지는 위키에서 추출하므로 위키를 먼저 생성하세요.");
  }

  const projectName = projectPath.split("/").filter(Boolean).pop() ?? projectPath;
  // Reuse prior concept ids for persisting concepts (identifier stability).
  const existing = getOntology(projectPath, db)?.ontology.concepts.map((c) => ({ id: c.id, label: c.label })) ?? [];
  const raw = await callClaude(buildPrompt(projectName, wiki.content, existing), model);
  const ontology = parseOntology(raw);
  const now = Date.now();

  db.insert(projectOntology)
    .values({ projectPath, content: JSON.stringify(ontology), model, generatedAt: now })
    .onConflictDoUpdate({
      target: projectOntology.projectPath,
      set: {
        content: JSON.stringify(ontology),
        model,
        generatedAt: now,
        updatedAt: sql`(unixepoch() * 1000)`,
      },
    })
    .run();

  const wikiGeneratedAt = getWikiGeneratedAt(projectPath, db);
  return {
    projectPath,
    ontology,
    graph: ontologyToGraph(ontology),
    model,
    generatedAt: now,
    wikiGeneratedAt,
    isStale: isDerivedStale(now, wikiGeneratedAt),
  };
}
