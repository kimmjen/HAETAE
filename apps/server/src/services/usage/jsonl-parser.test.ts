import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decodeProjectDir, parseFile, parseLine, type UsageEvent } from "./jsonl-parser";

function makeAssistantLine(overrides?: Partial<{
  sessionId: string;
  messageId: string;
  model: string;
  ts: string;
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}>): string {
  const o = {
    sessionId: "sess-1",
    messageId: "msg_01",
    model: "claude-sonnet-4-6",
    ts: "2026-05-03T10:00:00.000Z",
    input: 100,
    output: 200,
    cacheCreation: 50,
    cacheRead: 25,
    ...overrides,
  };
  return JSON.stringify({
    type: "assistant",
    timestamp: o.ts,
    sessionId: o.sessionId,
    message: {
      id: o.messageId,
      model: o.model,
      role: "assistant",
      usage: {
        input_tokens: o.input,
        output_tokens: o.output,
        cache_creation_input_tokens: o.cacheCreation,
        cache_read_input_tokens: o.cacheRead,
      },
    },
  });
}

describe("decodeProjectDir", () => {
  it("maps every dash to a slash (Claude Code's lossy encoding)", () => {
    expect(decodeProjectDir("-Users-me-Documents-GitHub-Demo")).toBe(
      "/Users/me/Documents/GitHub/Demo",
    );
    expect(decodeProjectDir("-tmp-x")).toBe("/tmp/x");
  });
});

describe("parseLine", () => {
  it("returns a UsageEvent for an assistant line with usage", () => {
    const line = makeAssistantLine({ input: 1000, output: 2000 });
    const ev = parseLine(line, "/x/Alpha", "fallback-sess");
    expect(ev).not.toBeNull();
    expect(ev).toMatchObject({
      sessionId: "sess-1",
      messageId: "msg_01",
      projectPath: "/x/Alpha",
      model: "claude-sonnet-4-6",
      inputTokens: 1000,
      outputTokens: 2000,
      cacheCreationTokens: 50,
      cacheReadTokens: 25,
    });
    expect(ev!.ts).toBe(Date.parse("2026-05-03T10:00:00.000Z"));
    // Sonnet: (3*1000 + 15*2000 + 3.75*50 + 0.3*25) / 1e6
    expect(ev!.costUsd).toBeCloseTo((3 * 1000 + 15 * 2000 + 3.75 * 50 + 0.3 * 25) / 1e6, 9);
  });

  it("falls back to the supplied sessionId when the line has none", () => {
    const raw = JSON.parse(makeAssistantLine());
    delete raw.sessionId;
    const ev = parseLine(JSON.stringify(raw), "/x/Alpha", "fallback-sess");
    expect(ev?.sessionId).toBe("fallback-sess");
  });

  it("returns null for non-assistant lines", () => {
    const sysLine = JSON.stringify({ type: "user", message: { id: "m" } });
    expect(parseLine(sysLine, "/x", "f")).toBeNull();
    const meta = JSON.stringify({ type: "permission-mode" });
    expect(parseLine(meta, "/x", "f")).toBeNull();
  });

  it("returns null when usage block is missing", () => {
    const noUsage = JSON.stringify({
      type: "assistant",
      message: { id: "msg_x", model: "claude-opus-4-7" },
    });
    expect(parseLine(noUsage, "/x", "f")).toBeNull();
  });

  it("returns null when message id is missing", () => {
    const noId = JSON.stringify({
      type: "assistant",
      message: { model: "claude-opus-4-7", usage: { input_tokens: 1, output_tokens: 1 } },
    });
    expect(parseLine(noId, "/x", "f")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseLine("{not json", "/x", "f")).toBeNull();
    expect(parseLine("", "/x", "f")).toBeNull();
  });

  it("clamps negative / non-number tokens to 0", () => {
    const weird = JSON.stringify({
      type: "assistant",
      timestamp: "2026-05-03T00:00:00Z",
      sessionId: "s",
      message: {
        id: "m",
        model: "claude-haiku-4-5",
        usage: {
          input_tokens: -10,
          output_tokens: "nope",
          cache_creation_input_tokens: null,
          cache_read_input_tokens: 5,
        },
      },
    });
    const ev = parseLine(weird, "/x", "f");
    expect(ev).toMatchObject({
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 5,
    });
  });

  it("records ts=0 when the line has no timestamp", () => {
    const raw = JSON.parse(makeAssistantLine());
    delete raw.timestamp;
    const ev = parseLine(JSON.stringify(raw), "/x", "f");
    expect(ev?.ts).toBe(0);
  });
});

describe("parseFile", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-jsonl-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("yields one UsageEvent per billable line, skipping the rest", async () => {
    const file = path.join(dir, "abc-123.jsonl");
    const lines = [
      JSON.stringify({ type: "permission-mode" }),
      makeAssistantLine({ messageId: "msg_a" }),
      JSON.stringify({ type: "user", message: { id: "u" } }),
      makeAssistantLine({ messageId: "msg_b", model: "claude-opus-4-7" }),
      "",
      "garbage line",
      makeAssistantLine({ messageId: "msg_c", model: "claude-haiku-4-5" }),
    ];
    fs.writeFileSync(file, lines.join("\n"), "utf8");

    const out: UsageEvent[] = [];
    for await (const ev of parseFile(file, "/x/Alpha")) out.push(ev);

    expect(out.map((e) => e.messageId)).toEqual(["msg_a", "msg_b", "msg_c"]);
    expect(out.map((e) => e.model)).toEqual([
      "claude-sonnet-4-6",
      "claude-opus-4-7",
      "claude-haiku-4-5",
    ]);
  });

  it("uses the file's basename as the sessionId fallback", async () => {
    const file = path.join(dir, "11111111-2222-3333-4444-555555555555.jsonl");
    const raw = JSON.parse(makeAssistantLine());
    delete raw.sessionId;
    fs.writeFileSync(file, JSON.stringify(raw), "utf8");

    const out: UsageEvent[] = [];
    for await (const ev of parseFile(file, "/x/Alpha")) out.push(ev);

    expect(out).toHaveLength(1);
    expect(out[0]!.sessionId).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("handles an empty file without throwing", async () => {
    const file = path.join(dir, "empty.jsonl");
    fs.writeFileSync(file, "", "utf8");
    const out: UsageEvent[] = [];
    for await (const ev of parseFile(file, "/x/Alpha")) out.push(ev);
    expect(out).toEqual([]);
  });
});
