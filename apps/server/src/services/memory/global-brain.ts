import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { globalWiki, globalTopics, globalEval, projectWiki, userProfile } from "../../db/schema";
import { callClaude, DEFAULT_MODEL, type ClaudeModel } from "./claude-cli";
import { isDerivedStale } from "./staleness";
import { isDegenerateWikiOutput, listProjectWikis } from "./wiki";
import { parsePlan, mergeTopics, MAX_TOPICS_PER_RUN, MAX_TOPICS_TOTAL, type TopicPage } from "./topics";
import { parseEval, type EvalReport } from "./eval";

/**
 * Global "brain" — the cross-project layer synthesized ABOVE the per-project
 * wikis. Its source is the set of BUILT project wikis (they already compressed
 * the raw sessions), not the sessions again — the same "derive from the layer
 * below" pattern that notes/ontology/eval follow within a project, and that
 * voice (user_profile) follows across projects. All three global layers are
 * singletons keyed by scope='global'.
 *
 *   global wiki   ← synthesized from every project wiki
 *   global topics ← cross-cutting deep pages, derived from the global wiki
 *   global eval   ← skeptical audit of the global wiki
 */

/** Global synthesis rewrites the whole overview — needs the long wiki timeout. */
const GLOBAL_WIKI_TIMEOUT_MS = 600_000;
/** Total chars of project-wiki content fed into a global synthesis. */
const GLOBAL_SOURCE_BUDGET = 120_000;
/** Head slice taken from each project wiki (its Overview/Key-Features carry the
 *  essence; the full body would blow the budget across many projects). */
const PER_PROJECT_CAP = 10_000;

function projectName(p: string): string {
  return p.split("/").filter(Boolean).pop() ?? p;
}

// --- Source digest (pure) -----------------------------------------------------

export interface ProjectWikiLite {
  projectPath: string;
  content: string;
  summary: string | null;
  generatedAt: number;
}

export interface GlobalDigest {
  /** Detailed head-slice blocks for the projects that fit the budget. */
  sourceBlock: string;
  /** One line per project (name: summary) — covers EVERY project. */
  indexBlock: string;
  /** How many projects contributed a detailed block. */
  covered: number;
  /** Total projects available. */
  total: number;
}

/**
 * Pure: build the source material for a global synthesis from the per-project
 * wikis (most-recently-updated first, as `listProjectWikis` returns them). Each
 * project contributes a budgeted head slice to `sourceBlock` until the total
 * budget is hit; EVERY project always appears in the one-line `indexBlock` so
 * nothing is silently dropped from the portfolio map. Always includes at least
 * one detailed block even if the first wiki alone exceeds the budget.
 */
export function digestProjectWikis(
  wikis: ProjectWikiLite[],
  budget = GLOBAL_SOURCE_BUDGET,
  cap = PER_PROJECT_CAP,
): GlobalDigest {
  const blocks: string[] = [];
  let used = 0;
  let covered = 0;
  for (const w of wikis) {
    const head = w.content.length > cap ? w.content.slice(0, cap) + "\n…(truncated)" : w.content;
    const block = `## [${projectName(w.projectPath)}]\n${head.trim()}`;
    if (blocks.length > 0 && used + block.length > budget) break;
    blocks.push(block);
    used += block.length;
    covered += 1;
    if (used >= budget) break;
  }
  const indexBlock = wikis
    .map((w) => `- ${projectName(w.projectPath)}: ${(w.summary ?? "").trim() || "(요약 없음)"}`)
    .join("\n");
  return { sourceBlock: blocks.join("\n\n---\n\n"), indexBlock, covered, total: wikis.length };
}

// --- Global wiki --------------------------------------------------------------

const GLOBAL_STRUCTURE = `# 글로벌 브레인 / Global Brain

## 개요 / Overview
## 프로젝트 지도 / Project Map
## 교차 주제 / Cross-Cutting Themes
## 프로젝트 관계 / Connections
## 다음 초점 / Where to Focus`;

