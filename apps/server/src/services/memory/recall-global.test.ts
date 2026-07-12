import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { projectNotes } from "../../db/schema";
import { collectGlobalNotes } from "./recall-global";

describe("collectGlobalNotes — cross-project note index", () => {
  let db: Db;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });
  afterEach(() => closeDb());

  const seed = (projectPath: string, notes: object[]) =>
    db
      .insert(projectNotes)
      .values({ projectPath, content: JSON.stringify({ notes }), model: "m", generatedAt: 1 })
      .run();

  it("is empty when no project has notes", () => {
    expect(collectGlobalNotes(db)).toEqual([]);
  });

  it("flattens every project's notes with a derived projectName", () => {
    seed("/Users/me/Alpha", [{ slug: "a", title: "A", content: "x" }]);
    seed("/Users/me/Beta", [
      { slug: "b1", title: "B1", content: "y" },
      { slug: "b2", title: "B2", content: "z" },
    ]);

    const all = collectGlobalNotes(db);
    expect(all).toHaveLength(3);
    expect(all.map((g) => `${g.projectName}/${g.note.slug}`).sort()).toEqual([
      "Alpha/a",
      "Beta/b1",
      "Beta/b2",
    ]);
    expect(all.find((g) => g.note.slug === "a")).toMatchObject({
      projectPath: "/Users/me/Alpha",
      projectName: "Alpha",
    });
  });
});
