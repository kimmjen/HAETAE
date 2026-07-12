import fs from "node:fs/promises";
import path from "node:path";
import { extractWikilinks, type AtomicNote } from "./notes";

const MARKER_START = "<!-- HAETAE:WIKI:START -->";
const MARKER_END = "<!-- HAETAE:WIKI:END -->";

/** Chars reserved for the note index inside the injected block. */
const INDEX_MAX_CHARS = 1600;

/**
 * Max chars of wiki to inject into .claude/CLAUDE.md. The full wiki lives in
 * the DB / HAETAE UI; CLAUDE.md only gets a bounded version because it loads
 * into EVERY future session's context — an unbounded block would make the
 * per-session token cost grow without limit as the wiki accumulates.
 */
const CLAUDEMD_MAX_CHARS = Number(process.env.HAETAE_WIKI_CLAUDEMD_MAX_CHARS ?? 8000);

// Section importance for a fresh session: keep the highest-value sections when
// the wiki exceeds the budget. 최근 작업(Recent Work) is the most verbose and
// least critical for bootstrapping a new session, so it's dropped first.
const SECTION_PRIORITY: Array<{ re: RegExp; rank: number }> = [
  { re: /overview|개요/i, rank: 1 },
  { re: /decision|결정/i, rank: 2 },
  { re: /next|다음/i, rank: 3 },
  { re: /tech|기술/i, rank: 4 },
  { re: /feature|기능|주요/i, rank: 5 },
  { re: /recent|최근/i, rank: 7 },
];

const TRUNC_NOTE = "\n\n> *(요약본 — 전체 위키는 HAETAE Wiki 탭에서 확인)*";

function rankOf(header: string): number {
  for (const { re, rank } of SECTION_PRIORITY) if (re.test(header)) return rank;
  return 5;
}

/**
 * Cap the wiki markdown to a char budget for injection. Under budget → returned
 * as-is. Over budget → keep whole sections by importance (emitted in original
 * order) until the budget is hit, append a "summary" note. Deterministic, no
 * LLM. The DB copy is untouched — only the injected artifact is bounded.
 */
