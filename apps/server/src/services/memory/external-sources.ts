import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { externalSources, type ExternalSourceRow } from "../../db/schema";

/**
 * External knowledge sources (#390): user-dropped URLs absorbed into a
 * project's brain. Provenance stays structural — these live in their own
 * table and reach the wiki only as a tagged EXTERNAL SOURCES block, so
 * conversation-derived facts and external-document claims never blur.
 */

/** Extracted text stored per source — keeps the wiki prompt bounded. */
const CONTENT_MAX_CHARS = 50_000;
/** Raw response read cap — a URL is user input, not a trusted size. */
const FETCH_MAX_BYTES = 2_000_000;
const FETCH_TIMEOUT_MS = 20_000;

/** Pure: first <title> text, entity-decoded; null when absent. */
export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const t = m ? decodeEntities(m[1]).trim() : "";
  return t || null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/**
 * Pure: HTML → readable plain text. Drops script/style/head/nav/footer
 * blocks, strips tags, decodes common entities, collapses whitespace.
 */
// ponytail: regex stripper, not a readability engine — fine for docs/articles;
// swap in a real extractor if boilerplate-heavy pages become the norm.
export function extractText(html: string, cap = CONTENT_MAX_CHARS): string {
  const text = html
    .replace(/<(script|style|head|nav|footer|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split("\n")
    .map((l) => decodeEntities(l).replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return text.length > cap ? text.slice(0, cap) : text;
}

/**
 * Fetch a URL and extract title + text. http/https only — a local personal
 * console fetching a user-typed URL, so protocol validation is the guard.
 */
export async function fetchExternalContent(
  url: string,
): Promise<{ title: string | null; content: string }> {
  const parsed = new URL(url); // throws on garbage
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`http/https URL만 지원합니다: ${parsed.protocol}`);
  }
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "text/html, text/plain;q=0.9, */*;q=0.1" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`fetch 실패: HTTP ${res.status}`);

  const raw = (await res.text()).slice(0, FETCH_MAX_BYTES);
  const type = res.headers.get("content-type") ?? "";
  const isHtml = type.includes("html") || /^\s*</.test(raw);
  return {
    title: isHtml ? extractTitle(raw) : null,
    content: isHtml ? extractText(raw) : raw.slice(0, CONTENT_MAX_CHARS).trim(),
  };
}

/** Fetch + upsert (same URL re-added replaces the old fetch). */
export async function addExternalSource(
  projectPath: string,
  url: string,
  db: Db = getDb(),
): Promise<ExternalSourceRow> {
  const { title, content } = await fetchExternalContent(url);
  if (!content) throw new Error("본문을 추출하지 못했습니다 — 빈 페이지이거나 텍스트가 없는 문서입니다.");
  const now = Date.now();
  db.insert(externalSources)
    .values({ projectPath, url, title: title ?? url, content, fetchedAt: now })
    .onConflictDoUpdate({
      target: [externalSources.projectPath, externalSources.url],
      set: { title: title ?? url, content, fetchedAt: now },
    })
    .run();
  return db
    .select()
    .from(externalSources)
    .where(sql`${externalSources.projectPath} = ${projectPath} AND ${externalSources.url} = ${url}`)
    .get() as ExternalSourceRow;
}

export function listExternalSources(projectPath: string, db: Db = getDb()): ExternalSourceRow[] {
  return db
    .select()
    .from(externalSources)
    .where(sql`${externalSources.projectPath} = ${projectPath}`)
    .orderBy(sql`${externalSources.fetchedAt} DESC`)
    .all();
}

/** Row delete (DB only — nothing on disk). Returns false when not found. */
export function removeExternalSource(projectPath: string, id: number, db: Db = getDb()): boolean {
  const res = db
    .delete(externalSources)
    .where(sql`${externalSources.id} = ${id} AND ${externalSources.projectPath} = ${projectPath}`)
    .run();
  return res.changes > 0;
}

/** Char budget for the EXTERNAL SOURCES block inside the wiki prompt. */
const SOURCES_PROMPT_BUDGET = 20_000;

/**
 * Pure: build the tagged [E1]/[E2]… block for the wiki synthesis prompt.
 * Newest first, whole sources until the budget is hit (the first source is
 * always included, truncated if it alone overflows). "" when none.
 */
export function buildSourcesBlock(
  rows: Array<{ url: string; title: string; content: string }>,
  budget = SOURCES_PROMPT_BUDGET,
): string {
  const parts: string[] = [];
  let used = 0;
  for (const [i, r] of rows.entries()) {
    const header = `[E${i + 1}] ${r.title} (${r.url})`;
    let block = `${header}\n${r.content}`;
    if (parts.length === 0 && block.length > budget) {
      block = block.slice(0, budget) + "\n…(truncated)";
    } else if (used + block.length > budget) {
      break;
    }
    parts.push(block);
    used += block.length;
  }
  return parts.join("\n\n---\n\n");
}
