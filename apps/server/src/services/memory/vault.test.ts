import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { projectWiki, projectNotes } from "../../db/schema";
import { notesToVaultFiles, exportVault } from "./vault";
import type { AtomicNote } from "./notes";

const NOTES: AtomicNote[] = [
  { slug: "watermark", title: "워터마크 증분", content: "[[cursor]] 로 증분 흡수한다" },
  { slug: "cursor", title: "커서", content: "keyset 페이지네이션" },
];

describe("notesToVaultFiles", () => {
  it("writes one <slug>.md per note with title H1 + body (wikilinks preserved)", () => {
    const files = notesToVaultFiles(NOTES, null, "proj");
    const wm = files.find((f) => f.name === "watermark.md")!;
    expect(wm.content).toBe("# 워터마크 증분\n\n[[cursor]] 로 증분 흡수한다\n");
    expect(files.some((f) => f.name === "cursor.md")).toBe(true);
  });

  it("adds an index.md cataloging notes as [[slug|title]]", () => {
    const idx = notesToVaultFiles(NOTES, null, "proj").find((f) => f.name === "index.md")!;
    expect(idx.content).toContain("[[watermark|워터마크 증분]]");
    expect(idx.content).toContain("[[cursor|커서]]");
  });

  it("includes the wiki page only when wiki content exists", () => {
    expect(notesToVaultFiles(NOTES, "위키 본문", "proj").some((f) => f.name === "_wiki.md")).toBe(true);
    expect(notesToVaultFiles(NOTES, null, "proj").some((f) => f.name === "_wiki.md")).toBe(false);
    expect(notesToVaultFiles(NOTES, "  ", "proj").some((f) => f.name === "_wiki.md")).toBe(false);
  });
});

describe("exportVault (DB + fs)", () => {
  let db: Db;
  let root: string;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    root = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-vault-"));
  });
  afterEach(() => {
    closeDb();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("throws when there are no notes", async () => {
    await expect(exportVault(root, db)).rejects.toThrow();
  });

  it("writes the vault to <project>/.haetae/vault and returns the count", async () => {
    db.insert(projectNotes)
      .values({ projectPath: root, content: JSON.stringify({ notes: NOTES }), model: "m", generatedAt: 1 })
      .run();
    db.insert(projectWiki)
      .values({ projectPath: root, content: "# Wiki\n- x", model: "m", generatedAt: 1 })
      .run();

    const res = await exportVault(root, db);
    expect(res.files).toBe(4); // 2 notes + index + wiki
    const dir = path.join(root, ".haetae", "vault");
    expect(fs.existsSync(path.join(dir, "watermark.md"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "index.md"))).toBe(true);
    expect(fs.existsSync(path.join(dir, "_wiki.md"))).toBe(true);
    expect(fs.readFileSync(path.join(dir, "watermark.md"), "utf8")).toContain("[[cursor]]");
  });
});
