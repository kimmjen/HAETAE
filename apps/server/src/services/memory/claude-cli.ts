import { spawn } from "node:child_process";

/**
 * Single source of truth for the models the second-brain features may use.
 * Order = UI dropdown order / default-fallback preference.
 */
export const CLAUDE_MODELS = [
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-sonnet-4-6",
  "claude-haiku-4-5-20251001",
] as const;

export type ClaudeModel = (typeof CLAUDE_MODELS)[number];

/** Default model when a request omits/invalid one. */
export const DEFAULT_MODEL: ClaudeModel = "claude-opus-4-7";

/** Validate an arbitrary string against the model allowlist. */
export function isClaudeModel(s: unknown): s is ClaudeModel {
  return typeof s === "string" && (CLAUDE_MODELS as readonly string[]).includes(s);
}

/** Coerce request input to a valid model, falling back to DEFAULT_MODEL. */
export function coerceModel(s: unknown): ClaudeModel {
  return isClaudeModel(s) ? s : DEFAULT_MODEL;
}

// --- Global concurrency limit -------------------------------------------------
// Every second-brain LLM feature (wiki/ontology/ask/eval/voice + the auto
// scheduler) runs through callClaude, so capping it here bounds total
// concurrent `claude --print` subprocesses regardless of how many endpoints
// fire at once (previously unbounded — multiple clicks spawned many).
const MAX_CONCURRENT = Number(process.env.HAETAE_LLM_MAX_CONCURRENT ?? 2);
let active = 0;
const waiters: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => waiters.push(resolve));
  active += 1;
}
function release(): void {
  active -= 1;
  waiters.shift()?.();
}

function spawnClaude(prompt: string, model: ClaudeModel, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "claude",
      // NOTE: every name here must be a real tool — newer CLIs (≥2.1.x) hard-fail
      // on unknown names in deny rules (a stray "computer" entry killed every
      // brain LLM call after a CLI auto-update).
      ["--print", "--model", model, "--disallowed-tools", "Write,Edit,Bash"],
      { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env }, cwd: "/tmp" },
    );

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
    proc.stderr.on("data", (c: Buffer) => { stderr += c.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`claude --print timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`claude --print exited ${code}: ${stderr.slice(0, 500)}`));
    });
    proc.on("error", (err) => { clearTimeout(timer); reject(err); });

    proc.stdin.write(prompt, "utf8");
    proc.stdin.end();
  });
}

/**
 * Run `claude --print` as a pure text-generation call and return stdout.
 * Shared by all second-brain features. Uses the user's Claude subscription via
 * the CLI — no API key. `cwd=/tmp` keeps project-level hooks from intercepting
 * the subprocess; `--disallowed-tools` blocks file/shell tools. Calls beyond
 * MAX_CONCURRENT queue rather than spawning unbounded subprocesses.
 */
export async function callClaude(
  prompt: string,
  model: ClaudeModel,
  timeoutMs = 180_000,
): Promise<string> {
  await acquire();
  try {
    return await spawnClaude(prompt, model, timeoutMs);
  } finally {
    release();
  }
}

/**
 * Tolerantly extract a JSON object from an LLM response — strips ```json
 * fences and falls back to the first `{` … last `}` slice when the model adds
 * stray prose. Returns the parsed value, or throws if nothing parses.
 */
export function extractJson<T = unknown>(raw: string): T {
  const stripped = raw.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    // fall through
  }
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return JSON.parse(stripped.slice(start, end + 1)) as T;
  }
  throw new Error("No JSON object found in model output");
}
