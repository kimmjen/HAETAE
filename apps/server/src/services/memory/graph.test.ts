import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { sessionMessages, usageEvents } from "../../db/schema";
import {
  extractFileTopics,
  buildProjectGraph,
  buildGlobalGraph,
  buildSessionLocalGraph,
} from "./graph";

function m(sessionId: string, content: string | null) {
  return { sessionId, content };
}

describe("extractFileTopics (pure)", () => {
  it("merges path variants by basename and counts mentions", () => {
    const { topics, sessionMentions } = extractFileTopics([
      m("s1", "edit apps/server/src/wiki.ts and also wiki.ts again"),
      m("s2", "look at wiki.ts"),
    ]);
    const wiki = topics.find((t) => t.key === "wiki.ts");
    expect(wiki).toBeDefined();
    expect(wiki!.sessions.size).toBe(2); // s1 + s2
    expect(wiki!.count).toBe(3); // 2 in s1, 1 in s2
    expect(sessionMentions.get("s1")!.get("wiki.ts")).toBe(2);
  });

  it("ranks files by distinct-session spread (links matter most)", () => {
    const { topics } = extractFileTopics([
      m("s1", "shared.ts solo.ts"),
      m("s2", "shared.ts"),
      m("s3", "shared.ts"),
    ]);
    // shared.ts spans 3 sessions, solo.ts only 1 → shared.ts ranks first
    expect(topics[0].key).toBe("shared.ts");
  });

  it("ignores prose with no file references", () => {
    expect(extractFileTopics([m("s1", "we discussed the design at length")]).topics).toHaveLength(0);
  });

  it("recognizes many code extensions, skips non-code", () => {
    const { topics } = extractFileTopics([
      m("s1", "schema.sql config.yaml main.py App.tsx notes.txt photo.png"),
    ]);
    const keys = topics.map((t) => t.key).sort();
    expect(keys).toContain("schema.sql");
    expect(keys).toContain("config.yaml");
    expect(keys).toContain("main.py");
    expect(keys).toContain("app.tsx");
    // .txt / .png are not in the code-extension allowlist
    expect(keys).not.toContain("notes.txt");
    expect(keys).not.toContain("photo.png");
  });

  it("handles null content", () => {
    expect(extractFileTopics([m("s1", null)]).topics).toHaveLength(0);
  });

  it("drops universally-noisy config/meta files (denylist)", () => {
    const { topics } = extractFileTopics([
      m("s1", "package.json tsconfig.json CLAUDE.md README.md pnpm-lock.yaml map-core.js"),
    ]);
    const keys = topics.map((t) => t.key);
    expect(keys).toEqual(["map-core.js"]); // only the signal file survives
  });

  it("drops a file that appears in >80% of sessions as a stopword (DF filter)", () => {
    // 5 sessions; ubiquitous.ts in all 5 (100%), rare.ts in 1.
    const rows = [];
    for (let i = 0; i < 5; i++) rows.push(m(`s${i}`, "ubiquitous.ts"));
    rows.push(m("s0", "rare.ts"));
    const keys = extractFileTopics(rows).topics.map((t) => t.key);
    expect(keys).toContain("rare.ts");
    expect(keys).not.toContain("ubiquitous.ts");
  });

  it("keeps a frequent file when there are too few sessions for the DF ratio", () => {
    // Only 2 sessions (< DF_MIN_SESSIONS) → ratio filter does not apply.
    const keys = extractFileTopics([m("s0", "core.ts"), m("s1", "core.ts")]).topics.map((t) => t.key);
    expect(keys).toContain("core.ts");
  });
});