export function buildGlobalWikiPrompt(digest: GlobalDigest, existingWiki: string): string {
  const indexNote =
    digest.covered < digest.total
      ? ` — 상세 본문은 최근 갱신순 ${digest.covered}/${digest.total}개만, 나머지는 아래 인덱스로 커버`
      : "";
  const existingBlock = existingWiki.trim()
    ? `=== CURRENT GLOBAL BRAIN (source of truth — reconcile with the wikis below, don't discard) ===
${existingWiki.trim()}

`
    : "";
  return `You are synthesizing a PORTFOLIO-LEVEL overview across a developer's projects. Each project already has its own wiki (its "second brain"); your job is the CROSS-PROJECT picture no single project wiki can see.

${existingBlock}=== PROJECT WIKIS (digest, most-recently-updated first${indexNote}) ===
${digest.sourceBlock}

=== ALL PROJECTS INDEX (every project, one line) ===
${digest.indexBlock}

---

Write the global brain in Markdown with this exact section structure:

${GLOBAL_STRUCTURE}

Rules:
- 프로젝트 지도 / Project Map: one line per project — what it is + current status. Cover EVERY project in the index.
- 교차 주제 / Cross-Cutting Themes: tech, patterns, or problems recurring ACROSS projects — the value a single project wiki cannot give.
- 프로젝트 관계 / Connections: which projects relate (shared code, concepts, data, or lineage) and how.
- Keep concrete identifiers verbatim (project names, tech, issue refs). Only facts from the project wikis — never invent. Korean/English mixed.
- Output ONLY the markdown — no preamble.`;
}

export interface GlobalWikiResult {
  content: string;
  model: string;
  projectsCovered: number;
  generatedAt: number;
  /** Latest project-wiki generatedAt across the workspace — the source this
   *  overview was built from; drives staleness. */
  sourceGeneratedAt: number | null;
  isStale: boolean;
}

/** Newest project-wiki generation time across all projects (null = no wikis). */
export function getMaxProjectWikiGeneratedAt(db: Db = getDb()): number | null {
  const row = db.select({ m: sql<number>`max(${projectWiki.generatedAt})` }).from(projectWiki).get();
  return row?.m ?? null;
}

/** The global wiki is stale when any project wiki is newer than it — a project
 *  brain moved after the portfolio overview was last synthesized. */
function globalWikiStale(generatedAt: number, sourceGeneratedAt: number | null): boolean {
  return sourceGeneratedAt !== null && sourceGeneratedAt > generatedAt;
}

export function getGlobalWiki(db: Db = getDb()): GlobalWikiResult | null {
  const row = db.select().from(globalWiki).where(sql`${globalWiki.scope} = 'global'`).get();
  if (!row) return null;
  const sourceGeneratedAt = getMaxProjectWikiGeneratedAt(db);
  return {
    content: row.content,
    model: row.model,
    projectsCovered: row.projectsCovered,
    generatedAt: row.generatedAt,
    sourceGeneratedAt,
    isStale: globalWikiStale(row.generatedAt, sourceGeneratedAt),
  };
}