export function capWikiForInjection(content: string, budget = CLAUDEMD_MAX_CHARS): string {
  const trimmed = content.trim();
  if (trimmed.length <= budget) return trimmed;

  const lines = trimmed.split("\n");
  const firstSec = lines.findIndex((l) => /^##\s+/.test(l));
  if (firstSec === -1) return trimmed.slice(0, budget); // no sections to select from

  const preamble = lines.slice(0, firstSec).join("\n").trimEnd();

  const sections: Array<{ idx: number; header: string; text: string }> = [];
  let cur: string[] = [];
  let curHeader = "";
  let idx = 0;
  for (let i = firstSec; i < lines.length; i++) {
    const l = lines[i];
    if (/^##\s+/.test(l)) {
      if (cur.length) sections.push({ idx: idx++, header: curHeader, text: cur.join("\n").trimEnd() });
      cur = [l];
      curHeader = l.replace(/^##\s+/, "");
    } else {
      cur.push(l);
    }
  }
  if (cur.length) sections.push({ idx: idx++, header: curHeader, text: cur.join("\n").trimEnd() });

  const sectionBudget = budget - preamble.length - TRUNC_NOTE.length;
  const byPriority = [...sections].sort(
    (a, b) => rankOf(a.header) - rankOf(b.header) || a.idx - b.idx,
  );

  const selected = new Set<number>();
  let used = 0;
  for (const s of byPriority) {
    const cost = s.text.length + 2; // "\n\n" separator
    if (used + cost <= sectionBudget) {
      selected.add(s.idx);
      used += cost;
    }
  }

  // Guarantee at least the top-priority section, truncated if it alone is huge.
  if (selected.size === 0 && byPriority.length > 0) {
    const top = byPriority[0];
    const truncated = top.text.slice(0, Math.max(0, sectionBudget));
    return [preamble, truncated].filter(Boolean).join("\n\n") + TRUNC_NOTE;
  }

  const kept = sections.filter((s) => selected.has(s.idx)).map((s) => s.text);
  const dropped = selected.size < sections.length;
  let out = [preamble, ...kept].filter(Boolean).join("\n\n");
  if (dropped) out += TRUNC_NOTE;
  return out;
}

/**
 * Wikilink degree per note — an importance proxy: the most-connected notes are
 * the project's conceptual hubs. [[slug]] links count on both endpoints.
 */
function noteDegrees(notes: AtomicNote[]): Map<string, number> {
  const slugs = new Set(notes.map((n) => n.slug));
  const deg = new Map<string, number>();
  for (const n of notes) {
    for (const target of extractWikilinks(n.content)) {
      if (!slugs.has(target) || target === n.slug) continue;
      deg.set(n.slug, (deg.get(n.slug) ?? 0) + 1);
      deg.set(target, (deg.get(target) ?? 0) + 1);
    }
  }
  return deg;
}

/**
 * Compact "memory index" of atomic notes — titles only, most-connected first
 * (importance). The Karpathy index pattern: persist the full MAP of what the
 * project knows so that wiki detail dropped by the char cap is still
 * *discoverable* (ask HAETAE to recall a note) instead of silently lost.
 * Empty string when there are no notes.
 */
export function buildNotesIndexBlock(notes: AtomicNote[], budget = INDEX_MAX_CHARS): string {
  if (notes.length === 0) return "";
  const deg = noteDegrees(notes);
  const ranked = [...notes].sort((a, b) => (deg.get(b.slug) ?? 0) - (deg.get(a.slug) ?? 0));
  const header = "## 기억 인덱스 (HAETAE 노트 — 자세한 내용은 HAETAE에 회상 요청)";
  const lines: string[] = [];
  let used = header.length;
  for (const n of ranked) {
    const line = `- ${n.title}`;
    if (used + line.length + 1 > budget) continue;
    lines.push(line);
    used += line.length + 1;
  }
  if (lines.length === 0) return "";
  const dropped = ranked.length - lines.length;
  return `${header}\n${lines.join("\n")}${dropped > 0 ? `\n- …외 ${dropped}개` : ""}`;
}

/**
 * The persistent-memory block injected into CLAUDE.md: the capped wiki core
 * PLUS a complete, importance-ranked index of atomic notes. The wiki gives
 * prose context; the index keeps the rest of the brain discoverable even when
 * the wiki is truncated. No notes → just the capped wiki (backward compatible).
 */
export function buildPersistentMemory(
  wikiContent: string,
  notes: AtomicNote[] = [],
  budget = CLAUDEMD_MAX_CHARS,
): string {
  const indexBlock = buildNotesIndexBlock(notes);
  if (!indexBlock) return capWikiForInjection(wikiContent, budget);
  const wikiBlock = capWikiForInjection(wikiContent, Math.max(0, budget - indexBlock.length - 2));
  return `${wikiBlock}\n\n${indexBlock}`;
}

/**
 * Trust flag for the injected memory — tells the next session how far to rely
 * on it. Scenario keystone: persisted memory is only net-positive while trust
 * is high; a confidently-wrong memory is worse than amnesia (which at least
 * asks). Signal = the wiki's last self-eval score; null = never audited.
 */
export function trustLine(evalScore: number | null): string {
  if (evalScore === null) {
    return "> 자가검증: 미실시 — 미검증 기억이므로 핵심 결정은 대화·코드로 재확인.";
  }
  if (evalScore >= 80) return `> 자가검증 신뢰도: ${evalScore}/100.`;
  if (evalScore >= 60) return `> 자가검증 신뢰도: ${evalScore}/100 (보통) — 중요한 건 재확인 권장.`;
  return `> 자가검증 신뢰도: ${evalScore}/100 — 낮음. 이 기억을 그대로 신뢰하지 말 것.`;
}

/**
 * Inject (or update) the wiki section inside a project's .claude/CLAUDE.md.
 *
 * The wiki block is wrapped in HTML comment markers so we can replace it on
 * subsequent calls without touching anything the user wrote outside the block.
 *
 *   <!-- HAETAE:WIKI:START -->
 *   ...auto-generated wiki...
 *   <!-- HAETAE:WIKI:END -->
 *
 * Rules:
 *  - If .claude/CLAUDE.md exists and already has the markers → replace block.
 *  - If .claude/CLAUDE.md exists but has no markers → append block at end.
 *  - If .claude/CLAUDE.md does not exist → create it with the block only.
 *  - .claude/ directory is created if missing.
 */
export async function injectWikiIntoCLAUDEMd(
  projectPath: string,
  wikiContent: string,
  generatedAt: number,
  notes: AtomicNote[] = [],
  evalScore: number | null = null,
): Promise<{ claudeMdPath: string; action: "created" | "replaced" | "appended" }> {
  const claudeDir = path.join(projectPath, ".claude");
  const claudeMdPath = path.join(claudeDir, "CLAUDE.md");

  const timestamp = new Date(generatedAt).toISOString().slice(0, 16).replace("T", " ");
  const block = [
    MARKER_START,
    `> 이 섹션은 HAETAE가 프로젝트 대화 기록으로부터 자동 생성합니다. (${timestamp})`,
    `> 직접 수정하면 다음 갱신 시 덮어씌워집니다.`,
    trustLine(evalScore),
    "",
    buildPersistentMemory(wikiContent, notes),
    "",
    MARKER_END,
  ].join("\n");

  await fs.mkdir(claudeDir, { recursive: true });

  let existing = "";
  try {
    existing = await fs.readFile(claudeMdPath, "utf8");
  } catch {
    // File doesn't exist yet — will be created
  }

  let updated: string;
  let action: "created" | "replaced" | "appended";

  if (!existing) {
    updated = block + "\n";
    action = "created";
  } else if (existing.includes(MARKER_START)) {
    const start = existing.indexOf(MARKER_START);
    const end = existing.indexOf(MARKER_END);
    if (end === -1) {
      // Malformed — just append fresh
      updated = existing.trimEnd() + "\n\n" + block + "\n";
      action = "appended";
    } else {
      updated =
        existing.slice(0, start) +
        block +
        existing.slice(end + MARKER_END.length);
      action = "replaced";
    }
  } else {
    // Has user content but no markers — append
    updated = existing.trimEnd() + "\n\n---\n\n" + block + "\n";
    action = "appended";
  }

  await fs.writeFile(claudeMdPath, updated, "utf8");
  return { claudeMdPath, action };
}
