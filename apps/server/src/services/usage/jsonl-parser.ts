import { createReadStream } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { calculateCost } from "./pricing";

/**
 * One billable assistant message extracted from a Claude Code JSONL
 * session log. Everything downstream (DB row, API response, charts)
 * works off this shape — the JSONL format itself is not exposed.
 */
export interface UsageEvent {
  /** Session uuid. Falls back to the JSONL filename's stem if the line
      doesn't carry it. */
  sessionId: string;
  /** Anthropic message id (`msg_...`). Used with sessionId as a unique
      key so re-parsing the same file doesn't double-count. */
  messageId: string;
  /** Decoded cwd (e.g. `/Users/me/Documents/GitHub/Demo`). */
  projectPath: string;
  /** Raw model id from the JSONL — kept verbatim so we can audit later. */
  model: string;
  /** Unix milliseconds. Falls back to 0 if the line has no timestamp. */
  ts: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  /** USD, calculated from `pricing.PRICING`. 0 for unknown models. */
  costUsd: number;
}

/**
 * `~/.claude/projects/` directories are encoded with `/` → `-`, with the
 * leading `/` becoming the leading `-`. Decode by mapping every `-` back
 * to `/`. This is lossy when a real cwd contains `-` in a segment (e.g.
 * `/Users/me/repos/my-app` → `/Users/me/repos/my/app`), but Claude Code
 * itself uses the same lossy encoding so we have no better signal than
 * the bytes on disk; downstream code treats project_path as a display
 * label only.
 */
export function decodeProjectDir(dirName: string): string {
  return dirName.replace(/-/g, "/");
}

interface JsonlAssistantLine {
  type?: string;
  timestamp?: string;
  sessionId?: string;
  message?: {
    id?: string;
    model?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

/**
 * Parse one JSONL line into a `UsageEvent`. Returns `null` for any line
 * that isn't a billable assistant message — non-assistant types, lines
 * without a `message.usage` block, malformed JSON. Pure function (no
 * I/O) so it stays cheap to test against fixtures.
 */
export function parseLine(
  line: string,
  projectPath: string,
  sessionIdFallback: string,
): UsageEvent | null {
  let parsed: JsonlAssistantLine;
  try {
    parsed = JSON.parse(line) as JsonlAssistantLine;
  } catch {
    return null;
  }
  if (!parsed || parsed.type !== "assistant") return null;
  const message = parsed.message;
  if (!message || !message.usage) return null;
  const messageId = message.id;
  if (!messageId) return null;

  const tokens = {
    input: toInt(message.usage.input_tokens),
    output: toInt(message.usage.output_tokens),
    cacheCreation: toInt(message.usage.cache_creation_input_tokens),
    cacheRead: toInt(message.usage.cache_read_input_tokens),
  };
  const ts = parsed.timestamp ? Date.parse(parsed.timestamp) : 0;

  return {
    sessionId: parsed.sessionId ?? sessionIdFallback,
    messageId,
    projectPath,
    model: message.model ?? "unknown",
    ts: Number.isFinite(ts) ? ts : 0,
    inputTokens: tokens.input,
    outputTokens: tokens.output,
    cacheCreationTokens: tokens.cacheCreation,
    cacheReadTokens: tokens.cacheRead,
    costUsd: calculateCost(message.model ?? "unknown", tokens),
  };
}

/**
 * Stream-parse one JSONL file. Each yielded value is a billable event;
 * non-billable lines are silently skipped. The reader is line-oriented
 * so multi-GB files don't load into memory.
 *
 * `sessionIdFallback` defaults to the file's basename (without `.jsonl`),
 * which matches Claude Code's own `<uuid>.jsonl` naming.
 */
export async function* parseFile(
  absPath: string,
  projectPath: string,
): AsyncGenerator<UsageEvent> {
  const sessionIdFallback = path.basename(absPath, ".jsonl");
  const stream = createReadStream(absPath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      if (line.length === 0) continue;
      const ev = parseLine(line, projectPath, sessionIdFallback);
      if (ev) yield ev;
    }
  } finally {
    rl.close();
    stream.close();
  }
}

function toInt(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

// ---------------------------------------------------------------------------
// Full-message parser (for session_messages table)
// ---------------------------------------------------------------------------

export interface SessionMessage {
  uuid: string;
  parentUuid: string | null;
  sessionId: string;
  projectPath: string;
  type: string;
  subtype: string | null;
  content: string | null;
  ts: number;
  isCompactSummary: boolean;
  compactTrigger: string | null;
  compactPreTokens: number | null;
  compactPostTokens: number | null;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image" }
  | { type: string; [k: string]: unknown };

function extractText(content: unknown): string | null {
  if (typeof content === "string") return content || null;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const block of content as ContentBlock[]) {
    if (block.type === "text" && typeof (block as { text?: unknown }).text === "string") {
      const t = (block as { text: string }).text;
      if (t) parts.push(t);
    }
    // image / tool_use / tool_result blocks: skip
  }
  return parts.length ? parts.join("\n") : null;
}

const SKIP_ATTACHMENT_TYPES = new Set([
  "skill_listing",
  "compact_file_reference",
  "hook_success",
  "hook_cancelled",
  "queued_command",
]);

/**
 * Parse one JSONL line into a SessionMessage. Returns null for lines
 * without a uuid or that are derivable noise (skill listings, hook
 * events, compact file refs).
 */
export function parseLineToMessage(
  line: string,
  projectPath: string,
  sessionIdFallback: string,
): SessionMessage | null {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;

  const uuid = raw.uuid as string | undefined;
  if (!uuid) return null;

  const type = (raw.type as string | undefined) ?? "";
  const subtype = (raw.subtype as string | undefined) ?? null;

  if (type === "attachment") {
    const attType = (raw.attachment as Record<string, unknown> | undefined)?.type as string | undefined;
    if (attType && SKIP_ATTACHMENT_TYPES.has(attType)) return null;
  }

  const ts = raw.timestamp ? Date.parse(raw.timestamp as string) : 0;
  const sessionId = (raw.sessionId as string | undefined) ?? sessionIdFallback;
  const parentUuid = (raw.parentUuid as string | undefined) ?? null;
  const isCompactSummary = !!(raw.isCompactSummary as boolean | undefined);

  let content: string | null = null;
  let compactTrigger: string | null = null;
  let compactPreTokens: number | null = null;
  let compactPostTokens: number | null = null;

  if (type === "system" && subtype === "compact_boundary") {
    content = (raw.content as string | undefined) ?? null;
    const meta = raw.compactMetadata as Record<string, unknown> | undefined;
    if (meta) {
      compactTrigger = (meta.trigger as string | undefined) ?? null;
      compactPreTokens = toInt(meta.preTokens);
      compactPostTokens = toInt(meta.postTokens);
    }
  } else {
    const msg = raw.message as Record<string, unknown> | undefined;
    if (msg) content = extractText(msg.content);
  }

  return {
    uuid,
    parentUuid,
    sessionId,
    projectPath,
    type,
    subtype,
    content,
    ts: Number.isFinite(ts) ? ts : 0,
    isCompactSummary,
    compactTrigger,
    compactPreTokens,
    compactPostTokens,
  };
}
