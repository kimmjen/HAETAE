import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readSessionMeta } from "./session-meta";

const CLAUDE_HOME_ENV = "HAETAE_CLAUDE_HOME";

describe("readSessionMeta", () => {
  let originalClaudeHome: string | undefined;
  let claudeHome: string;

  beforeEach(() => {
    originalClaudeHome = process.env[CLAUDE_HOME_ENV];
    claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-meta-"));
    process.env[CLAUDE_HOME_ENV] = claudeHome;
    fs.mkdirSync(path.join(claudeHome, "usage-data", "session-meta"), {
      recursive: true,
    });
  });

  afterEach(() => {
    if (originalClaudeHome === undefined) delete process.env[CLAUDE_HOME_ENV];
    else process.env[CLAUDE_HOME_ENV] = originalClaudeHome;
    fs.rmSync(claudeHome, { recursive: true, force: true });
  });

  it("returns null when the meta file is missing", async () => {
    expect(await readSessionMeta("does-not-exist")).toBeNull();
  });

  it("parses the well-known fields (snake_case → camelCase)", async () => {
    const sessionId = "abc12345-aaaa-bbbb-cccc-1234567890ab";
    fs.writeFileSync(
      path.join(claudeHome, "usage-data", "session-meta", `${sessionId}.json`),
      JSON.stringify({
        session_id: sessionId,
        project_path: "/x/proj",
        start_time: "2026-05-04T01:00:00Z",
        duration_minutes: 42,
        user_message_count: 7,
        assistant_message_count: 6,
        tool_counts: { Read: 12, Bash: 3 },
        first_prompt: "안녕",
        user_interruptions: 1,
        tool_errors: 0,
        git_commits: 2,
        git_pushes: 1,
        lines_added: 100,
        lines_removed: 30,
        files_modified: 5,
        uses_task_agent: true,
        uses_mcp: false,
        uses_web_search: false,
        uses_web_fetch: true,
      }),
    );
    const m = await readSessionMeta(sessionId);
    expect(m).not.toBeNull();
    expect(m?.firstPrompt).toBe("안녕");
    expect(m?.durationMinutes).toBe(42);
    expect(m?.toolCounts).toEqual({ Read: 12, Bash: 3 });
    expect(m?.gitCommits).toBe(2);
    expect(m?.usesTaskAgent).toBe(true);
    expect(m?.startTime).toBe(Date.parse("2026-05-04T01:00:00Z"));
  });

  it("returns null on malformed JSON", async () => {
    const sessionId = "bad-meta-aaaa-bbbb-cccc-1234567890ab";
    fs.writeFileSync(
      path.join(claudeHome, "usage-data", "session-meta", `${sessionId}.json`),
      "{ not json",
    );
    expect(await readSessionMeta(sessionId)).toBeNull();
  });

  it("clamps negative / non-finite numbers to 0", async () => {
    const sessionId = "neg00000-aaaa-bbbb-cccc-1234567890ab";
    fs.writeFileSync(
      path.join(claudeHome, "usage-data", "session-meta", `${sessionId}.json`),
      JSON.stringify({
        duration_minutes: -10,
        git_commits: Number.NaN,
        files_modified: 3.7,
      }),
    );
    const m = await readSessionMeta(sessionId);
    expect(m?.durationMinutes).toBe(0);
    expect(m?.gitCommits).toBe(0);
    expect(m?.filesModified).toBe(3);
  });
});
