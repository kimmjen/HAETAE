import { type Db } from "../db";
import { type ClaudeModel } from "../services/memory/claude-cli";
import { getNotes, getAllNotes } from "../services/memory/notes";
import {
  selectRelevantNotesSemantic,
  selectRelevantNotesGlobal,
  buildNotesBlock,
  type GlobalNote,
} from "../services/memory/recall";
import { askProjectBrain } from "../services/memory/ask";

/**
 * On-demand "depth" behind the CLAUDE.md memory index: pull the project's
 * atomic notes most relevant to `query` by meaning. Reuses the recall selector
 * (#281, Karpathy index-selection) — returns the note bodies as citable text.
 */
export async function recallNotes(
  projectPath: string,
  query: string,
  model: ClaudeModel,
  db: Db,
): Promise<string> {
  const notes = getNotes(projectPath, db);
  if (!notes || notes.notes.length === 0) {
    return "이 프로젝트에는 아직 원자 노트가 없습니다 — HAETAE 에서 노트를 먼저 생성하세요.";
  }
  const scored = await selectRelevantNotesSemantic(notes.notes, query, model);
  if (scored.length === 0) return `"${query}" 에 의미상 관련된 노트를 찾지 못했습니다.`;
  return buildNotesBlock(scored).block;
}

/**
 * Cross-project recall — ask the WHOLE brain (every project's notes), not one
 * project. Useful when the answer may live in another project's memory ("어디서
 * 이 결정을 했더라?"). Returns matched notes grouped per project.
 */
export async function recallGlobal(query: string, model: ClaudeModel, db: Db): Promise<string> {
  const all: GlobalNote[] = getAllNotes(db).flatMap(({ projectPath, notes }) => {
    const projectName = projectPath.split("/").filter(Boolean).pop() ?? projectPath;
    return notes.map((note) => ({ projectPath, projectName, note }));
  });
  if (all.length === 0) return "아직 노트가 있는 프로젝트가 없습니다 — HAETAE 에서 노트를 먼저 생성하세요.";
  const picked = await selectRelevantNotesGlobal(all, query, model);
  if (picked.length === 0) return `"${query}" 에 의미상 관련된 노트를 전 프로젝트에서 찾지 못했습니다.`;
  return picked
    .map((gn, i) => `[N${i + 1}] (${gn.projectName}) ${gn.note.title}\n${gn.note.content}`)
    .join("\n\n---\n\n");
}

/** Ask the project's second brain; returns a grounded answer + source tags. */
export async function askBrain(
  projectPath: string,
  question: string,
  model: ClaudeModel,
  db: Db,
): Promise<string> {
  const r = await askProjectBrain(projectPath, question, model, db);
  if (r.sources.length === 0) return r.answer;
  const cites = r.sources.map((s) => `[${s.tag}] session ${s.sessionId}`).join("\n");
  return `${r.answer}\n\n---\n출처:\n${cites}`;
}
