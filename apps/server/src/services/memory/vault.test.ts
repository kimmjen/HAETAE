import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { projectWiki, projectNotes } from "../../db/schema";
import { notesToVaultFiles, exportVault, reExportVaultIfExists } from "./vault";
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

describe("notesToVaultFiles — 파생 레이어 포함 (온톨로지·링크·토픽)", () => {
  const ontology = {
    concepts: [
      { id: "incremental-fold", label: "증분 합성", kind: "component" },
      { id: "keyset", label: "keyset 워터마크", kind: "tech" },
    ],
    relations: [
      { source: "incremental-fold", target: "keyset", type: "depends_on" as const, note: "워터마크로 증분" },
    ],
  };
  const links = [
    { noteSlug: "watermark", conceptId: "keyset" },
    { noteSlug: "watermark", conceptId: "unknown-concept" }, // dangling → dropped
    { noteSlug: "ghost-note", conceptId: "keyset" }, // dangling → dropped
  ];
  const topics = [
    { slug: "fold-pipeline", title: "합성 파이프라인", content: "# 합성 파이프라인\n\n본문", generatedAt: 1 },
  ];

  it("개념마다 concept-<id>.md 를 만들고 타입 관계를 [[]] 로 잇는다", () => {
    const files = notesToVaultFiles(NOTES, null, "proj", { ontology });
    const c = files.find((f) => f.name === "concept-incremental-fold.md")!;
    expect(c.content).toContain("# 증분 합성");
    expect(c.content).toContain("depends_on → [[concept-keyset|keyset 워터마크]]");
  });

  it("노트↔개념 링크를 양쪽에 심는다 (노트 footer + 개념 관련 노트), dangling 제거", () => {
    const files = notesToVaultFiles(NOTES, null, "proj", { ontology, links });
    const note = files.find((f) => f.name === "watermark.md")!;
    expect(note.content).toContain("## 관련 개념");
    expect(note.content).toContain("[[concept-keyset|keyset 워터마크]]");
    expect(note.content).not.toContain("unknown-concept"); // dangling dropped
    const concept = files.find((f) => f.name === "concept-keyset.md")!;
    expect(concept.content).toContain("## 관련 노트");
    expect(concept.content).toContain("[[watermark|워터마크 증분]]");
    expect(concept.content).not.toContain("ghost-note"); // dangling dropped
  });

  it("토픽 페이지를 topic-<slug>.md 로 내보내고 본문을 보존한다", () => {
    const files = notesToVaultFiles(NOTES, null, "proj", { topics });
    const t = files.find((f) => f.name === "topic-fold-pipeline.md")!;
    expect(t.content).toBe("# 합성 파이프라인\n\n본문\n");
  });

  it("index.md 에 개념·토픽 섹션이 추가된다", () => {
    const idx = notesToVaultFiles(NOTES, null, "proj", { ontology, topics }).find(
      (f) => f.name === "index.md",
    )!;
    expect(idx.content).toContain("## 개념");
    expect(idx.content).toContain("[[concept-keyset|keyset 워터마크]]");
    expect(idx.content).toContain("## 토픽 페이지");
    expect(idx.content).toContain("[[topic-fold-pipeline|합성 파이프라인]]");
  });

  it("파생 레이어가 없으면 노트 본문·파일 구성이 기존과 동일 (무회귀)", () => {
    const files = notesToVaultFiles(NOTES, null, "proj");
    expect(files.find((f) => f.name === "watermark.md")!.content).toBe(
      "# 워터마크 증분\n\n[[cursor]] 로 증분 흡수한다\n",
    );
    expect(files.some((f) => f.name.startsWith("concept-"))).toBe(false);
    expect(files.some((f) => f.name.startsWith("topic-"))).toBe(false);
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

describe("reExportVaultIfExists (freshness — 볼트 있는 프로젝트만)", () => {
  let db: Db;
  let root: string;
  beforeEach(() => {
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    root = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-vault-"));
    db.insert(projectNotes)
      .values({ projectPath: root, content: JSON.stringify({ notes: NOTES }), model: "m", generatedAt: 1 })
      .run();
  });
  afterEach(() => {
    closeDb();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("볼트 폴더가 없으면 스킵 — 뒤에서 새로 만들지 않는다", async () => {
    const res = await reExportVaultIfExists(root, db);
    expect(res.exported).toBe(false);
    expect(fs.existsSync(path.join(root, ".haetae", "vault"))).toBe(false);
  });

  it("볼트 폴더가 이미 있으면 재export 한다", async () => {
    const dir = path.join(root, ".haetae", "vault");
    fs.mkdirSync(dir, { recursive: true }); // user exported before → vault exists
    const res = await reExportVaultIfExists(root, db);
    expect(res.exported).toBe(true);
    expect(res.files).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(dir, "watermark.md"))).toBe(true);
  });

  it("볼트는 있지만 노트가 없으면 스킵 (비치명적)", async () => {
    fs.mkdirSync(path.join(root, ".haetae", "vault"), { recursive: true });
    db.delete(projectNotes).run();
    const res = await reExportVaultIfExists(root, db);
    expect(res.exported).toBe(false);
  });
});
