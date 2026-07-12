import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { projectWiki, projectNotes, projectOntology, projectEval } from "../../db/schema";
import { buildBrainIndex } from "./brain-index";

describe("buildBrainIndex — cross-project knowledge catalog", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });
  afterEach(() => closeDb());

  const insertWiki = (projectPath: string, generatedAt: number, summary: string | null = null) =>
    db
      .insert(projectWiki)
      .values({ projectPath, content: "w", summary, model: "claude-opus-4-8", generatedAt })
      .run();

  const insertNotes = (projectPath: string, generatedAt: number, notes: object[]) =>
    db
      .insert(projectNotes)
      .values({ projectPath, content: JSON.stringify({ notes }), model: "claude-opus-4-8", generatedAt })
      .run();

  const insertOntology = (projectPath: string, generatedAt: number, concepts: object[]) =>
    db
      .insert(projectOntology)
      .values({
        projectPath,
        content: JSON.stringify({ concepts, relations: [] }),
        model: "claude-opus-4-8",
        generatedAt,
      })
      .run();

  const insertEval = (projectPath: string, generatedAt: number, score: number) =>
    db
      .insert(projectEval)
      .values({
        projectPath,
        content: JSON.stringify({ score, summary: "s", issues: [] }),
        score,
        model: "claude-opus-4-8",
        generatedAt,
      })
      .run();

  it("returns empty catalog when no wikis exist", () => {
    const idx = buildBrainIndex(db);
    expect(idx).toEqual({ projects: [], notes: [], concepts: [] });
  });

  it("aggregates wiki meta + notes + concepts across projects", () => {
    insertWiki("/a", 2000, "프로젝트 A");
    insertNotes("/a", 2000, [
      { slug: "a", title: "A", content: "[[b]] 참조" },
      { slug: "b", title: "B", content: "허브 노트" },
      { slug: "c", title: "C", content: "[[b]] 참조" },
    ]);
    insertOntology("/a", 1000, [{ id: "x", label: "결정 X", kind: "decision" }]);
    insertEval("/a", 2000, 70);
    insertWiki("/b", 1000);

    const idx = buildBrainIndex(db);

    // listProjectWikis orders generatedAt DESC → /a (2000) before /b (1000)
    expect(idx.projects.map((p) => p.projectPath)).toEqual(["/a", "/b"]);

    const a = idx.projects[0];
    expect(a.label).toBe("a");
    expect(a.wikiSummary).toBe("프로젝트 A");
    expect(a.evalScore).toBe(70);
    expect(a.noteCount).toBe(3);
    expect(a.conceptCount).toBe(1);
    expect(a.wikiStale).toBe(false); // no pending messages

    const b = idx.projects[1];
    expect(b.noteCount).toBe(0);
    expect(b.conceptCount).toBe(0);
    expect(b.evalScore).toBeNull();
  });

  it("ranks notes by wikilink degree (hubs first)", () => {
    insertWiki("/a", 2000);
    insertNotes("/a", 2000, [
      { slug: "a", title: "A", content: "[[b]] 참조" },
      { slug: "b", title: "B 허브", content: "내용" },
      { slug: "c", title: "C", content: "[[b]] 참조" },
    ]);

    const idx = buildBrainIndex(db);
    // b is referenced by a and c → degree 2; a and c → degree 1 each
    expect(idx.notes[0].slug).toBe("b");
    expect(idx.notes[0].degree).toBe(2);
  });

  it("flags derived staleness when wiki is newer than the derived layer", () => {
    insertWiki("/a", 2000);
    insertNotes("/a", 2000, [{ slug: "a", title: "A", content: "x" }]);
    insertOntology("/a", 1000, [{ id: "x", label: "X", kind: "tech" }]); // older than wiki → stale

    const idx = buildBrainIndex(db);
    expect(idx.notes.every((n) => n.stale === false)).toBe(true);
    expect(idx.concepts.every((c) => c.stale === true)).toBe(true);
    expect(idx.concepts[0]).toMatchObject({ projectPath: "/a", id: "x", label: "X", kind: "tech" });
  });
});
