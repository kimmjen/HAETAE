import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { projectWiki, projectNotes, projectOntology, projectLinks } from "../../db/schema";
import { buildKnowledgeOverlay } from "./graph";

describe("buildKnowledgeOverlay — global graph notes/concepts layer", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });
  afterEach(() => closeDb());

  const seedWiki = (path: string) =>
    db.insert(projectWiki).values({ projectPath: path, content: "w", model: "m", generatedAt: 1000 }).run();
  const seedNotes = (path: string, notes: object[]) =>
    db.insert(projectNotes).values({ projectPath: path, content: JSON.stringify({ notes }), model: "m", generatedAt: 1000 }).run();
  const seedOntology = (path: string, concepts: object[]) =>
    db.insert(projectOntology).values({ projectPath: path, content: JSON.stringify({ concepts, relations: [] }), model: "m", generatedAt: 1000 }).run();
  const seedLinks = (path: string, links: object[]) =>
    db.insert(projectLinks).values({ projectPath: path, content: JSON.stringify({ links }), model: "m", generatedAt: 1000 }).run();

  it("is empty when notes are not requested", () => {
    seedWiki("/a");
    seedNotes("/a", [{ slug: "x", title: "X", content: "y" }]);
    expect(buildKnowledgeOverlay(["/a"], [], db)).toEqual({ nodes: [], edges: [] });
    expect(buildKnowledgeOverlay(["/a"], ["concepts"], db)).toEqual({ nodes: [], edges: [] });
  });

  it("adds namespaced note nodes + project→note membership edges", () => {
    seedWiki("/a");
    seedNotes("/a", [
      { slug: "a", title: "A", content: "[[b]]" },
      { slug: "b", title: "B", content: "x" },
    ]);

    const { nodes, edges } = buildKnowledgeOverlay(["/a"], ["notes"], db);
    expect(nodes.map((n) => n.id).sort()).toEqual(["note:/a:a", "note:/a:b"]);
    expect(nodes.every((n) => n.type === "note")).toBe(true);
    // Detail-panel resolution fields (no id parsing on the client).
    expect(nodes.find((n) => n.id === "note:/a:a")).toMatchObject({ projectPath: "/a", ref: "a" });
    expect(edges).toContainEqual(
      expect.objectContaining({ source: "project:/a", target: "note:/a:a", type: "related" }),
    );
  });

  it("namespaces ids by project so equal slugs across projects don't collide", () => {
    seedWiki("/a");
    seedWiki("/b");
    seedNotes("/a", [{ slug: "dup", title: "A dup", content: "x" }]);
    seedNotes("/b", [{ slug: "dup", title: "B dup", content: "x" }]);

    const { nodes } = buildKnowledgeOverlay(["/a", "/b"], ["notes"], db);
    expect(nodes.map((n) => n.id).sort()).toEqual(["note:/a:dup", "note:/b:dup"]);
  });

  it("caps notes per project to the top-degree set", () => {
    seedWiki("/a");
    // 10 notes, all linking to "hub" → hub has the highest degree; cap is 6.
    const notes = [{ slug: "hub", title: "Hub", content: "x" }];
    for (let i = 0; i < 9; i++) notes.push({ slug: `n${i}`, title: `N${i}`, content: "[[hub]]" });
    seedNotes("/a", notes);

    const { nodes } = buildKnowledgeOverlay(["/a"], ["notes"], db);
    const noteNodes = nodes.filter((n) => n.type === "note");
    expect(noteNodes).toHaveLength(6);
    expect(noteNodes.map((n) => n.id)).toContain("note:/a:hub");
  });

  it("surfaces a concept whose anchor note is below the degree cap", () => {
    seedWiki("/a");
    // hub + 8 linkers (high degree) push "lonely" out of the top-6 by degree.
    const notes = [{ slug: "hub", title: "Hub", content: "x" }, { slug: "lonely", title: "Lonely", content: "x" }];
    for (let i = 0; i < 8; i++) notes.push({ slug: `n${i}`, title: `N${i}`, content: "[[hub]]" });
    seedNotes("/a", notes);
    seedOntology("/a", [{ id: "c1", label: "개념", kind: "tech" }]);
    seedLinks("/a", [{ noteSlug: "lonely", conceptId: "c1" }]);

    const { nodes, edges } = buildKnowledgeOverlay(["/a"], ["notes", "concepts"], db);
    // "lonely" is folded in as a concept anchor even though it's low-degree.
    expect(nodes.map((n) => n.id)).toContain("note:/a:lonely");
    expect(nodes).toContainEqual(expect.objectContaining({ id: "concept:/a:c1", type: "concept" }));
    expect(edges).toContainEqual(
      expect.objectContaining({ source: "note:/a:lonely", target: "concept:/a:c1", type: "mentions" }),
    );
  });

  it("adds concept nodes + mention edges only for visible notes", () => {
    seedWiki("/a");
    seedNotes("/a", [{ slug: "a", title: "A", content: "x" }]);
    seedOntology("/a", [{ id: "c1", label: "결정", kind: "decision" }]);
    seedLinks("/a", [{ noteSlug: "a", conceptId: "c1" }]);

    const { nodes, edges } = buildKnowledgeOverlay(["/a"], ["notes", "concepts"], db);
    expect(nodes).toContainEqual(
      expect.objectContaining({ id: "concept:/a:c1", type: "concept", kind: "decision" }),
    );
    expect(edges).toContainEqual(
      expect.objectContaining({ source: "note:/a:a", target: "concept:/a:c1", type: "mentions" }),
    );
  });
});
