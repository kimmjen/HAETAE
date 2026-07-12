import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { projectNotes, projectOntology, projectWiki } from "../../db/schema";
import { callClaude } from "./claude-cli";
import {
  buildLinkPrompt,
  parseLinks,
  buildUnifiedGraph,
  getLinks,
  generateLinks,
} from "./links";
import type { AtomicNote } from "./notes";
import type { Ontology } from "./ontology";

vi.mock("./claude-cli", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./claude-cli")>();
  return { ...actual, callClaude: vi.fn() };
});

const notes: AtomicNote[] = [
  { slug: "oauth", title: "OAuth 한도", content: "[[keychain]] 에서 토큰" },
  { slug: "keychain", title: "키체인", content: "security 명령" },
];
const ontology: Ontology = {
  concepts: [
    { id: "auth", label: "인증", kind: "component" },
    { id: "limits", label: "사용 한도", kind: "goal" },
  ],
  relations: [{ source: "auth", target: "limits", type: "supports" }],
};

describe("parseLinks", () => {
  const slugs = ["oauth", "keychain"];
  const cids = ["auth", "limits"];
  it("keeps links with known slug+conceptId, drops unknown, dedups", () => {
    const raw = JSON.stringify({
      links: [
        { noteSlug: "oauth", conceptId: "auth" },
        { noteSlug: "oauth", conceptId: "ghost" }, // unknown concept
        { noteSlug: "nope", conceptId: "auth" }, // unknown note
        { noteSlug: "oauth", conceptId: "auth" }, // dupe
        { noteSlug: "keychain", conceptId: "limits" },
      ],
    });
    expect(parseLinks(raw, slugs, cids)).toEqual([
      { noteSlug: "oauth", conceptId: "auth" },
      { noteSlug: "keychain", conceptId: "limits" },
    ]);
  });
  it("tolerates fences/non-array → empty", () => {
    expect(parseLinks("그냥 텍스트", slugs, cids)).toEqual([]);
    expect(parseLinks('{"links": "x"}', slugs, cids)).toEqual([]);
  });
});

describe("buildLinkPrompt", () => {
  it("includes note and concept indexes", () => {
    const p = buildLinkPrompt(notes, ontology.concepts);
    expect(p).toContain("[oauth] OAuth 한도");
    expect(p).toContain("[auth] 인증");
    expect(p).toContain("limits");
  });
});

describe("buildUnifiedGraph", () => {
  it("merges note + concept nodes and adds note→concept mention edges", () => {
    const links = [
      { noteSlug: "oauth", conceptId: "auth" },
      { noteSlug: "oauth", conceptId: "ghost" }, // dangling — dropped
    ];
    const g = buildUnifiedGraph(notes, ontology, links);
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toContain("note:oauth"); // note layer
    expect(ids).toContain("concept:auth"); // ontology layer
    const mentions = g.edges.filter((e) => e.type === "mentions");
    expect(mentions).toHaveLength(1); // only the valid one
    expect(mentions[0]).toMatchObject({ source: "note:oauth", target: "concept:auth" });
    // wikilink + relation edges still present
    expect(g.edges.some((e) => e.type === "wikilink")).toBe(true);
    expect(g.edges.some((e) => e.type === "relation")).toBe(true);
  });
});

describe("generateLinks / getLinks (DB)", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    vi.mocked(callClaude).mockReset();
  });
  afterEach(() => closeDb());

  const seed = () => {
    db.insert(projectWiki)
      .values({ projectPath: "/p", content: "w", model: "claude-opus-4-7", generatedAt: 1000 })
      .run();
    db.insert(projectNotes)
      .values({ projectPath: "/p", content: JSON.stringify({ notes }), model: "m", generatedAt: 1000 })
      .run();
    db.insert(projectOntology)
      .values({ projectPath: "/p", content: JSON.stringify(ontology), model: "m", generatedAt: 1000 })
      .run();
  };

  it("throws when notes or ontology are missing", async () => {
    await expect(generateLinks("/p", "claude-opus-4-8", db)).rejects.toThrow();
  });

  it("generates, stores, and returns a unified graph; getLinks reads it back", async () => {
    seed();
    vi.mocked(callClaude).mockResolvedValue(
      JSON.stringify({ links: [{ noteSlug: "oauth", conceptId: "auth" }] }),
    );
    const res = await generateLinks("/p", "claude-opus-4-8", db);
    expect(res.links).toEqual([{ noteSlug: "oauth", conceptId: "auth" }]);
    expect(res.graph.edges.some((e) => e.type === "mentions")).toBe(true);

    const got = getLinks("/p", db)!;
    expect(got.links).toEqual(res.links);
    expect(got.graph.nodes.some((n) => n.id === "concept:auth")).toBe(true);
  });

  it("isStale when the wiki was regenerated after linking", async () => {
    seed();
    vi.mocked(callClaude).mockResolvedValue(JSON.stringify({ links: [] }));
    await generateLinks("/p", "claude-opus-4-8", db);
    db.update(projectWiki).set({ generatedAt: 9_999_999_999_999 }).run();
    expect(getLinks("/p", db)!.isStale).toBe(true);
  });
});
