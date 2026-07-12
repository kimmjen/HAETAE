import { afterEach, describe, expect, it, vi } from "vitest";
import { parseClaudeOauth } from "./keychain";

// The canonical blob — identical shape in the macOS Keychain item and the
// Linux/Windows ~/.claude/.credentials.json file.
const FULL = JSON.stringify({
  claudeAiOauth: {
    accessToken: "sk-ant-oat01-abc",
    refreshToken: "sk-ant-ort01-def",
    expiresAt: 1_773_751_428_445,
    scopes: ["user:inference"],
    subscriptionType: "pro",
    rateLimitTier: "tier-2",
  },
});

// Linux/Windows file commonly carries only the three core fields.
const MINIMAL = JSON.stringify({
  claudeAiOauth: {
    accessToken: "sk-ant-oat01-abc",
    refreshToken: "sk-ant-ort01-def",
    expiresAt: 1_773_751_428_445,
  },
});

describe("parseClaudeOauth", () => {
  it("parses the full blob", () => {
    expect(parseClaudeOauth(FULL)).toEqual({
      accessToken: "sk-ant-oat01-abc",
      refreshToken: "sk-ant-ort01-def",
      expiresAt: 1_773_751_428_445,
      scopes: ["user:inference"],
      subscriptionType: "pro",
      rateLimitTier: "tier-2",
    });
  });

  it("fills defaults for the minimal (3-field) file shape", () => {
    expect(parseClaudeOauth(MINIMAL)).toEqual({
      accessToken: "sk-ant-oat01-abc",
      refreshToken: "sk-ant-ort01-def",
      expiresAt: 1_773_751_428_445,
      scopes: [],
      subscriptionType: null,
      rateLimitTier: null,
    });
  });

  it("tolerates surrounding whitespace (security -w trailing newline)", () => {
    expect(parseClaudeOauth(`\n${MINIMAL}\n`)?.accessToken).toBe("sk-ant-oat01-abc");
  });

  it("returns null for invalid JSON", () => {
    expect(parseClaudeOauth("not json")).toBeNull();
    expect(parseClaudeOauth("")).toBeNull();
  });

  it("returns null when claudeAiOauth or accessToken is missing", () => {
    expect(parseClaudeOauth("{}")).toBeNull();
    expect(parseClaudeOauth(JSON.stringify({ claudeAiOauth: {} }))).toBeNull();
    expect(parseClaudeOauth(JSON.stringify({ other: { accessToken: "x" } }))).toBeNull();
  });

  it("returns null (not throw) for valid-JSON scalars — 'null', numbers, strings", () => {
    expect(parseClaudeOauth("null")).toBeNull();
    expect(parseClaudeOauth("42")).toBeNull();
    expect(parseClaudeOauth('"stringy"')).toBeNull();
  });
});

// readClaudeOauth's Linux/Windows path reads ~/.claude/.credentials.json via
// node:fs/promises — platform-agnostic Node, so it's verifiable here by mocking
// fs (the macOS Keychain path shells out to `security` and isn't unit-tested).
const readFileMock = vi.hoisted(() => vi.fn());
vi.mock("node:fs/promises", () => ({ readFile: readFileMock }));

describe("readClaudeOauth — credentials file path (linux/win)", () => {
  const origPlatform = process.platform;
  const origConfigDir = process.env.CLAUDE_CONFIG_DIR;

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: origPlatform });
    if (origConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = origConfigDir;
    readFileMock.mockReset();
    vi.resetModules();
  });

  async function load() {
    return (await import("./keychain")).readClaudeOauth;
  }

  it("reads and parses ~/.claude/.credentials.json on linux", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    delete process.env.CLAUDE_CONFIG_DIR;
    readFileMock.mockResolvedValue(MINIMAL);
    const readClaudeOauth = await load();
    const out = await readClaudeOauth();
    expect(out?.accessToken).toBe("sk-ant-oat01-abc");
    const calledPath = readFileMock.mock.calls[0]![0] as string;
    expect(calledPath).toContain(".claude");
    expect(calledPath).toContain(".credentials.json");
  });

  it("honours $CLAUDE_CONFIG_DIR for the file location", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    process.env.CLAUDE_CONFIG_DIR = "/custom/cfg";
    readFileMock.mockResolvedValue(MINIMAL);
    const readClaudeOauth = await load();
    await readClaudeOauth();
    expect(readFileMock).toHaveBeenCalledWith(
      expect.stringContaining("/custom/cfg"),
      "utf8",
    );
  });

  it("returns null when the file is absent", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    readFileMock.mockRejectedValue(new Error("ENOENT"));
    const readClaudeOauth = await load();
    expect(await readClaudeOauth()).toBeNull();
  });
});
