import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { sessionMessages } from "../../db/schema";
import { listProjectWikis, generateProjectWiki, type WikiModel } from "./wiki";
import { cascadeStaleDerived } from "./cascade";

/**
 * Automatic wiki updates — the piece that actually closes the self-improving
 * loop. Without this the wiki only updates when a human clicks "갱신".
 *
 * Because each generation spends the user's Claude quota (claude --print), the
 * scheduler is conservative and OPT-IN. Guards, in order:
 *   1. Opt-in: only runs when HAETAE_WIKI_AUTO=true (default off).
 *   2. Existing wikis only: auto never bootstraps a brand-new wiki (a first
 *      generation on a large backlog could be many chunks) — that stays manual.
 *   3. Settle debounce: a project is eligible only after it has been quiet for
 *      `debounceMs` (no new real messages) so we never summarize mid-session.
 *   4. Per-project cooldown: at most one auto-generation per project per
 *      `cooldownMs`.
 *   5. Single-flight: one generation at a time, one project per tick — no
 *      concurrent subprocess fan-out.
 */

export interface AutoWikiConfig {
  /** A project must have had no new messages for this long to be eligible. */
  debounceMs: number;
  /** Minimum gap between auto-generations of the same project. */
  cooldownMs: number;
}

export interface AutoCandidate {
  projectPath: string;
  model: WikiModel;
  pendingMessages: number;
  generatedAt: number;
}

const DEFAULT_INTERVAL_MS = 300_000; // 5 min
const DEFAULT_DEBOUNCE_MS = 600_000; // 10 min quiet
const DEFAULT_COOLDOWN_MS = 1_800_000; // 30 min per project

const VALID_MODELS = new Set<string>([
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
]);

/** Newest real (user/assistant, non-compact) message ts for a project, or 0. */
export function newestMessageTs(db: Db, projectPath: string): number {
  const row = db
    .select({ ts: sql<number>`max(${sessionMessages.ts})` })
    .from(sessionMessages)
    .where(
      sql`${sessionMessages.projectPath} = ${projectPath}
        AND ${sessionMessages.content} IS NOT NULL
        AND ${sessionMessages.content} != ''
        AND ${sessionMessages.type} IN ('user', 'assistant')
        AND ${sessionMessages.isCompactSummary} = 0`,
    )
    .get();
  return row?.ts ?? 0;
}

/**
 * Pure selection: which existing wikis are eligible for an automatic
 * incremental update right now. Returned stalest-first (oldest generatedAt) so
 * the caller folds the most-behind project. Exported for testing.
 */
export function selectAutoWikiCandidates(
  db: Db,
  nowMs: number,
  cfg: AutoWikiConfig,
): AutoCandidate[] {
  const out: AutoCandidate[] = [];
  for (const w of listProjectWikis(db)) {
    if (!w.isStale) continue; // nothing new to fold
    if (nowMs - w.generatedAt < cfg.cooldownMs) continue; // cooldown not elapsed
    const newest = newestMessageTs(db, w.projectPath);
    if (newest === 0 || nowMs - newest < cfg.debounceMs) continue; // not settled
    const model = (VALID_MODELS.has(w.model) ? w.model : "claude-opus-4-7") as WikiModel;
    out.push({
      projectPath: w.projectPath,
      model,
      pendingMessages: w.pendingMessages,
      generatedAt: w.generatedAt,
    });
  }
  out.sort((a, b) => a.generatedAt - b.generatedAt);
  return out;
}

export interface AutoWikiRuntimeConfig {
  /** opt-in via HAETAE_WIKI_AUTO=true. */
  enabled: boolean;
  intervalMs: number;
  debounceMs: number;
  cooldownMs: number;
}

/** Single source for the scheduler config (env) — used by the loop AND its status. */
export function readAutoWikiConfig(): AutoWikiRuntimeConfig {
  return {
    enabled: process.env.HAETAE_WIKI_AUTO === "true",
    intervalMs: Number(process.env.HAETAE_WIKI_AUTO_INTERVAL_MS ?? DEFAULT_INTERVAL_MS),
    debounceMs: Number(process.env.HAETAE_WIKI_AUTO_DEBOUNCE_MS ?? DEFAULT_DEBOUNCE_MS),
    cooldownMs: Number(process.env.HAETAE_WIKI_AUTO_COOLDOWN_MS ?? DEFAULT_COOLDOWN_MS),
  };
}

export interface AutoWikiStatus {
  config: AutoWikiRuntimeConfig;
  /** Projects the loop would fold next (stale, settled, past cooldown), stalest-first. */
  candidates: Array<{ projectPath: string; pendingMessages: number; generatedAt: number }>;
}

/**
 * Read-only view of the self-improving loop: is it armed, and which projects are
 * eligible for an auto-update right now. Surfaced in the UI so the (otherwise
 * invisible, env-gated) scheduler is observable. No LLM, no writes.
 */
export function getAutoWikiStatus(db: Db = getDb()): AutoWikiStatus {
  const config = readAutoWikiConfig();
  const candidates = selectAutoWikiCandidates(db, Date.now(), {
    debounceMs: config.debounceMs,
    cooldownMs: config.cooldownMs,
  }).map((c) => ({ projectPath: c.projectPath, pendingMessages: c.pendingMessages, generatedAt: c.generatedAt }));
  return { config, candidates };
}

interface Logger {
  info: (obj: unknown, msg: string) => void;
  error: (obj: unknown, msg: string) => void;
}

/**
 * Start the background scheduler. Returns the interval handle (unref'd) or null
 * when auto-update is disabled. Re-entrant ticks are skipped via single-flight.
 */
export function startWikiAutoScheduler(db: Db = getDb(), log?: Logger): NodeJS.Timeout | null {
  const config = readAutoWikiConfig();
  if (!config.enabled) return null;

  const intervalMs = config.intervalMs;
  const cfg: AutoWikiConfig = { debounceMs: config.debounceMs, cooldownMs: config.cooldownMs };

  let inFlight = false;
  const tick = async () => {
    if (inFlight) return;
    const candidates = selectAutoWikiCandidates(db, Date.now(), cfg);
    if (candidates.length === 0) return;
    const target = candidates[0];
    inFlight = true;
    try {
      const r = await generateProjectWiki(target.projectPath, target.model, db);
      log?.info(
        { projectPath: target.projectPath, folded: r.foldedMessages, pending: r.pendingMessages },
        "auto wiki updated",
      );
      // The wiki just moved — refresh any derived layers it made stale so the
      // staleness badges self-heal instead of waiting for a manual click.
      const refreshed = await cascadeStaleDerived(target.projectPath, target.model, db, log);
      if (refreshed.length > 0) {
        log?.info({ projectPath: target.projectPath, refreshed }, "auto derived layers refreshed");
      }
    } catch (err) {
      log?.error({ err, projectPath: target.projectPath }, "auto wiki update failed");
    } finally {
      inFlight = false;
    }
  };

  const handle = setInterval(tick, intervalMs);
  handle.unref();
  log?.info({ intervalMs, ...cfg }, "wiki auto-scheduler armed");
  return handle;
}
