import fs from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { projectWiki } from "../../db/schema";
import { getNotes, type AtomicNote } from "./notes";

/**
 * Materialize the brain as an Obsidian vault — markdown files the user OWNS and
 * can open/edit/version in Obsidian (the brain otherwise lives only in SQLite).
 * Atomic notes are already Obsidian-shaped (kebab slug + inline [[slug]] links),
 * so one file per note + an index.md (Karpathy catalog) + the wiki page is all
 * it takes; the [[slug]] links resolve by filename.
 */

export interface VaultFile {
  name: string;
  content: string;
}

/** Notes are kebab-case already; strip anything that can't be a safe filename. */
function safeName(slug: string): string {
  return slug.replace(/[^a-zA-Z0-9._-]/g, "-");
}

export function notesToVaultFiles(
  notes: AtomicNote[],
  wikiContent: string | null,
  projectName: string,
): VaultFile[] {
  const files: VaultFile[] = notes.map((n) => ({
    name: `${safeName(n.slug)}.md`,
    content: `# ${n.title}\n\n${n.content.trim()}\n`,
  }));
  const index = notes.map((n) => `- [[${safeName(n.slug)}|${n.title}]]`).join("\n");
  files.push({ name: "index.md", content: `# ${projectName} — 기억 인덱스\n\n${index || "(노트 없음)"}\n` });
  if (wikiContent && wikiContent.trim()) {
    files.push({ name: "_wiki.md", content: `# ${projectName} Wiki\n\n${wikiContent.trim()}\n` });
  }
  return files;
}

/**
 * Write the vault to `<projectPath>/.haetae/vault/`. Point Obsidian at that
 * folder. Requires atomic notes to exist (the vault's substrate).
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
  const files = notesToVaultFiles(notesResult.notes, wiki?.content ?? null, projectName);

  const dir = path.join(projectPath, ".haetae", "vault");
  await fs.mkdir(dir, { recursive: true });
  await Promise.all(files.map((f) => fs.writeFile(path.join(dir, f.name), f.content, "utf8")));
  return { dir, files: files.length };
}