export async function generateGlobalWiki(
  model: ClaudeModel = DEFAULT_MODEL,
  db: Db = getDb(),
): Promise<GlobalWikiResult> {
  const wikis = listProjectWikis(db);
  if (wikis.length === 0) {
    throw new Error(
      "빌드된 프로젝트 위키가 없습니다 — 글로벌 브레인은 프로젝트 위키들을 종합하므로 먼저 프로젝트 위키를 생성하세요.",
    );
  }
  const digest = digestProjectWikis(
    wikis.map((w) => ({ projectPath: w.projectPath, content: w.content, summary: w.summary, generatedAt: w.generatedAt })),
  );
  const existing = getGlobalWiki(db);
  const content = await callClaude(buildGlobalWikiPrompt(digest, existing?.content ?? ""), model, GLOBAL_WIKI_TIMEOUT_MS);
  if (isDegenerateWikiOutput(content, existing?.content ?? null)) {
    throw new Error(
      `글로벌 위키 합성 결과가 비정상적으로 짧습니다 (${content.trim().length}자` +
        (existing ? `, 기존 ${existing.content.length}자` : "") +
        ") — 저장하지 않고 중단. LLM 응답 실패로 보이며 다음 갱신에서 재시도됩니다.",
    );
  }
  const now = Date.now();
  db.insert(globalWiki)
    .values({ scope: "global", content, model, projectsCovered: digest.covered, generatedAt: now })
    .onConflictDoUpdate({
      target: globalWiki.scope,
      set: { content, model, projectsCovered: digest.covered, generatedAt: now, updatedAt: sql`(unixepoch() * 1000)` },
    })
    .run();
  const sourceGeneratedAt = getMaxProjectWikiGeneratedAt(db);
  return {
    content,
    model,
    projectsCovered: digest.covered,
    generatedAt: now,
    sourceGeneratedAt,
    isStale: globalWikiStale(now, sourceGeneratedAt),
  };
}

/** The global wiki's last generation time — the source derived global layers
 *  (topics/eval) are judged stale against. */
export function getGlobalWikiGeneratedAt(db: Db = getDb()): number | null {
  const row = db
    .select({ g: globalWiki.generatedAt })
    .from(globalWiki)
    .where(sql`${globalWiki.scope} = 'global'`)
    .get();
  return row?.g ?? null;
}

// --- Global topics ------------------------------------------------------------

export function buildGlobalPlanPrompt(
  globalWikiContent: string,
  existing: Array<{ slug: string; title: string }>,
): string {
  const atCap = existing.length >= MAX_TOPICS_TOTAL;
  const existingBlock = existing.length
    ? `EXISTING TOPIC PAGES (reuse the SAME slug to update a page — keep identifiers stable; mint a new slug only for a genuinely new theme${atCap ? "; the page cap is reached, so ONLY update existing slugs" : ""}):
${existing.map((t) => `- ${t.slug}: ${t.title}`).join("\n")}

`
    : "";
  return `You are planning cross-project TOPIC PAGES for a developer's GLOBAL brain — deep-dives on themes that span MULTIPLE projects (a shared architecture, a recurring problem, a technology used across the portfolio, the lineage between projects). Not single-project themes — those belong to each project's own wiki.

GLOBAL BRAIN (the portfolio overview):
${globalWikiContent}

${existingBlock}---

Pick the ${MAX_TOPICS_PER_RUN} CROSS-PROJECT themes most worth a deep page right now. Output ONLY valid JSON (no fences, no prose):
{
  "topics": [{ "slug": "kebab-case-slug", "title": "짧은 제목", "query": "keywords describing the theme" }]
}

Rules:
- At most ${MAX_TOPICS_PER_RUN} topics. Fewer is fine; an empty list means nothing needs a page.
- Each theme must span 2+ projects — reject single-project topics.
- slug: kebab-case, stable — reuse an existing slug to update that page.
- Output JSON only.`;
}

export function buildGlobalPagePrompt(
  topic: { slug: string; title: string; query: string },
  globalWikiContent: string,
  existingContent: string | null,
  sourceBlock: string,
): string {
  const existingBlock = existingContent
    ? `=== CURRENT PAGE (update this — preserve detail the project wikis do not contradict) ===
${existingContent}

`
    : "";
  return `You are writing a cross-project deep-dive TOPIC PAGE "${topic.title}" for a developer's GLOBAL brain. This theme spans multiple projects; go DEEPER than the portfolio overview can.

=== GLOBAL BRAIN (context — do NOT restate it wholesale) ===
${globalWikiContent}

${existingBlock}=== PROJECT WIKIS (primary evidence — the depth comes from how this theme appears across these projects) ===
${sourceBlock}

---

Write the full markdown page:
- Start with "# ${topic.title}".
- Structure freely with ## subsections as the theme demands, but keep the CROSS-PROJECT angle — how it manifests, differs, or connects across projects.
- Keep concrete identifiers verbatim: project names, issue/PR numbers (#N), file paths, dates, metrics.
- Only facts supported by the global brain or the project wikis — never invent. Korean/English mixed.
- Output ONLY the markdown — no preamble.`;
}

