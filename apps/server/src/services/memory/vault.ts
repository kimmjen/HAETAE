import fs from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { projectWiki } from "../../db/schema";
import { getNotes, type AtomicNote } from "./notes";
import { getOntology, type Ontology } from "./ontology";
import { getLinks, type NoteConceptLink } from "./links";
import { getTopics, type TopicPage } from "./topics";

/**
 * Materialize the brain as an Obsidian vault — markdown files the user OWNS and
 * can open/edit/version in Obsidian (the brain otherwise lives only in SQLite).
 * Atomic notes are already Obsidian-shaped (kebab slug + inline [[slug]] links),
 * so one file per note + an index.md (Karpathy catalog) + the wiki page is all
 * it takes; the [[slug]] links resolve by filename.
 *
 * The derived layers ride along too so the exported vault is the WHOLE brain,
 * not just notes: ontology concepts (`concept-<id>.md`, cross-linked by typed
 * relations), note↔concept links (a "관련 개념" footer on notes + "관련 노트" on
 * concepts, so Obsidian's own graph shows the cross-layer edges), and the
 * multi-page topic wiki (`topic-<slug>.md`).
 */

export interface VaultFile {
  name: string;
  content: string;
}

/** Optional derived layers folded into the vault alongside notes + wiki. */
export interface VaultExtras {
  ontology?: Ontology;
  links?: NoteConceptLink[];
  topics?: TopicPage[];
}