describe("buildProjectGraph", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });
  afterEach(() => closeDb());

  function addEvent(sessionId: string, ts: number, model = "claude-opus-4-7") {
    db.insert(usageEvents)
      .values({
        sessionId,
        messageId: `${sessionId}-${ts}`,
        projectPath: "/p",
        model,
        ts,
        inputTokens: 100,
        outputTokens: 200,
      })
      .run();
  }
  function addMsg(sessionId: string, uuid: string, ts: number, content: string) {
    db.insert(sessionMessages)
      .values({
        uuid,
        parentUuid: null,
        sessionId,
        projectPath: "/p",
        type: "assistant",
        subtype: null,
        content,
        ts,
        isCompactSummary: false,
      })
      .run();
  }

  it("returns empty graph for an unknown project", () => {
    expect(buildProjectGraph("/nope", db)).toEqual({ nodes: [], edges: [] });
  });

  it("builds session nodes, file-topic nodes, and edges from conversation", () => {
    const DAY = 86_400_000;
    addEvent("s1", 1 * DAY);
    addEvent("s2", 2 * DAY); // 1 day after s1 → temporal edge
    addMsg("s1", "u1", 1 * DAY, "working on indexer.ts");
    addMsg("s2", "u2", 2 * DAY, "more changes in indexer.ts");

    const g = buildProjectGraph("/p", db);
    const sessionNodes = g.nodes.filter((n) => n.type === "session");
    const topicNodes = g.nodes.filter((n) => n.type === "topic");
    const temporal = g.edges.filter((e) => e.type === "temporal");
    const topicEdges = g.edges.filter((e) => e.type === "topic");

    expect(sessionNodes.map((n) => n.sessionId).sort()).toEqual(["s1", "s2"]);
    expect(topicNodes.map((n) => n.label)).toEqual(["indexer.ts"]);
    expect(temporal).toHaveLength(1); // s1→s2 within 7 days
    // both sessions mention indexer.ts → two session→topic edges
    expect(topicEdges).toHaveLength(2);
    expect(topicEdges.every((e) => e.target === "topic:indexer.ts")).toBe(true);
  });

  it("does not create a temporal edge across a gap > 7 days", () => {
    const DAY = 86_400_000;
    addEvent("s1", 1 * DAY);
    addEvent("s2", 20 * DAY);
    const g = buildProjectGraph("/p", db);
    expect(g.edges.filter((e) => e.type === "temporal")).toHaveLength(0);
  });

  it("creates related edges between files co-mentioned in >= 2 sessions", () => {
    const DAY = 86_400_000;
    addEvent("s1", 1 * DAY);
    addEvent("s2", 2 * DAY);
    // a.ts and b.ts appear together in both sessions → related; c.ts only once.
    addMsg("s1", "u1", 1 * DAY, "a.ts and b.ts and c.ts");
    addMsg("s2", "u2", 2 * DAY, "a.ts and b.ts again");

    const related = buildProjectGraph("/p", db).edges.filter((e) => e.type === "related");
    expect(related).toHaveLength(1);
    expect([related[0].source, related[0].target].sort()).toEqual(["topic:a.ts", "topic:b.ts"]);
    expect(related[0].weight).toBe(2); // shared in 2 sessions
  });
});

