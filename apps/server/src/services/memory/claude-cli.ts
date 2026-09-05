import { spawn } from "node:child_process";

/**
 * Single source of truth for the models the second-brain features may use.
 *
 * These are the CLI's tier ALIASES, not pinned ids: `claude --model opus`
 * resolves to whatever the current Opus is. Pinning (`claude-opus-4-8`) is what
 * left this list a whole generation behind while three separate copies of it
 * drifted apart — and a picker whose real meaning is "how good / how expensive"
 * has no business naming a version anyway.
 *
 * `fable` is deliberately absent: at $10/$50 per MTok it is the priciest tier by
 * some way, and nothing the brain does needs it over Opus. It is priced in
 * `usage/pricing.ts`, so adding it here is a one-line change if that changes.
 *
 * Order = UI dropdown order, mirrored in `apps/web/src/lib/models.ts`; first
 * entry is the default.
 */
export const CLAUDE_MODELS = ["sonnet", "opus", "haiku"] as const;

export type ClaudeModel = (typeof CLAUDE_MODELS)[number];

/** Default model when a request omits/invalid one. */
// Sonnet, not Opus — the brain fires a lot of `claude --print` calls (wiki
// synthesis + cascade layers per fold) and every OSS user pays for them from
// their own CLI quota. Sonnet keeps the default cost sane; Opus stays one
// click away in every model picker for anyone who wants the extra quality.
export const DEFAULT_MODEL: ClaudeModel = CLAUDE_MODELS[0];

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
