import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import readline from "node:readline";
import { getClaudeHome } from "../claude-fs/path";
import { calculateCost } from "./pricing";
import { readSessionMeta, type SessionMeta } from "./session-meta";

/**
 * Drill-down view of a single Claude Code session. Reads the JSONL
 * directly (no DB) so we can show the *content* of user/assistant
 * messages, not just the per-message token totals that
 * `usage_events` stores.
 *
 * Heavy text gets capped per-part (LIMIT_PER_PART) and per-session
 * (LIMIT_MESSAGES) so a multi-MB tool_result block can't explode the
 * payload.
 */

const LIMIT_PER_PART = 10_000;
const LIMIT_MESSAGES = 500;

export interface SessionMessagePart {
  kind: "text" | "thinking" | "tool_use" | "tool_result";
  /** For text / thinking / tool_result. May be truncated. */
  text?: string;
  /** True if `text` was clipped to fit `LIMIT_PER_PART`. */
  truncated?: boolean;
  /** For tool_use only. */
  toolName?: string;
  /** For tool_use only — JSON-stringified input, also clipped. */
  toolInputPreview?: string;
}

export interface SessionMessage {
  uuid: string;
  role: "user" | "assistant";
  ts: number;
  parts: SessionMessagePart[];
  /** Present on assistant messages with a usage block. */
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    model: string;
  };
}

export interface SessionDetail {
  sessionId: string;
  projectPath: string;
  filePath: string;
  startedAt: number | null;
  endedAt: number | null;
  truncated: boolean;
  totals: {
    messages: number;
    assistantMessages: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costUsd: number;
  };
  /** Optional CLI-provided per-session meta (first prompt / git activity /
   *  tool counts). `null` when `~/.claude/usage-data/session-meta/<id>.json`
   *  is missing — ex. older sessions before Claude Code started recording. */
  meta: SessionMeta | null;
  messages: SessionMessage[];
}

interface JsonlLine {
  type?: string;
  uuid?: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  message?: {
    role?: "user" | "assistant";
    model?: string;
    content?: unknown;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
  };
}

/**
 * Find `<sessionId>.jsonl` under `~/.claude/projects/*\/`. Sessions are
 * uuid-named so collisions across project dirs aren't expected, but if
 * one ever happens we just take the first hit.
 */
async function findSessionFile(
  sessionId: string,
): Promise<{ filePath: string; encodedDir: string } | null> {
  const root = path.join(getClaudeHome(), "projects");
  let dirs: string[];
  try {
    dirs = await fs.readdir(root);
  } catch {
    return null;
  }
  const target = `${sessionId}.jsonl`;
  for (const dir of dirs) {
    const candidate = path.join(root, dir, target);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return { filePath: candidate, encodedDir: dir };
      }
    } catch {
      // not in this dir
    }
  }
  return null;
}

function clip(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  return { text: s.slice(0, max), truncated: true };
}

function extractParts(content: unknown): SessionMessagePart[] {
  if (typeof content === "string") {
    const c = clip(content, LIMIT_PER_PART);
    return [{ kind: "text", text: c.text, truncated: c.truncated || undefined }];
  }
  if (!Array.isArray(content)) return [];
  const out: SessionMessagePart[] = [];
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const p = part as Record<string, unknown>;
    const t = p.type;
    if (t === "text" && typeof p.text === "string") {
      const c = clip(p.text, LIMIT_PER_PART);
      out.push({ kind: "text", text: c.text, truncated: c.truncated || undefined });
    } else if (t === "thinking" && typeof p.thinking === "string") {
      const c = clip(p.thinking, LIMIT_PER_PART);
      out.push({ kind: "thinking", text: c.text, truncated: c.truncated || undefined });
    } else if (t === "tool_use") {
      const inputJson = JSON.stringify(p.input ?? {}, null, 2);
      const c = clip(inputJson, LIMIT_PER_PART);
      out.push({
        kind: "tool_use",
        toolName: typeof p.name === "string" ? p.name : "unknown",
        toolInputPreview: c.text,
        truncated: c.truncated || undefined,
      });
    } else if (t === "tool_result") {
      const raw = p.content;
      let text: string;
      if (typeof raw === "string") text = raw;
      else if (Array.isArray(raw)) {
        text = raw
          .map((r) => {
            if (r && typeof r === "object" && "text" in (r as object)) {
              return String((r as { text?: unknown }).text ?? "");
            }
            return JSON.stringify(r);
          })
          .join("\n");
      } else text = JSON.stringify(raw ?? "");
      const c = clip(text, LIMIT_PER_PART);
      out.push({
        kind: "tool_result",
        text: c.text,
        truncated: c.truncated || undefined,
      });
    }
  }
  return out;
}

function toInt(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

export async function loadSessionDetail(
  sessionId: string,
): Promise<SessionDetail | null> {
  const found = await findSessionFile(sessionId);
  if (!found) return null;

  const messages: SessionMessage[] = [];
  let projectPath = "";
  let assistantMessages = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCost = 0;
  let startedAt: number | null = null;
  let endedAt: number | null = null;
  let truncated = false;

  const stream = createReadStream(found.filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (line.length === 0) continue;
      let parsed: JsonlLine;
      try {
        parsed = JSON.parse(line) as JsonlLine;
      } catch {
        continue;
      }
      if (parsed.cwd && !projectPath) projectPath = parsed.cwd;

      const t = parsed.type;
      if (t !== "user" && t !== "assistant") continue;
      if (!parsed.message) continue;

      if (messages.length >= LIMIT_MESSAGES) {
        truncated = true;
        continue;
      }

      const ts = parsed.timestamp ? Date.parse(parsed.timestamp) : 0;
      if (Number.isFinite(ts) && ts > 0) {
        if (startedAt === null || ts < startedAt) startedAt = ts;
        if (endedAt === null || ts > endedAt) endedAt = ts;
      }

      const role: "user" | "assistant" =
        parsed.message.role === "assistant" || t === "assistant"
          ? "assistant"
          : "user";

      const parts = extractParts(parsed.message.content);
      const msg: SessionMessage = {
        uuid: typeof parsed.uuid === "string" ? parsed.uuid : "",
        role,
        ts: Number.isFinite(ts) ? ts : 0,
        parts,
      };

      if (role === "assistant" && parsed.message.usage) {
        const u = parsed.message.usage;
        const tokens = {
          input: toInt(u.input_tokens),
          output: toInt(u.output_tokens),
          cacheCreation: toInt(u.cache_creation_input_tokens),
          cacheRead: toInt(u.cache_read_input_tokens),
        };
        const model = parsed.message.model ?? "unknown";
        const costUsd = calculateCost(model, tokens);
        msg.usage = {
          inputTokens: tokens.input,
          outputTokens: tokens.output,
          cacheCreationTokens: tokens.cacheCreation,
          cacheReadTokens: tokens.cacheRead,
          costUsd,
          model,
        };
        assistantMessages += 1;
        totalInput += tokens.input;
        totalOutput += tokens.output;
        totalCacheRead += tokens.cacheRead;
        totalCost += costUsd;
      }

      messages.push(msg);
    }
  } finally {
    rl.close();
    stream.close();
  }

  const meta = await readSessionMeta(sessionId);

  return {
    sessionId,
    projectPath,
    filePath: found.filePath,
    startedAt,
    endedAt,
    truncated,
    totals: {
      messages: messages.length,
      assistantMessages,
      inputTokens: totalInput,
      outputTokens: totalOutput,
      cacheReadTokens: totalCacheRead,
      costUsd: totalCost,
    },
    meta,
    messages,
  };
}
