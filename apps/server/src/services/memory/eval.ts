import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { sessionMessages, projectWiki, projectEval, projectEvalHistory, userProfile } from "../../db/schema";
import { callClaude, extractJson, type ClaudeModel } from "./claude-cli";
import { isDerivedStale, getWikiGeneratedAt } from "./staleness";

const SAMPLE_BUDGET = 40_000; // chars of recent conversation sampled for the audit
const ISSUE_TYPES = ["accuracy", "staleness", "gap", "vibe"] as const;
const SEVERITIES = ["high", "medium", "low"] as const;

export interface EvalIssue {
  type: (typeof ISSUE_TYPES)[number];
  severity: (typeof SEVERITIES)[number];
  detail: string;
  fix: string;
}
export interface EvalReport {
  score: number; // 0–100 overall trust
  summary: string;
  issues: EvalIssue[];
}

function recentSample(db: Db, projectPath: string): string {
  const rows = db
    .select({ ts: sessionMessages.ts, type: sessionMessages.type, content: sessionMessages.content })
    .from(sessionMessages)
    .where(
      sql`${sessionMessages.projectPath} = ${projectPath}
        AND ${sessionMessages.content} IS NOT NULL
        AND ${sessionMessages.content} != ''
        AND ${sessionMessages.type} IN ('user', 'assistant')
        AND ${sessionMessages.isCompactSummary} = 0`,
    )
    .orderBy(sql`${sessionMessages.ts} DESC`)
    .all() as Array<{ ts: number; type: string; content: string }>;

  const picked: string[] = [];
  let used = 0;
  for (const r of rows) {
    const body = r.content.length > 1500 ? r.content.slice(0, 1500) + "…" : r.content;
    const line = `[${r.type}] ${body}`;
    if (picked.length > 0 && used + line.length > SAMPLE_BUDGET) break;
    picked.push(line);
    used += line.length;
    if (used >= SAMPLE_BUDGET) break;
  }
  return picked.reverse().join("\n---\n"); // chronological for reading
}

export function buildPrompt(wiki: string, sample: string, voice: string | null): string {
  return `You are a SKEPTICAL auditor of a project wiki — the AI's "second brain" for this project. Judge whether it stays accurate, current, and aligned with the user's intent/voice.

=== WIKI ===
${wiki}

=== RECENT CONVERSATION (sample, chronological) ===
${sample || "(없음)"}

=== USER VOICE / PREFERENCES ===
${voice ?? "(프로필 없음)"}

---

Output ONLY JSON:
{
  "score": 0-100,
  "summary": "한 줄 총평",
  "issues": [{ "type": "accuracy|staleness|gap|vibe", "severity": "high|medium|low", "detail": "무엇이 문제", "fix": "어떻게 고칠지" }]
}

issue 의미: accuracy(위키 주장이 대화와 모순되거나 근거 없음) / staleness(최근 대화의 변화가 위키에 미반영) / gap(중요한데 위키에 빠짐) / vibe(사용자 의도·voice·우선순위와 어긋남). 근거 기반만, 0–5개. score=정확+최신+의도부합 종합 신뢰도. JSON만 출력.`;
}

/** Parse + validate the auditor's JSON. score clamped, bad issues dropped. */
export function parseEval(raw: string): EvalReport {
  const d = extractJson<{ score?: unknown; summary?: unknown; issues?: unknown }>(raw);
  const score = Math.max(0, Math.min(100, Math.round(Number(d.score) || 0)));
  const summary = typeof d.summary === "string" ? d.summary : "";
  const issues: EvalIssue[] = Array.isArray(d.issues)
    ? (d.issues as EvalIssue[])
        .filter(
          (i) =>
            i &&
            (ISSUE_TYPES as readonly string[]).includes(i.type) &&
            (SEVERITIES as readonly string[]).includes(i.severity) &&
            typeof i.detail === "string",
        )
        .slice(0, 5)
        .map((i) => ({ type: i.type, severity: i.severity, detail: i.detail, fix: typeof i.fix === "string" ? i.fix : "" }))
    : [];
  return { score, summary, issues };
}