export interface GlobalTopicsResult {
  topics: TopicPage[];
  model: string;
  generatedAt: number;
  /** Global wiki generatedAt — the source these pages derive from. */
  wikiGeneratedAt: number | null;
  isStale: boolean;
  /** Pages regenerated in THIS run (empty on reads). */
  updatedSlugs: string[];
}

export function getGlobalTopics(db: Db = getDb()): GlobalTopicsResult | null {
  const row = db.select().from(globalTopics).where(sql`${globalTopics.scope} = 'global'`).get();
  if (!row) return null;
  let topics: TopicPage[];
  try {
    topics = (JSON.parse(row.content) as { topics?: TopicPage[] }).topics ?? [];
  } catch {
    return null; // corrupt blob — treat as not generated rather than 500
  }
  const wikiGeneratedAt = getGlobalWikiGeneratedAt(db);
  return {
    topics,
    model: row.model,
    generatedAt: row.generatedAt,
    wikiGeneratedAt,
    isStale: isDerivedStale(row.generatedAt, wikiGeneratedAt),
    updatedSlugs: [],
  };
}

export async function generateGlobalTopics(
  model: ClaudeModel = DEFAULT_MODEL,
  db: Db = getDb(),
): Promise<GlobalTopicsResult> {
  const gw = getGlobalWiki(db);
  if (!gw) {
    throw new Error("글로벌 위키가 없습니다 — 글로벌 토픽은 글로벌 위키를 심화하므로 먼저 글로벌 위키를 생성하세요.");
  }
  const wikis = listProjectWikis(db);
  const digest = digestProjectWikis(
    wikis.map((w) => ({ projectPath: w.projectPath, content: w.content, summary: w.summary, generatedAt: w.generatedAt })),
  );
  const existing = getGlobalTopics(db)?.topics ?? [];
  const existingIndex = existing.map((t) => ({ slug: t.slug, title: t.title }));

  const planRaw = await callClaude(buildGlobalPlanPrompt(gw.content, existingIndex), model);
  const plan = parsePlan(planRaw, existingIndex.map((t) => t.slug));

  const updates: TopicPage[] = [];
  let caught: unknown = null;
  try {
    for (const topic of plan) {
      const prior = existing.find((t) => t.slug === topic.slug) ?? null;
      const content = await callClaude(
        buildGlobalPagePrompt(topic, gw.content, prior?.content ?? null, digest.sourceBlock),
        model,
      );
      if (isDegenerateWikiOutput(content, prior?.content ?? null)) continue;
      updates.push({ slug: topic.slug, title: topic.title, content, generatedAt: Date.now() });
    }
  } catch (err) {
    // A page's LLM call failed — don't discard the pages that already completed.
    caught = err;
  }

  const topics = mergeTopics(existing, updates);
  const now = Date.now();
  // Persist whatever completed. On a total failure (nothing salvaged) skip the
  // write and surface the error rather than rewriting the set for nothing.
  if (updates.length > 0 || !caught) {
    db.insert(globalTopics)
      .values({ scope: "global", content: JSON.stringify({ topics }), model, generatedAt: now })
      .onConflictDoUpdate({
        target: globalTopics.scope,
        set: { content: JSON.stringify({ topics }), model, generatedAt: now, updatedAt: sql`(unixepoch() * 1000)` },
      })
      .run();
  }
  if (caught && updates.length === 0) throw caught;

  const wikiGeneratedAt = getGlobalWikiGeneratedAt(db);
  return {
    topics,
    model,
    generatedAt: now,
    wikiGeneratedAt,
    isStale: isDerivedStale(now, wikiGeneratedAt),
    updatedSlugs: updates.map((u) => u.slug),
  };
}

