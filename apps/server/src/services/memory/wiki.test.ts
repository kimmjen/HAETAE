import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { sessionMessages, memories } from "../../db/schema";
import {
  selectDelta,
  loadDeltaMessages,
  countPending,
  loadMemories,
  selectMemoriesPrelude,
  buildPrompt,
  isDegenerateWikiOutput,
  type DeltaMessage,
  type MemoryRow,
} from "./wiki";

function msg(ts: number, uuid: string, content: string, type = "user"): DeltaMessage {
  return { ts, uuid, type, content };
}

function mem(ts: number, content: string): MemoryRow {
  return { ts, content };
}

describe("selectDelta (pure)", () => {
  it("takes the oldest-first prefix that fits the budget and advances the watermark", () => {
    const messages = [
      msg(10, "a", "x".repeat(30)),
      msg(20, "b", "y".repeat(30)),
      msg(30, "c", "z".repeat(30)),
    ];
    const { selected, lastTs, lastUuid } = selectDelta(messages, 70);
    // 30 + 30 = 60 <= 70, third (90) would exceed → stop after two
    expect(selected.map((m) => m.uuid)).toEqual(["a", "b"]);
    expect(lastTs).toBe(20);
    expect(lastUuid).toBe("b");
  });

  it("always includes at least one message even if it alone exceeds budget (no stuck watermark)", () => {
    const messages = [msg(10, "big", "x".repeat(500)), msg(20, "next", "y")];
    const { selected, lastTs, lastUuid } = selectDelta(messages, 80);
    expect(selected.map((m) => m.uuid)).toEqual(["big"]);
    expect(lastTs).toBe(10);
    expect(lastUuid).toBe("big");
  });

  it("includes everything when it all fits", () => {
    const messages = [msg(10, "a", "x"), msg(20, "b", "y")];
    const { selected, lastUuid } = selectDelta(messages, 1000);
    expect(selected).toHaveLength(2);
    expect(lastUuid).toBe("b");
  });
});

describe("loadDeltaMessages / countPending (keyset watermark)", () => {
  let db: Db;

  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    // Seed: 4 user/assistant messages + 1 compact summary that must be excluded.
    const rows = [
      { uuid: "m1", ts: 100, type: "user", content: "first" },
      { uuid: "m2", ts: 100, type: "assistant", content: "second (same ts)" },
      { uuid: "m3", ts: 200, type: "user", content: "third" },
      { uuid: "m4", ts: 300, type: "assistant", content: "fourth" },
    ];
    for (const r of rows) {
      db.insert(sessionMessages)
        .values({
          uuid: r.uuid,
          parentUuid: null,
          sessionId: "s1",
          projectPath: "/p",
          type: r.type,
          subtype: null,
          content: r.content,
          ts: r.ts,
          isCompactSummary: false,
        })
        .run();
    }
    // compact summary — must never appear in delta
    db.insert(sessionMessages)
      .values({
        uuid: "cs",
        parentUuid: null,
        sessionId: "s1",
        projectPath: "/p",
        type: "user",
        subtype: null,
        content: "COMPACT SUMMARY",
        ts: 250,
        isCompactSummary: true,
      })
      .run();
  });

  afterEach(() => closeDb());

  it("from the zero watermark returns all real messages oldest-first, excluding compact summaries", () => {
    const delta = loadDeltaMessages(db, "/p", 0, "");
    expect(delta.map((m) => m.uuid)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(countPending(db, "/p", 0, "")).toBe(4);
  });

  it("resolves same-ts ties by uuid — watermark (100,'m1') still returns m2", () => {
    const delta = loadDeltaMessages(db, "/p", 100, "m1");
    expect(delta.map((m) => m.uuid)).toEqual(["m2", "m3", "m4"]);
  });

  it("advancing the watermark past a ts excludes everything at or before it", () => {
    const delta = loadDeltaMessages(db, "/p", 200, "m3");
    expect(delta.map((m) => m.uuid)).toEqual(["m4"]);
    expect(countPending(db, "/p", 200, "m3")).toBe(1);
  });

  it("watermark at the newest message yields an empty delta", () => {
    expect(loadDeltaMessages(db, "/p", 300, "m4")).toHaveLength(0);
    expect(countPending(db, "/p", 300, "m4")).toBe(0);
  });
});

