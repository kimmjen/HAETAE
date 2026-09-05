import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { projectTopics, projectWiki } from "../../db/schema";
import { callClaude, extractJson, DEFAULT_MODEL, type ClaudeModel } from "./claude-cli";
import { isDerivedStale, getWikiGeneratedAt } from "./staleness";
import { isDegenerateWikiOutput } from "./wiki";
import { selectSources, type BrainSource } from "./ask";

/**
 * Topic pages — the multi-page wiki layer (#386). The core wiki stays the
 * single reconciled index; each topic page goes deeper on ONE theme than the
 * core wiki can. Depth comes from raw conversation excerpts (the ask-layer
 * retrieval), because the core wiki is already a compression — re-synthesizing
 * from it alone would add words, not detail.
 */

export interface TopicPage {
  /** kebab-case id — stable across runs (same rule as note slugs). */
  slug: string;
  title: string;
  /** Full markdown page. */
  content: string;
  /** Unix ms when THIS page was last (re)generated. */
  generatedAt: number;
}

/** Pages planned per run — bounds LLM cost per generation cycle. */
export const MAX_TOPICS_PER_RUN = 3;
/** Total pages per project — past this the planner may only update. */
export const MAX_TOPICS_TOTAL = 12;

export interface PlannedTopic {
  slug: string;
  title: string;
  /** Retrieval query used to pull conversation evidence for this page. */
  query: string;
}

export function buildPlanPrompt(
  projectName: string,
  wikiContent: string,
  existing: Array<{ slug: string; title: string }>,
): string {
  const atCap = existing.length >= MAX_TOPICS_TOTAL;
  const existingBlock = existing.length
    ? `EXISTING TOPIC PAGES (reuse the SAME slug to update a page — keep identifiers stable; mint a new slug only for a genuinely new theme${atCap ? "; the page cap is reached, so ONLY update existing slugs" : ""}):
${existing.map((t) => `- ${t.slug}: ${t.title}`).join("\n")}

`
    : "";
  return `You are planning TOPIC PAGES for the project wiki of "${projectName}". A topic page is a deep-dive on ONE cross-cutting theme (a subsystem, a hard-won mechanism, a recurring problem area) that deserves more depth than the core wiki gives it.

CORE WIKI:
${wikiContent}

${existingBlock}---

Pick the ${MAX_TOPICS_PER_RUN} themes MOST worth a deep page right now — themes where the wiki clearly compresses away detail. Prefer updating an existing page when its theme moved. Output ONLY valid JSON (no fences, no prose):
{
  "topics": [{ "slug": "kebab-case-slug", "title": "짧은 제목", "query": "retrieval keywords for finding the relevant conversations" }]
}

Rules:
- At most ${MAX_TOPICS_PER_RUN} topics. Fewer is fine; an empty list means nothing needs a page.
- slug: kebab-case, stable — reuse an existing slug to update that page.
- query: 3-8 concrete keywords (mixed Korean/English as the project uses) that would match the source conversations.
- Output JSON only.`;
}

/**
 * Parse + validate the planner's JSON. Drops malformed entries, dedups slugs
 * (first wins), clamps to MAX_TOPICS_PER_RUN, and — when the total page cap is
 * reached — drops any slug that would create a NEW page.
 */
export function parsePlan(raw: string, existingSlugs: string[] = []): PlannedTopic[] {
  const data = extractJson<{ topics?: unknown }>(raw);
  if (!Array.isArray(data.topics)) return [];

  const existing = new Set(existingSlugs);
  const atCap = existing.size >= MAX_TOPICS_TOTAL;
  const seen = new Set<string>();
  const out: PlannedTopic[] = [];
  for (const t of data.topics as PlannedTopic[]) {
    if (
      !t ||
      typeof t.slug !== "string" || !t.slug.trim() ||
      typeof t.title !== "string" || !t.title.trim() ||
      typeof t.query !== "string" || !t.query.trim()
    ) {
      continue;
    }
    const slug = t.slug.trim();
    if (seen.has(slug)) continue;
    if (atCap && !existing.has(slug)) continue;
    seen.add(slug);
    out.push({ slug, title: t.title.trim(), query: t.query.trim() });
    if (out.length >= MAX_TOPICS_PER_RUN) break;
  }
  return out;
}

export function buildPagePrompt(
  projectName: string,
  topic: PlannedTopic,
  wikiContent: string,
  existingContent: string | null,
  sources: BrainSource[],
): string {
  const excerpts = sources.length
    ? sources
        .map((s) => {
          const date = new Date(s.ts).toISOString().slice(0, 10);
          return `[${s.tag}] (${date}, session ${s.sessionId})\n${s.snippet}`;
        })
        .join("\n\n---\n\n")
    : "(관련 대화 발췌 없음 — 위키 내용만으로 작성)";

  const existingBlock = existingContent
    ? `=== CURRENT PAGE (update this — preserve detail the new evidence does not contradict) ===
${existingContent}

`
    : "";

  return `You are writing a deep-dive TOPIC PAGE "${topic.title}" for the project "${projectName}". The core wiki compresses this theme — your page is where the full detail lives.

=== CORE WIKI (context — do NOT restate it wholesale; go DEEPER on this one theme) ===
${wikiContent}

${existingBlock}=== CONVERSATION EXCERPTS (primary evidence — this is where the depth comes from) ===
${excerpts}

---

Write the full markdown page:
- Start with "# ${topic.title}".
- Structure freely with ## subsections as the theme demands (history, mechanism, failure modes, current state…).
- Keep concrete identifiers verbatim: issue/PR numbers (#N), file paths, dates, metric numbers, error messages.
- Only facts supported by the wiki or the excerpts — never invent. Korean/English mixed.
- Output ONLY the markdown — no preamble.`;
}