/** Notes are kebab-case already; strip anything that can't be a safe filename. */
function safeName(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export function notesToVaultFiles(
  notes: AtomicNote[],
  wikiContent: string | null,
  projectName: string,
  extras: VaultExtras = {},
): VaultFile[] {
  const { ontology, links = [], topics = [] } = extras;
  const noteSlugs = new Set(notes.map((n) => n.slug));
  const noteBySlug = new Map(notes.map((n) => [n.slug, n]));
  const conceptById = new Map((ontology?.concepts ?? []).map((c) => [c.id, c]));

  // Only keep links whose endpoints both exist, then index both directions.
  const conceptsOfNote = new Map<string, string[]>();
  const notesOfConcept = new Map<string, string[]>();
  for (const l of links) {
    if (!noteSlugs.has(l.noteSlug) || !conceptById.has(l.conceptId)) continue;
    (conceptsOfNote.get(l.noteSlug) ?? conceptsOfNote.set(l.noteSlug, []).get(l.noteSlug)!).push(l.conceptId);
    (notesOfConcept.get(l.conceptId) ?? notesOfConcept.set(l.conceptId, []).get(l.conceptId)!).push(l.noteSlug);
  }

  const files: VaultFile[] = [];

  // Note files — body verbatim, plus a "관련 개념" footer when linked so the
  // cross-layer edge is visible from the note side in the Obsidian graph.
  for (const n of notes) {
    let body = `# ${n.title}\n\n${n.content.trim()}\n`;
    const cids = conceptsOfNote.get(n.slug) ?? [];
    if (cids.length) {
      const lines = cids
        .map((id) => `- [[concept-${safeName(id)}|${conceptById.get(id)!.label}]]`)
        .join("\n");
      body += `\n## 관련 개념\n\n${lines}\n`;
    }
    files.push({ name: `${safeName(n.slug)}.md`, content: body });
  }

  // Concept files — typed relations to other concepts + the notes about them.
  for (const c of ontology?.concepts ?? []) {
    let body = `# ${c.label}\n\n> 개념 (${c.kind || "concept"})\n`;
    const rels = (ontology?.relations ?? [])
      .map((r) => {
        const otherId = r.source === c.id ? r.target : r.target === c.id ? r.source : null;
        if (!otherId) return null;
        const other = conceptById.get(otherId);
        if (!other) return null;
        return `- ${r.type} → [[concept-${safeName(otherId)}|${other.label}]]${r.note ? ` — ${r.note}` : ""}`;
      })
      .filter((l): l is string => l !== null);
    if (rels.length) body += `\n## 관계\n\n${rels.join("\n")}\n`;
    const ns = notesOfConcept.get(c.id) ?? [];
    if (ns.length) {
      const lines = ns.map((s) => `- [[${safeName(s)}|${noteBySlug.get(s)!.title}]]`).join("\n");
      body += `\n## 관련 노트\n\n${lines}\n`;
    }
    files.push({ name: `concept-${safeName(c.id)}.md`, content: body });
  }

  // Topic pages — already full markdown starting with "# title".
  for (const t of topics) {
    const content = t.content.trim();
    files.push({ name: `topic-${safeName(t.slug)}.md`, content: `${content}\n` });
  }

  // index.md — a Karpathy catalog across every layer.
  const noteIndex = notes.map((n) => `- [[${safeName(n.slug)}|${n.title}]]`).join("\n");
  let indexBody = `# ${projectName} — 기억 인덱스\n\n## 노트\n\n${noteIndex || "(노트 없음)"}\n`;
  if (ontology && ontology.concepts.length) {
    const ci = ontology.concepts.map((c) => `- [[concept-${safeName(c.id)}|${c.label}]]`).join("\n");
    indexBody += `\n## 개념\n\n${ci}\n`;
  }
  if (topics.length) {
    const ti = topics.map((t) => `- [[topic-${safeName(t.slug)}|${t.title}]]`).join("\n");
    indexBody += `\n## 토픽 페이지\n\n${ti}\n`;
  }
  files.push({ name: "index.md", content: indexBody });

  if (wikiContent && wikiContent.trim()) {
    files.push({ name: "_wiki.md", content: `# ${projectName} Wiki\n\n${wikiContent.trim()}\n` });
  }
  return files;
}

/**
 * Write the vault to `<projectPath>/.haetae/vault/`. Point Obsidian at that
 * folder. Requires atomic notes to exist (the vault's substrate); ontology,
 * links, and topics are folded in when present but never required.
 */
export async function exportVault(
  projectPath: string,
  db: Db = getDb(),
): Promise<{ dir: string; files: number }> {
  const notesResult = getNotes(projectPath, db);
  if (!notesResult || notesResult.notes.length === 0) {
    throw new Error("내보낼 노트가 없습니다 — 노트를 먼저 생성하세요.");
  }
  const wiki = db
    .select({ content: projectWiki.content })
    .from(projectWiki)
    .where(sql`${projectWiki.projectPath} = ${projectPath}`)
    .get();
  const projectName = projectPath.split("/").filter(Boolean).pop() ?? projectPath;
  const files = notesToVaultFiles(notesResult.notes, wiki?.content ?? null, projectName, {
    ontology: getOntology(projectPath, db)?.ontology,
    links: getLinks(projectPath, db)?.links,
    topics: getTopics(projectPath, db)?.topics,
  });

  const dir = path.join(projectPath, ".haetae", "vault");
  await fs.mkdir(dir, { recursive: true });
  await Promise.all(files.map((f) => fs.writeFile(path.join(dir, f.name), f.content, "utf8")));
  return { dir, files: files.length };
}

/**
 * Keep an EXISTING vault fresh after the brain regenerates — but never create
 * one behind the user's back. Mirrors the cascade's "existing only" rule: a
 * vault is a deliberate export, so the freshness loop only re-runs it when the
 * user already has one. DB-only + fs, no LLM. Never throws (fold/scheduler
 * callers treat it as best-effort).
 */
export async function reExportVaultIfExists(
  projectPath: string,
  db: Db = getDb(),
): Promise<{ exported: boolean; files?: number }> {
  try {
    await fs.access(path.join(projectPath, ".haetae", "vault"));
  } catch {
    return { exported: false }; // no vault → don't materialize one unprompted
  }
  try {
    const { files } = await exportVault(projectPath, db);
    return { exported: true, files };
  } catch {
    return { exported: false }; // notes gone / write failure — non-fatal
  }
}
