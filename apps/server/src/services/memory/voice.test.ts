import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { sessionMessages, userProfile } from "../../db/schema";
import { listBackups } from "../claude-fs/backup";
import {
  selectUserMessages,
  buildPrompt,
  injectProfileBlock,
  injectProfileIntoGlobalClaudeMd,
  loadUserMessages,
  type UserMessage,
} from "./voice";

function um(ts: number, content: string): UserMessage {
  return { ts, content };
}

describe("selectUserMessages (pure)", () => {
  it("takes most-recent messages within budget", () => {
    const msgs = [um(300, "c".repeat(40)), um(200, "b".repeat(40)), um(100, "a".repeat(40))];
    const out = selectUserMessages(msgs, 90); // 40+40=80 fits, third would be 120
    expect(out).toHaveLength(2);
    expect(out[0].ts).toBe(300);
  });
  it("always keeps at least one even if oversized", () => {
    expect(selectUserMessages([um(1, "x".repeat(500))], 80)).toHaveLength(1);
  });

  it("caps each message so a few huge pastes don't swallow the budget", () => {
    // 5 messages of 10k chars each; with a 1k per-msg cap they all fit in 60k.
    const msgs = Array.from({ length: 5 }, (_, i) => um(100 - i, "x".repeat(10_000)));
    const out = selectUserMessages(msgs, 60_000, 1_000);
    expect(out).toHaveLength(5); // without the cap, only ~6 would fit at full size
    expect(out[0].content.length).toBeLessThanOrEqual(1_001 + 1); // truncated + ellipsis
  });
});

describe("buildPrompt", () => {
  it("frames it as profiling the USER from their own messages", () => {
    const p = buildPrompt([um(0, "이모지 쓰지마")]);
    expect(p).toContain("이모지 쓰지마");
    expect(p).toMatch(/USER|Voice|커뮤니케이션/);
  });
});

describe("injectProfileBlock (pure)", () => {
  const PROFILE = "# 나의 맥락\n## Voice\n- 간결함 선호";

  it("creates a marker block when the file is empty", () => {
    const out = injectProfileBlock("", PROFILE, 0);
    expect(out).toContain("HAETAE:PROFILE:START");
    expect(out).toContain("간결함 선호");
    expect(out).toContain("HAETAE:PROFILE:END");
  });

  it("preserves existing user content and appends the block", () => {
    const out = injectProfileBlock("# My global rules\n- no emoji", PROFILE, 0);
    expect(out).toContain("My global rules");
    expect(out).toContain("HAETAE:PROFILE:START");
  });

  it("replaces an existing block in place (idempotent markers)", () => {
    const once = injectProfileBlock("user stuff", PROFILE, 0);
    const twice = injectProfileBlock(once, "# 나의 맥락\n## Voice\n- 바뀐 내용", 0);
    expect(twice).toContain("바뀐 내용");
    expect(twice).not.toContain("간결함 선호");
    expect(twice.match(/HAETAE:PROFILE:START/g)).toHaveLength(1); // not duplicated
    expect(twice).toContain("user stuff");
  });

  it("caps an oversized profile", () => {
    const huge = "x".repeat(10_000);
    const out = injectProfileBlock("", huge, 0);
    expect(out.length).toBeLessThan(huge.length); // truncated
    expect(out).toContain("…");
  });
});

describe("loadUserMessages", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });
  afterEach(() => closeDb());

  it("returns only user messages across projects, newest first, excluding assistant/compact", () => {
    const seed = (uuid: string, project: string, type: string, ts: number, content: string, compact = false) =>
      db.insert(sessionMessages).values({ uuid, parentUuid: null, sessionId: "s", projectPath: project, type, subtype: null, content, ts, isCompactSummary: compact }).run();
    seed("u1", "/a", "user", 100, "older");
    seed("u2", "/b", "user", 300, "newer");
    seed("a1", "/a", "assistant", 200, "assistant reply"); // excluded
    seed("c1", "/a", "user", 250, "compact", true); // excluded

    const out = loadUserMessages(db);
    expect(out.map((m) => m.content)).toEqual(["newer", "older"]);
  });
});

describe("injectProfileIntoGlobalClaudeMd — backs up the global config before overwrite", () => {
  let db: Db;
  let home: string;
  let prevHome: string | undefined;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    home = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-voice-"));
    prevHome = process.env.HAETAE_CLAUDE_HOME;
    process.env.HAETAE_CLAUDE_HOME = home;
    db.insert(userProfile)
      .values({ scope: "global", content: "# 나의 맥락\n## Voice\n- 한국어 선호", model: "m", messagesCovered: 3, generatedAt: 1000 })
      .run();
  });
  afterEach(() => {
    if (prevHome === undefined) delete process.env.HAETAE_CLAUDE_HOME;
    else process.env.HAETAE_CLAUDE_HOME = prevHome;
    closeDb();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("snapshots existing ~/.claude/CLAUDE.md before injecting, preserving user content", async () => {
    const userContent = "# My global rules\n- no emoji\n";
    fs.writeFileSync(path.join(home, "CLAUDE.md"), userContent, "utf8");

    const res = await injectProfileIntoGlobalClaudeMd(db);
    expect(res.action).toBe("updated");

    // prior content is recoverable from the backup table (hard rule)
    expect(listBackups(db, "claude-md-global", "CLAUDE.md").some((b) => b.content === userContent)).toBe(true);

    // file now carries the profile block AND the user's own content
    const written = fs.readFileSync(path.join(home, "CLAUDE.md"), "utf8");
    expect(written).toContain("no emoji");
    expect(written).toContain("나의 맥락");
  });

  it("does not back up when there is no existing file (nothing to lose)", async () => {
    await injectProfileIntoGlobalClaudeMd(db);
    expect(listBackups(db, "claude-md-global", "CLAUDE.md")).toEqual([]);
  });
});
