import { type AtomicNote, extractWikilinks } from "./notes";
import { questionKeywords } from "./ask";
import { callClaude, extractJson, type ClaudeModel } from "./claude-cli";

/**
 * Bounded recall over the atomic-notes graph (no embeddings, no deps).
 *
 * Karpathy's LLM-wiki retrieval, not vector search: the agent reads an INDEX of
 * note titles and picks the relevant ones BY MEANING, then we expand a couple of
 * wikilink hops and cap by count + chars. Prompt size stays independent of corpus
 * size, and "인증" finds the OAuth note even though that exact word never appears.
 * A keyword seeder (literal term match) remains as a no-LLM fallback.
 */

const MAX_NOTES = 12;
const NOTES_BUDGET = 40_000; // total chars of note content fed to the agent
const MAX_HOPS = 2;
/** Score decay per hop so seeds outrank their neighbours. */
const HOP_DECAY = 0.4;

export interface ScoredNote {
  note: AtomicNote;
  score: number;
  /** 0 = keyword seed, 1..MAX_HOPS = pulled in by traversal. */
  hop: number;
}

/** Keyword-hit score for one note (title weighted higher than body). */
export function scoreNote(note: AtomicNote, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const title = note.title.toLowerCase();
  const body = note.content.toLowerCase();
  let score = 0;
  for (const k of keywords) {
    score += (title.split(k).length - 1) * 3; // title hits weigh 3x
    score += body.split(k).length - 1;
  }
  return score;
}

interface SelectOpts {
  maxNotes?: number;
  budget?: number;
  maxHops?: number;
}

/**
 * Shared tail of every recall strategy: from a set of seed notes, BFS up to
 * maxHops along [[wikilinks]] (visited set prevents cycles/re-adds, hop score
 * decays so seeds rank first), then rank and cap by count + chars.
 */
function expandFromSeeds(
  seeds: Map<string, ScoredNote>,
  notes: AtomicNote[],
  opts: SelectOpts,
): ScoredNote[] {
  if (seeds.size === 0) return [];
  const maxNotes = opts.maxNotes ?? MAX_NOTES;
  const budget = opts.budget ?? NOTES_BUDGET;
  const maxHops = opts.maxHops ?? MAX_HOPS;
  const bySlug = new Map(notes.map((n) => [n.slug, n]));
  const scored = seeds;

  let frontier = [...scored.keys()];
  for (let hop = 1; hop <= maxHops && frontier.length > 0; hop++) {
    const next: string[] = [];
    for (const slug of frontier) {
      const note = bySlug.get(slug);
      if (!note) continue;
      for (const target of extractWikilinks(note.content)) {
        const tgt = bySlug.get(target);
        if (!tgt || scored.has(target)) continue; // dangling or already in
        const seedScore = scored.get(slug)?.score ?? 1;
        scored.set(target, { note: tgt, score: seedScore * Math.pow(HOP_DECAY, hop), hop });
        next.push(target);
      }
    }
    frontier = next;
  }

  const ranked = [...scored.values()].sort((a, b) => b.score - a.score || a.hop - b.hop);
  const out: ScoredNote[] = [];
  let used = 0;
  for (const sn of ranked) {
    if (out.length >= maxNotes) break;
    const len = sn.note.content.length;
    if (out.length > 0 && used + len > budget) continue; // skip oversized, keep filling
    out.push(sn);
    used += len;
  }
  return out;
}

/**
 * Keyword seeding (literal term match) — the no-LLM fallback. Seeds notes whose
 * title/content hit question keywords, then expands + budgets. Empty when no
 * keyword matches (caller falls back to the full wiki).
 */
export function selectRelevantNotes(
  notes: AtomicNote[],
  question: string,
  opts: SelectOpts = {},
): ScoredNote[] {
  const keywords = questionKeywords(question);
  const seeds = new Map<string, ScoredNote>();
  for (const note of notes) {
    const s = scoreNote(note, keywords);
    if (s > 0) seeds.set(note.slug, { note, score: s, hop: 0 });
  }
  return expandFromSeeds(seeds, notes, opts);
}

/** Catalog the notes for the agent to scan: one `[slug] title — preview` line each. */
export function buildNoteIndex(notes: AtomicNote[]): string {
  return notes
    .map((n) => {
      const preview = n.content.replace(/\s+/g, " ").trim().slice(0, 100);
      return `- [${n.slug}] ${n.title}${preview ? ` — ${preview}` : ""}`;
    })
    .join("\n");
}