/**
 * Pure: fold this run's regenerated pages into the existing set. Updated slugs
 * are replaced in place (original order kept), new slugs append. Pages not in
 * this run persist untouched — a run only refreshes what it planned.
 */
export function mergeTopics(existing: TopicPage[], updates: TopicPage[]): TopicPage[] {
  const bySlug = new Map(updates.map((u) => [u.slug, u]));
  const merged = existing.map((t) => bySlug.get(t.slug) ?? t);
  const existingSlugs = new Set(existing.map((t) => t.slug));
  for (const u of updates) if (!existingSlugs.has(u.slug)) merged.push(u);
  return merged;
}

export interface TopicsResult {
  projectPath: string;
  topics: TopicPage[];
  model: string;
  generatedAt: number;
  wikiGeneratedAt: number | null;
  isStale: boolean;
  /** Pages regenerated in THIS run (empty on reads). */
  updatedSlugs: string[];
}

function rowToResult(
  row: { projectPath: string; content: string; model: string; generatedAt: number },
  wikiGeneratedAt: number | null,
): TopicsResult {
  const topics = (JSON.parse(row.content) as { topics: TopicPage[] }).topics;
  return {
    projectPath: row.projectPath,
    topics,
    model: row.model,
    generatedAt: row.generatedAt,
    wikiGeneratedAt,
    isStale: isDerivedStale(row.generatedAt, wikiGeneratedAt),
    updatedSlugs: [],
  };
}

/** Stored topic pages for a project, or null if never generated. */
export function getTopics(projectPath: string, db: Db = getDb()): TopicsResult | null {
  const row = db
    .select()
    .from(projectTopics)
    .where(sql`${projectTopics.projectPath} = ${projectPath}`)
    .get();
  return row ? rowToResult(row, getWikiGeneratedAt(projectPath, db)) : null;
}

/**
 * Plan + (re)generate topic pages: one plan call picks ≤MAX_TOPICS_PER_RUN
 * themes, then each planned page is synthesized from the wiki + retrieved
 * conversation excerpts. A degenerate page output skips that page (the stored
 * version survives) instead of failing the run — same protection philosophy
 * as the wiki's #374 guard, applied per page.
 */
export async function generateTopics(
  projectPath: string,
  model: ClaudeModel = DEFAULT_MODEL,
  db: Db = getDb(),
): Promise<TopicsResult> {
  const wiki = db
    .select({ content: projectWiki.content })
    .from(projectWiki)
    .where(sql`${projectWiki.projectPath} = ${projectPath}`)
    .get();
  if (!wiki) {
    throw new Error("위키가 없습니다 — 토픽 페이지는 위키를 심화하는 레이어이므로 위키를 먼저 생성하세요.");
  }

  const projectName = projectPath.split("/").filter(Boolean).pop() ?? projectPath;
  const existing = getTopics(projectPath, db)?.topics ?? [];
  const existingIndex = existing.map((t) => ({ slug: t.slug, title: t.title }));

  const planRaw = await callClaude(buildPlanPrompt(projectName, wiki.content, existingIndex), model);
  const plan = parsePlan(planRaw, existingIndex.map((t) => t.slug));

  const updates: TopicPage[] = [];
  let caught: unknown = null;
  try {
    for (const topic of plan) {
      const prior = existing.find((t) => t.slug === topic.slug) ?? null;
      const sources = selectSources(db, projectPath, `${topic.title} ${topic.query}`);
      const content = await callClaude(
        buildPagePrompt(projectName, topic, wiki.content, prior?.content ?? null, sources),
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
    db.insert(projectTopics)
      .values({ projectPath, content: JSON.stringify({ topics }), model, generatedAt: now })
      .onConflictDoUpdate({
        target: projectTopics.projectPath,
        set: {
          content: JSON.stringify({ topics }),
          model,
          generatedAt: now,
          updatedAt: sql`(unixepoch() * 1000)`,
        },
      })
      .run();
  }
  if (caught && updates.length === 0) throw caught;

  const wikiGeneratedAt = getWikiGeneratedAt(projectPath, db);
  return {
    projectPath,
    topics,
    model,
    generatedAt: now,
    wikiGeneratedAt,
    isStale: isDerivedStale(now, wikiGeneratedAt),
    updatedSlugs: updates.map((u) => u.slug),
  };
}