describe("buildGlobalGraph", () => {
  let db: Db;
  let claudeHome: string;
  const origRoots = process.env.HAETAE_PROJECT_ROOTS;
  const origHome = process.env.HAETAE_CLAUDE_HOME;

  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-ch-"));
    process.env.HAETAE_CLAUDE_HOME = claudeHome;
    process.env.HAETAE_PROJECT_ROOTS = ["/p/alpha", "/p/beta", "/p/gamma"].join(":");
  });
  afterEach(() => {
    closeDb();
    fs.rmSync(claudeHome, { recursive: true, force: true });
    if (origRoots === undefined) delete process.env.HAETAE_PROJECT_ROOTS;
    else process.env.HAETAE_PROJECT_ROOTS = origRoots;
    if (origHome === undefined) delete process.env.HAETAE_CLAUDE_HOME;
    else process.env.HAETAE_CLAUDE_HOME = origHome;
  });

  function seed(projectPath: string, sessionId: string, content: string) {
    db.insert(sessionMessages)
      .values({
        uuid: `${projectPath}-${sessionId}`,
        parentUuid: null,
        sessionId,
        projectPath,
        type: "user",
        subtype: null,
        content,
        ts: 1,
        isCompactSummary: false,
      })
      .run();
  }

  it("links projects that share >= 3 signal files, one node per project", async () => {
    // alpha & beta share core.ts, map.ts, util.ts (3); gamma shares none.
    seed("/p/alpha", "a1", "core.ts map.ts util.ts");
    seed("/p/beta", "b1", "core.ts map.ts util.ts");
    seed("/p/gamma", "g1", "unrelated.ts");

    const g = await buildGlobalGraph(db);
    const projectNodes = g.nodes.filter((n) => n.type === "project");
    expect(projectNodes.map((n) => n.label).sort()).toEqual(["alpha", "beta", "gamma"]);
    expect(projectNodes.every((n) => n.projectSlug)).toBe(true);

    const related = g.edges.filter((e) => e.type === "related");
    expect(related).toHaveLength(1);
    expect(related[0].weight).toBe(3);
  });

  it("does not link projects sharing fewer than 2 distinctive files", async () => {
    seed("/p/alpha", "a1", "core.ts foo.ts");
    seed("/p/beta", "b1", "core.ts bar.ts"); // only core.ts shared (1)
    const g = await buildGlobalGraph(db);
    expect(g.edges.filter((e) => e.type === "related")).toHaveLength(0);
  });

  it("ignores cross-project stopword files (in >50% of projects) when linking", async () => {
    // index.ts in all 4 projects (stopword); alpha/beta also share map.ts+util.ts.
    seed("/p/alpha", "a1", "index.ts map.ts util.ts");
    seed("/p/beta", "b1", "index.ts map.ts util.ts");
    seed("/p/gamma", "g1", "index.ts");
    process.env.HAETAE_PROJECT_ROOTS = ["/p/alpha", "/p/beta", "/p/gamma", "/p/delta"].join(":");
    seed("/p/delta", "d1", "index.ts");

    const g = await buildGlobalGraph(db);
    const related = g.edges.filter((e) => e.type === "related");
    // Only alpha↔beta (map.ts+util.ts = 2 distinctive). index.ts is in 4/4 → ignored.
    expect(related).toHaveLength(1);
    expect(related[0].weight).toBe(2);
  });
});

describe("buildSessionLocalGraph", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });
  afterEach(() => closeDb());

  function addEvent(sessionId: string, ts: number) {
    db.insert(usageEvents)
      .values({ sessionId, messageId: `${sessionId}-${ts}`, projectPath: "/p", model: "claude-opus-4-7", ts, inputTokens: 1, outputTokens: 1 })
      .run();
  }
  function addMsg(sessionId: string, uuid: string, ts: number, content: string) {
    db.insert(sessionMessages)
      .values({ uuid, parentUuid: null, sessionId, projectPath: "/p", type: "user", subtype: null, content, ts, isCompactSummary: false })
      .run();
  }

  it("returns empty for an unknown session", () => {
    expect(buildSessionLocalGraph("nope", db)).toEqual({ nodes: [], edges: [] });
  });

  it("keeps the 2-hop neighborhood: session → its files → sessions sharing them", () => {
    const DAY = 86_400_000;
    addEvent("s1", 1 * DAY);
    addEvent("s2", 30 * DAY); // far apart → no temporal edges
    addEvent("s3", 60 * DAY);
    addMsg("s1", "u1", 1 * DAY, "a.ts and b.ts");
    addMsg("s2", "u2", 30 * DAY, "a.ts here too"); // shares a.ts with s1
    addMsg("s3", "u3", 60 * DAY, "z.ts unrelated"); // no overlap with s1

    const g = buildSessionLocalGraph("s1", db);
    const sessions = g.nodes.filter((n) => n.type === "session").map((n) => n.sessionId).sort();
    const files = g.nodes.filter((n) => n.type === "topic").map((n) => n.label).sort();

    expect(sessions).toEqual(["s1", "s2"]); // s3 excluded (no shared file)
    expect(files).toEqual(["a.ts", "b.ts"]); // z.ts excluded
  });
});
