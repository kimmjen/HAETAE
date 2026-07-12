import { getDb, type Db } from "../../db";
import type { ClaudeModel } from "./claude-cli";
import { getNotes, generateNotes } from "./notes";
import { getOntology, generateOntology } from "./ontology";
import { getEval, generateEval } from "./eval";

/**
 * Closes the self-improving loop one step further than auto-wiki: once the wiki
 * is regenerated its derived layers (atomic notes / ontology / eval) go stale —
 * the staleness badges flip on. This cascade regenerates them automatically so
 * the badge moves from "낡음 표시" to "스스로 고침".
 *
 * Two deliberate constraints, mirroring auto-wiki's conservatism:
 *   1. Existing only — a layer the user never generated is NOT bootstrapped
 *      behind their back (that stays a manual, explicit action).
 *   2. Stale only — a layer already current with the wiki is skipped.
 */

export type DerivedLayer = "notes" | "ontology" | "eval";

/** Fixed regeneration order: cheap structural layers before the audit. */
const ORDER: DerivedLayer[] = ["notes", "ontology", "eval"];

/**
 * Which derived layers exist AND are now stale for a project. Pure read — no
 * LLM calls — so it is cheap and testable on its own.
 */
export function selectStaleDerived(projectPath: string, db: Db = getDb()): DerivedLayer[] {
  const present: Record<DerivedLayer, { isStale: boolean } | null> = {
    notes: getNotes(projectPath, db),
    ontology: getOntology(projectPath, db),
    eval: getEval(projectPath, db),
  };
  return ORDER.filter((layer) => present[layer]?.isStale === true);
}

interface Logger {
  info: (obj: unknown, msg: string) => void;
  error: (obj: unknown, msg: string) => void;
}

/**
 * Regenerate every stale-and-existing derived layer, sequentially. Each layer
 * is independent: a failure is logged and the remaining layers still run.
 * Returns the layers that were successfully refreshed.
 */
export async function cascadeStaleDerived(
  projectPath: string,
  model: ClaudeModel,
  db: Db = getDb(),
  log?: Logger,
): Promise<DerivedLayer[]> {
  const refreshed: DerivedLayer[] = [];
  for (const layer of selectStaleDerived(projectPath, db)) {
    try {
      if (layer === "notes") await generateNotes(projectPath, model, db);
      else if (layer === "ontology") await generateOntology(projectPath, model, db);
      else await generateEval(projectPath, model, db);
      refreshed.push(layer);
    } catch (err) {
      log?.error({ err, projectPath, layer }, "cascade regenerate failed");
    }
  }
  return refreshed;
}