// Issue types that map to concrete, evidence-checkable wiki edits. "vibe" is a
// subjective voice/intent judgment, not a fact to reconcile, so it is excluded
// from the wiki-regeneration feedback (it would push the wiki to over-fit tone).
const ACTIONABLE_TYPES = new Set<EvalIssue["type"]>(["accuracy", "gap", "staleness"]);
const ACTIONABLE_SEVERITIES = new Set<EvalIssue["severity"]>(["high", "medium"]);

/**
 * Format an eval report's actionable issues as correction hints for the next
 * wiki regeneration — what turns the audit from diagnostic into self-correcting.
 * Only high/medium accuracy·gap·staleness issues survive; subjective vibe and
 * low-severity noise are dropped. Empty string when nothing qualifies.
 */
export function evalCorrectionHints(report: EvalReport, max = 6): string {
  return report.issues
    .filter((i) => ACTIONABLE_TYPES.has(i.type) && ACTIONABLE_SEVERITIES.has(i.severity))
    .slice(0, max)
    .map((i) => `- [${i.type}/${i.severity}] ${i.detail}${i.fix ? ` → 고칠 방향: ${i.fix}` : ""}`)
    .join("\n");
}

export interface EvalResult {
  projectPath: string;
  report: EvalReport;
  model: string;
  generatedAt: number;
  /** Wiki's last generation time — the source this audit judged. */
  wikiGeneratedAt: number | null;
  /** True when the wiki has been regenerated since this audit ran. */
  isStale: boolean;
}

export function getEval(projectPath: string, db: Db = getDb()): EvalResult | null {
  const row = db.select().from(projectEval).where(sql`${projectEval.projectPath} = ${projectPath}`).get();
  if (!row) return null;
  const wikiGeneratedAt = getWikiGeneratedAt(projectPath, db);
  return {
    projectPath: row.projectPath,
    report: JSON.parse(row.content) as EvalReport,
    model: row.model,
    generatedAt: row.generatedAt,
    wikiGeneratedAt,
    isStale: isDerivedStale(row.generatedAt, wikiGeneratedAt),
  };
}

/** Audit a project's wiki against its conversations + the user's voice. */
export async function generateEval(
  projectPath: string,
  model: ClaudeModel = "claude-opus-4-8",
  db: Db = getDb(),
): Promise<EvalResult> {
  const wiki = db
    .select({ content: projectWiki.content })
    .from(projectWiki)
    .where(sql`${projectWiki.projectPath} = ${projectPath}`)
    .get();
  if (!wiki) throw new Error("위키가 없습니다 — eval은 위키를 검증하므로 먼저 생성하세요.");

  const sample = recentSample(db, projectPath);
  const voice = db.select({ content: userProfile.content }).from(userProfile).where(sql`${userProfile.scope} = 'global'`).get();

  const report = parseEval(await callClaude(buildPrompt(wiki.content, sample, voice?.content ?? null), model));
  const now = Date.now();

  db.insert(projectEval)
    .values({ projectPath, content: JSON.stringify(report), score: report.score, model, generatedAt: now })
    .onConflictDoUpdate({
      target: projectEval.projectPath,
      set: { content: JSON.stringify(report), score: report.score, model, generatedAt: now, updatedAt: sql`(unixepoch() * 1000)` },
    })
    .run();
  // Append to the score trend (project_eval only keeps the latest).
  db.insert(projectEvalHistory).values({ projectPath, score: report.score, model, generatedAt: now }).run();

  const wikiGeneratedAt = getWikiGeneratedAt(projectPath, db);
  return { projectPath, report, model, generatedAt: now, wikiGeneratedAt, isStale: isDerivedStale(now, wikiGeneratedAt) };
}

export interface EvalScorePoint {
  score: number;
  generatedAt: number;
}

/**
 * Eval score trend for a project, oldest→newest (chart order). Capped to the
 * most recent `limit` runs so the series stays bounded as the loop runs.
 */
export function getEvalHistory(projectPath: string, db: Db = getDb(), limit = 50): EvalScorePoint[] {
  const rows = db
    .select({ score: projectEvalHistory.score, generatedAt: projectEvalHistory.generatedAt })
    .from(projectEvalHistory)
    .where(sql`${projectEvalHistory.projectPath} = ${projectPath}`)
    .orderBy(sql`${projectEvalHistory.generatedAt} DESC`)
    .limit(limit)
    .all();
  return rows.reverse();
}