describe("selectMemoriesPrelude (pure)", () => {
  it("returns empty string when there are no memories", () => {
    expect(selectMemoriesPrelude([])).toBe("");
  });

  it("joins summaries oldest-first with the date prefix", () => {
    const out = selectMemoriesPrelude([mem(0, "alpha"), mem(86_400_000, "beta")]);
    expect(out).toContain("alpha");
    expect(out).toContain("beta");
    // oldest first
    expect(out.indexOf("alpha")).toBeLessThan(out.indexOf("beta"));
  });

  it("stops at the budget but always keeps at least one summary", () => {
    const rows = [mem(0, "x".repeat(500)), mem(1000, "y".repeat(500))];
    const out = selectMemoriesPrelude(rows, 80);
    expect(out).toContain("x".repeat(500));
    expect(out).not.toContain("y".repeat(500));
  });

  it("skips empty-content rows", () => {
    expect(selectMemoriesPrelude([mem(0, "   "), mem(1, "real")])).toContain("real");
  });
});

describe("loadMemories", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    for (const m of [
      { ts: 300, content: "third" },
      { ts: 100, content: "first" },
      { ts: 200, content: "second" },
    ]) {
      db.insert(memories)
        .values({ sessionId: "s1", projectPath: "/p", content: m.content, ts: m.ts })
        .run();
    }
    // a memory for a different project must not leak in
    db.insert(memories)
      .values({ sessionId: "s2", projectPath: "/other", content: "elsewhere", ts: 150 })
      .run();
  });
  afterEach(() => closeDb());

  it("returns the project's summaries oldest-first, scoped to the project", () => {
    const rows = loadMemories(db, "/p");
    expect(rows.map((r) => r.content)).toEqual(["first", "second", "third"]);
  });
});

describe("buildPrompt — memories prelude only on bootstrap", () => {
  const sel = [msg(0, "a", "hello", "user")];

  it("includes the prelude when creating from scratch (empty wiki)", () => {
    const p = buildPrompt("proj", "", sel, 1, "COMPACTED HISTORY HERE");
    expect(p).toContain("COMPRESSED LONG-TERM MEMORY");
    expect(p).toContain("COMPACTED HISTORY HERE");
  });

  it("omits the prelude block when there are no memories", () => {
    const p = buildPrompt("proj", "", sel, 1, "");
    expect(p).not.toContain("COMPRESSED LONG-TERM MEMORY");
  });

  it("never injects the prelude on the incremental (existing wiki) path", () => {
    const p = buildPrompt("proj", "# Existing wiki", sel, 1, "COMPACTED HISTORY HERE");
    expect(p).not.toContain("COMPACTED HISTORY HERE");
    expect(p).toContain("CURRENT WIKI");
  });
});

describe("buildPrompt — audit findings feed back into the incremental wiki", () => {
  const sel = [msg(0, "a", "hello", "user")];
  const findings = "- [accuracy/high] Y 근거 없음 → 고칠 방향: 삭제";

  it("injects the audit findings + a correction rule on the incremental path", () => {
    const p = buildPrompt("proj", "# Existing wiki", sel, 1, "", findings);
    expect(p).toContain("AUDIT FINDINGS");
    expect(p).toContain("Y 근거 없음");
    expect(p).toMatch(/ADDRESS the audit findings/i);
  });

  it("omits the audit block when there are no findings (no regression)", () => {
    const p = buildPrompt("proj", "# Existing wiki", sel, 1, "", "");
    expect(p).not.toContain("AUDIT FINDINGS");
  });

  it("never injects findings on the bootstrap (empty wiki) path", () => {
    const p = buildPrompt("proj", "", sel, 1, "", findings);
    expect(p).not.toContain("AUDIT FINDINGS");
  });
});

describe("isDegenerateWikiOutput — 파괴적 합성 결과 거부", () => {
  const good = "# P\n\n## 개요\n" + "실제 내용 ".repeat(50);

  it("절대 하한 미만이면 부트스트랩이라도 거부", () => {
    expect(isDegenerateWikiOutput("# HAETAE", null)).toBe(true);
    expect(isDegenerateWikiOutput("   \n  ", null)).toBe(true);
  });

  it("정상 크기 출력은 통과 (부트스트랩/증분 모두)", () => {
    expect(isDegenerateWikiOutput(good, null)).toBe(false);
    expect(isDegenerateWikiOutput(good, good)).toBe(false);
  });

  it("기존 위키 대비 파국적 축소는 거부 — 증분 folding은 합쳐질 뿐 무너지지 않는다", () => {
    const prev = "x".repeat(20_000);
    const shrunk = "y".repeat(1_000); // 5% — 실패한 합성
    expect(isDegenerateWikiOutput(shrunk, prev)).toBe(true);
    const stillFine = "y".repeat(10_000); // 50% — 정상 범위
    expect(isDegenerateWikiOutput(stillFine, prev)).toBe(false);
  });
});