/** Parse the agent's `{"slugs":[...]}` reply into known slugs, in order, deduped. */
export function parseSelectedSlugs(raw: string, validSlugs: string[]): string[] {
  let data: { slugs?: unknown };
  try {
    data = extractJson<{ slugs?: unknown }>(raw);
  } catch {
    return []; // no JSON in the reply → no selection
  }
  if (!Array.isArray(data.slugs)) return [];
  const valid = new Set(validSlugs);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of data.slugs) {
    if (typeof s !== "string") continue;
    const slug = s.trim();
    if (!slug || !valid.has(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}

function buildSelectPrompt(noteIndex: string, question: string): string {
  return `You are selecting which atomic notes are relevant to answer a QUESTION — by MEANING, not exact word overlap (e.g. a question about "인증/auth" should match an OAuth/keychain note even if the word "인증" never appears).

NOTE INDEX:
${noteIndex}

QUESTION: ${question}

Return ONLY JSON: {"slugs": ["most-relevant-slug", ...]}. Pick the 1-8 most relevant slugs from the index, most relevant first. If none are relevant, return {"slugs": []}.`;
}

/**
 * Meaning-based recall (Karpathy index pattern): the agent reads the note index
 * and picks relevant slugs by meaning, which seed the same wikilink expansion +
 * budget as the keyword path. Returns empty on no selection / parse failure so
 * the caller can fall back to keyword seeding.
 */
export async function selectRelevantNotesSemantic(
  notes: AtomicNote[],
  question: string,
  model: ClaudeModel,
  opts: SelectOpts = {},
): Promise<ScoredNote[]> {
  if (notes.length === 0) return [];
  const raw = await callClaude(buildSelectPrompt(buildNoteIndex(notes), question), model);
  const picked = parseSelectedSlugs(raw, notes.map((n) => n.slug));
  if (picked.length === 0) return [];

  const bySlug = new Map(notes.map((n) => [n.slug, n]));
  const seeds = new Map<string, ScoredNote>();
  // Rank-decayed seed scores so the agent's ordering survives into the final cut.
  picked.forEach((slug, i) => {
    const note = bySlug.get(slug);
    if (note) seeds.set(slug, { note, score: picked.length - i, hop: 0 });
  });
  return expandFromSeeds(seeds, notes, opts);
}

/** Render selected notes as a citable block. Tags: [N1], [N2], … */
export function buildNotesBlock(scored: ScoredNote[]): {
  block: string;
  tagBySlug: Map<string, string>;
} {
  const tagBySlug = new Map<string, string>();
  const parts: string[] = [];
  scored.forEach((sn, i) => {
    const tag = `N${i + 1}`;
    tagBySlug.set(sn.note.slug, tag);
    parts.push(`[${tag}] ${sn.note.title}\n${sn.note.content}`);
  });
  return { block: parts.join("\n\n---\n\n"), tagBySlug };
}

// ---------------------------------------------------------------------------
// Cross-project ("one brain") recall — same index-selection pattern, but the
// index spans EVERY project's notes. Keys are `<projectName>/<slug>` so two
// projects can share a slug without colliding. Seeds only (no wikilink
// expansion: links don't cross projects, and note bodies are self-contained).
// ---------------------------------------------------------------------------

export interface GlobalNote {
  projectPath: string;
  projectName: string;
  note: AtomicNote;
}

/** `projectName/slug` — the unique selection key for a note in the global index. */
function globalKey(gn: GlobalNote): string {
  return `${gn.projectName}/${gn.note.slug}`;
}

export function buildGlobalNoteIndex(notes: GlobalNote[]): string {
  return notes
    .map((gn) => {
      const preview = gn.note.content.replace(/\s+/g, " ").trim().slice(0, 80);
      return `- [${globalKey(gn)}] ${gn.note.title}${preview ? ` — ${preview}` : ""}`;
    })
    .join("\n");
}

function buildGlobalSelectPrompt(index: string, question: string): string {
  return `You are selecting which atomic notes — across ALL of the user's projects — are relevant to answer a QUESTION, by MEANING, not exact word overlap. Notes are keyed [project/slug].

NOTE INDEX (all projects):
${index}

QUESTION: ${question}

Return ONLY JSON: {"slugs": ["project/slug", ...]}. Pick the 1-8 most relevant keys from the index, most relevant first, mixing projects when relevant. If none are relevant, return {"slugs": []}.`;
}

/**
 * Meaning-based recall across every project's notes — ask the WHOLE brain, not
 * one project. Returns the selected notes with their project, agent-rank order.
 * Empty on no selection / parse failure (caller falls back or reports).
 */
export async function selectRelevantNotesGlobal(
  notes: GlobalNote[],
  question: string,
  model: ClaudeModel,
  maxNotes = MAX_NOTES,
): Promise<GlobalNote[]> {
  if (notes.length === 0) return [];
  const raw = await callClaude(buildGlobalSelectPrompt(buildGlobalNoteIndex(notes), question), model);
  const byKey = new Map(notes.map((gn) => [globalKey(gn), gn]));
  const picked = parseSelectedSlugs(raw, [...byKey.keys()]);
  return picked.slice(0, maxNotes).map((k) => byKey.get(k)!);
}
