import { getDb, type Db } from "../../db";
import { listProjectWikis } from "./wiki";
import { getNotes, extractWikilinks, type AtomicNote } from "./notes";
import { getOntology } from "./ontology";
import { getEval } from "./eval";

export interface BrainIndexProject {
  projectPath: string;
  /** Display label — basename of the path. */
  label: string;
  wikiGeneratedAt: number;
  wikiSummary: string | null;
  /** Latest self-eval trust score (0–100), or null if never evaluated. */
  evalScore: number | null;
  /** Wiki has unfolded messages past its watermark. */
  wikiStale: boolean;
  noteCount: number;
  conceptCount: number;
}

export interface BrainIndexNote {
  projectPath: string;
  slug: string;
  title: string;
  /** Bidirectional wikilink count within the project — hub ranking. */
  degree: number;
  /** Notes were split from an older wiki than the current one. */
  stale: boolean;
}

export interface BrainIndexConcept {
  projectPath: string;
  id: string;
  label: string;
  /** decision | component | tech | problem | goal */
  kind: string;
  stale: boolean;
}

export interface BrainIndex {
  projects: BrainIndexProject[];
  notes: BrainIndexNote[];
  concepts: BrainIndexConcept[];
}

function labelOf(projectPath: string): string {
  return projectPath.split("/").filter(Boolean).pop() ?? projectPath;
}

/** Bidirectional wikilink degree within a project's note set (same hub ranking
 *  the persistent memory index uses — most-connected notes are the entry points). */
function noteDegrees(notes: AtomicNote[]): Map<string, number> {
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
 * Cross-project knowledge catalog — every project's wiki meta + atomic notes +
 * ontology concepts flattened into one index for the "한번에 확인" surface.
 * DB-only (no LLM). The wiki is the source notes/ontology are split from, so
 * listProjectWikis() already covers every knowledge-bearing project.
 */
export function buildBrainIndex(db: Db = getDb()): BrainIndex {
  const wikis = listProjectWikis(db);
  const projects: BrainIndexProject[] = [];
  const notes: BrainIndexNote[] = [];
  const concepts: BrainIndexConcept[] = [];

  for (const w of wikis) {
    const { projectPath } = w;
    const noteRes = getNotes(projectPath, db);
    const ontologyRes = getOntology(projectPath, db);
    const evalRes = getEval(projectPath, db);

    const projNotes = noteRes?.notes ?? [];
    const deg = noteDegrees(projNotes);
    for (const n of projNotes) {
      notes.push({
        projectPath,
        slug: n.slug,
        title: n.title,
        degree: deg.get(n.slug) ?? 0,
        stale: noteRes?.isStale ?? false,
      });
    }

    const projConcepts = ontologyRes?.ontology.concepts ?? [];
    for (const c of projConcepts) {
      concepts.push({
        projectPath,
        id: c.id,
        label: c.label,
        kind: c.kind,
        stale: ontologyRes?.isStale ?? false,
      });
    }

    projects.push({
      projectPath,
      label: labelOf(projectPath),
      wikiGeneratedAt: w.generatedAt,
      wikiSummary: w.summary,
      evalScore: evalRes?.report.score ?? null,
      wikiStale: w.isStale,
      noteCount: projNotes.length,
      conceptCount: projConcepts.length,
    });
  }

  notes.sort((a, b) => b.degree - a.degree);
  return { projects, notes, concepts };
}
