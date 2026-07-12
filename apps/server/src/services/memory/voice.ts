import fs from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { sessionMessages, userProfile } from "../../db/schema";
import { getClaudeHome } from "../claude-fs/path";
import { saveBackup } from "../claude-fs/backup";
import { callClaude, type ClaudeModel } from "./claude-cli";

const SOURCE_BUDGET = 60_000; // chars of the user's own messages fed to the agent
const PER_MSG_CAP = 1_500; // truncate each message so the budget samples MANY, not a few huge pastes
const INJECT_MAX_CHARS = 4_000; // cap on what we write into the global CLAUDE.md

const MARKER_START = "<!-- HAETAE:PROFILE:START -->";
const MARKER_END = "<!-- HAETAE:PROFILE:END -->";

export interface UserMessage {
  ts: number;
  content: string;
}

/**
 * Load the USER's own messages across ALL projects, newest first. These — not
 * the assistant replies — carry the user's voice, instructions, and judgment.
 */
export function loadUserMessages(db: Db = getDb()): UserMessage[] {
  return db
    .select({ ts: sessionMessages.ts, content: sessionMessages.content })
    .from(sessionMessages)
    .where(
      sql`${sessionMessages.type} = 'user'
        AND ${sessionMessages.content} IS NOT NULL
        AND ${sessionMessages.content} != ''
        AND ${sessionMessages.isCompactSummary} = 0`,
    )
    .orderBy(sql`${sessionMessages.ts} DESC`)
    .all() as UserMessage[];
}

/**
 * Pure: take the most-recent user messages within the char budget. Recency-
 * weighted on purpose — the profile describes the user's CURRENT voice and
 * preferences, not who they were a year ago.
 */
export function selectUserMessages(
  messages: UserMessage[],
  budget = SOURCE_BUDGET,
  perMsgCap = PER_MSG_CAP,
): UserMessage[] {
  const out: UserMessage[] = [];
  let used = 0;
  for (const m of messages) {
    const raw = m.content ?? "";
    // Cap each message so a few huge pastes/logs can't swallow the budget —
    // voice is in HOW the user phrases things, so a prefix per message suffices.
    const content = raw.length > perMsgCap ? raw.slice(0, perMsgCap) + "…" : raw;
    if (out.length > 0 && used + content.length > budget) break;
    out.push({ ts: m.ts, content });
    used += content.length;
    if (used >= budget) break;
  }
  return out;
}

export function buildPrompt(messages: UserMessage[]): string {
  const transcript = messages
    .map((m) => {
      const date = new Date(m.ts).toISOString().slice(0, 10);
      return `[${date}] ${m.content.trim()}`;
    })
    .join("\n---\n");

  return `You are profiling THIS user from their OWN messages across many projects (their words, instructions, questions, corrections — NOT the assistant's replies), newest first. Goal: capture their voice, preferences, and working style so an AI can assist them in a personalized way and write in their voice.

USER MESSAGES:
${transcript}

---

Produce a concise Markdown profile of the USER (not any single project):

# 나의 맥락 / Profile

## 커뮤니케이션 스타일 / Voice
어조·언어(한/영 혼용 등)·표현 습관·길이 선호 등 — AI가 이 사람처럼 쓰려면 알아야 할 것.

## 작업 선호 / Working preferences
반복되는 지시·워크플로우·도구/기술 선호·하지 말라는 것.

## 판단·결정 패턴 / Decision patterns
어떻게 결정하고 무엇을 중시하는가.

## 관심 주제 / Recurring themes
자주 다루는 주제·도메인.

Rules: 메시지에 실제로 드러난 근거만. 한국어. bullet 위주. 추측 금지.`;
}

export interface VoiceResult {
  content: string;
  model: string;
  messagesCovered: number;
  generatedAt: number;
}

export function getUserProfile(db: Db = getDb()): VoiceResult | null {
  const row = db.select().from(userProfile).where(sql`${userProfile.scope} = 'global'`).get();
  return row
    ? { content: row.content, model: row.model, messagesCovered: row.messagesCovered, generatedAt: row.generatedAt }
    : null;
}

/** Synthesize (or regenerate) the user profile from their recent messages. */
export async function generateUserProfile(
  model: ClaudeModel = "claude-opus-4-8",
  db: Db = getDb(),
): Promise<VoiceResult> {
  const all = loadUserMessages(db);
  if (all.length === 0) throw new Error("사용자 메시지가 없습니다 — 대화가 인덱싱된 뒤 생성하세요.");

  const selected = selectUserMessages(all);
  const content = await callClaude(buildPrompt(selected), model);
  const now = Date.now();

  db.insert(userProfile)
    .values({ scope: "global", content, model, messagesCovered: selected.length, generatedAt: now })
    .onConflictDoUpdate({
      target: userProfile.scope,
      set: { content, model, messagesCovered: selected.length, generatedAt: now, updatedAt: sql`(unixepoch() * 1000)` },
    })
    .run();

  return { content, model, messagesCovered: selected.length, generatedAt: now };
}

/**
 * Compute the new contents of the global ~/.claude/CLAUDE.md with the profile
 * block injected/replaced inside HAETAE:PROFILE markers. Pure (no I/O) so it's
 * testable; the profile is capped so it never bloats the user's global config.
 */
export function injectProfileBlock(existing: string, profile: string, generatedAt: number): string {
  const stamp = new Date(generatedAt).toISOString().slice(0, 16).replace("T", " ");
  const capped = profile.trim().length > INJECT_MAX_CHARS ? profile.trim().slice(0, INJECT_MAX_CHARS) + "\n…" : profile.trim();
  const block = [
    MARKER_START,
    `> HAETAE가 내 대화 기록에서 자동 생성한 프로필 (${stamp}). 직접 수정 금지 — 다음 갱신 시 덮어씁니다.`,
    "",
    capped,
    "",
    MARKER_END,
  ].join("\n");

  if (!existing) return block + "\n";
  if (existing.includes(MARKER_START)) {
    const start = existing.indexOf(MARKER_START);
    const end = existing.indexOf(MARKER_END);
    if (end === -1) return existing.trimEnd() + "\n\n" + block + "\n";
    return existing.slice(0, start) + block + existing.slice(end + MARKER_END.length);
  }
  return existing.trimEnd() + "\n\n" + block + "\n";
}

/**
 * Write the stored profile into the user's GLOBAL ~/.claude/CLAUDE.md (opt-in,
 * explicit — it governs every Claude Code session). Appends/replaces only the
 * marker block; the user's own content is preserved.
 */
export async function injectProfileIntoGlobalClaudeMd(db: Db = getDb()): Promise<{ path: string; action: "created" | "updated" }> {
  const profile = getUserProfile(db);
  if (!profile) throw new Error("프로필이 없습니다 — 먼저 생성하세요.");

  const claudeMdPath = path.join(getClaudeHome(), "CLAUDE.md");
  let existing = "";
  try {
    existing = await fs.readFile(claudeMdPath, "utf8");
  } catch {
    // doesn't exist yet
  }
  // Hard rule: back up ~/.claude before overwriting. This is the user's GLOBAL
  // config (governs every session) — a recoverable snapshot before we touch it.
  // Same scope as the claude-md feature's backups of this file.
  if (existing) saveBackup(db, "claude-md-global", "CLAUDE.md", existing);

  const updated = injectProfileBlock(existing, profile.content, profile.generatedAt);
  await fs.mkdir(getClaudeHome(), { recursive: true });
  await fs.writeFile(claudeMdPath, updated, "utf8");
  return { path: claudeMdPath, action: existing ? "updated" : "created" };
}