// --- Global eval --------------------------------------------------------------

export function buildGlobalEvalPrompt(globalWikiContent: string, indexBlock: string, voice: string | null): string {
  return `You are a SKEPTICAL auditor of a developer's GLOBAL brain — the portfolio-level overview across all their projects. Judge whether it stays accurate against the projects it claims to summarize, current, and aligned with the user's intent.

=== GLOBAL BRAIN ===
${globalWikiContent}

=== PROJECTS INDEX (what actually exists — the ground truth the overview must match) ===
${indexBlock}

=== USER VOICE / PREFERENCES ===
${voice ?? "(프로필 없음)"}

---

Output ONLY JSON:
{
  "score": 0-100,
  "summary": "한 줄 총평",
  "issues": [{ "type": "accuracy|staleness|gap|vibe", "severity": "high|medium|low", "detail": "무엇이 문제", "fix": "어떻게 고칠지" }]
}

issue 의미: accuracy(전역 위키 주장이 프로젝트 인덱스와 모순되거나 근거 없음) / staleness(프로젝트 변화가 전역 위키에 미반영) / gap(중요한 프로젝트·교차주제가 빠짐) / vibe(사용자 의도와 어긋남). 근거 기반만, 0–5개. JSON만 출력.`;
}

export interface GlobalEvalResult {
  report: EvalReport;
  model: string;
  generatedAt: number;
  wikiGeneratedAt: number | null;
  isStale: boolean;
}

export function getGlobalEval(db: Db = getDb()): GlobalEvalResult | null {
  const row = db.select().from(globalEval).where(sql`${globalEval.scope} = 'global'`).get();
  if (!row) return null;
  let report: EvalReport;
  try {
    report = JSON.parse(row.content) as EvalReport;
  } catch {
    return null; // corrupt blob — treat as not generated rather than 500
  }
  const wikiGeneratedAt = getGlobalWikiGeneratedAt(db);
  return {
    report,
    model: row.model,
    generatedAt: row.generatedAt,
    wikiGeneratedAt,
    isStale: isDerivedStale(row.generatedAt, wikiGeneratedAt),
  };
}

export async function generateGlobalEval(
  model: ClaudeModel = DEFAULT_MODEL,
  db: Db = getDb(),
): Promise<GlobalEvalResult> {
  const gw = getGlobalWiki(db);
  if (!gw) {
    throw new Error("글로벌 위키가 없습니다 — eval은 글로벌 위키를 검증하므로 먼저 생성하세요.");
  }
  const wikis = listProjectWikis(db);
  const digest = digestProjectWikis(
    wikis.map((w) => ({ projectPath: w.projectPath, content: w.content, summary: w.summary, generatedAt: w.generatedAt })),
  );
  const voice = db
    .select({ content: userProfile.content })
    .from(userProfile)
    .where(sql`${userProfile.scope} = 'global'`)
    .get();

  const report = parseEval(await callClaude(buildGlobalEvalPrompt(gw.content, digest.indexBlock, voice?.content ?? null), model));
  const now = Date.now();
  db.insert(globalEval)
    .values({ scope: "global", content: JSON.stringify(report), score: report.score, model, generatedAt: now })
    .onConflictDoUpdate({
      target: globalEval.scope,
      set: { content: JSON.stringify(report), score: report.score, model, generatedAt: now, updatedAt: sql`(unixepoch() * 1000)` },
    })
    .run();

  const wikiGeneratedAt = getGlobalWikiGeneratedAt(db);
  return { report, model, generatedAt: now, wikiGeneratedAt, isStale: isDerivedStale(now, wikiGeneratedAt) };
}
