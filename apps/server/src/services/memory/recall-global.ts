import { getDb, type Db } from "../../db";
import { getAllNotes } from "./notes";
import { selectRelevantNotesGlobal, type GlobalNote } from "./recall";
import { type ClaudeModel } from "./claude-cli";

/**
 * Every project's atomic notes as one flat cross-project index — the substrate
 * the recall_global MCP tool selects from. DB-only (no LLM), so it's testable
 * apart from the agent selection step.
 */
export function collectGlobalNotes(db: Db = getDb()): GlobalNote[] {
  return getAllNotes(db).flatMap(({ projectPath, notes }) => {
    const projectName = projectPath.split("/").filter(Boolean).pop() ?? projectPath;
    return notes.map((note) => ({ projectPath, projectName, note }));
  });
}

/**
 * Meaning-based recall across ALL projects' notes — the web surface for
 * recall_global. Returns the agent-ranked selection (empty if no notes exist).
 */
export async function recallGlobalNotes(
  query: string,
  model: ClaudeModel,
  db: Db = getDb(),
): Promise<GlobalNote[]> {
  const all = collectGlobalNotes(db);
  if (all.length === 0) return [];
  return selectRelevantNotesGlobal(all, query, model);
}
