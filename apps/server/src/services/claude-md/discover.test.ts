import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { discoverClaudeMd, findSubdirClaudeMd } from "./discover";

describe("discoverClaudeMd", () => {
  let tmpHome: string;
  let tmpProjectA: string;
  let tmpProjectB: string;
  let db: Db;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-cmd-"));
    tmpProjectA = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-projA-"));
    tmpProjectB = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-projB-"));
    process.env.HAETAE_CLAUDE_HOME = tmpHome;
    process.env.HAETAE_PROJECT_ROOTS = `${tmpProjectA}:${tmpProjectB}`;
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProjectA, { recursive: true, force: true });
    fs.rmSync(tmpProjectB, { recursive: true, force: true });
    delete process.env.HAETAE_CLAUDE_HOME;
    delete process.env.HAETAE_PROJECT_ROOTS;
  });

  it("3 위치 모두 반환 — 존재 여부와 무관", async () => {
    const entries = await discoverClaudeMd(db);
    // global(1) + projectA(team+personal=2) + projectB(team+personal=2) = 5
    expect(entries).toHaveLength(5);
    expect(entries[0].type).toBe("global");
    expect(entries[0].key).toBe("global");
    expect(entries.filter((e) => e.type === "team")).toHaveLength(2);
    expect(entries.filter((e) => e.type === "personal")).toHaveLength(2);
  });

  it("team/personal entry 는 projectSlug/Name/AbsolutePath 함께 내려옴", async () => {
    const entries = await discoverClaudeMd(db);
    const team = entries.find(
      (e) => e.type === "team" && e.filePath.startsWith(tmpProjectA),
    )!;
    expect(team.projectSlug).toBeDefined();
    expect(team.projectName).toBeDefined();
    expect(team.projectAbsolutePath).toBe(tmpProjectA);
    // global 은 프로젝트 필드 없음
    const global = entries.find((e) => e.type === "global")!;
    expect(global.projectSlug).toBeUndefined();
    expect(global.projectName).toBeUndefined();
    expect(global.projectAbsolutePath).toBeUndefined();
  });

  it("디스크에 없는 파일은 exists=false 로", async () => {
    const entries = await discoverClaudeMd(db);
    for (const e of entries) {
      expect(e.exists).toBe(false);
      expect(e.preview).toBeNull();
      expect(e.size).toBe(0);
    }
  });

  it("실제 파일 있으면 exists=true + preview + size", async () => {
    fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), "global rules here\n");
    fs.writeFileSync(
      path.join(tmpProjectA, "CLAUDE.md"),
      "team-shared instructions\n",
    );
    fs.writeFileSync(
      path.join(tmpProjectA, "CLAUDE.local.md"),
      "personal overrides\n",
    );

    const entries = await discoverClaudeMd(db);
    const global = entries.find((e) => e.type === "global")!;
    expect(global.exists).toBe(true);
    expect(global.preview).toBe("global rules here");
    expect(global.size).toBeGreaterThan(0);

    const teamA = entries.find(
      (e) => e.type === "team" && e.filePath.startsWith(tmpProjectA),
    )!;
    expect(teamA.exists).toBe(true);
    expect(teamA.preview).toBe("team-shared instructions");

    const personalA = entries.find(
      (e) => e.type === "personal" && e.filePath.startsWith(tmpProjectA),
    )!;
    expect(personalA.exists).toBe(true);
    expect(personalA.preview).toBe("personal overrides");
  });

  it("frontmatter 첫 라인은 preview 에서 스킵", async () => {
    fs.writeFileSync(
      path.join(tmpHome, "CLAUDE.md"),
      "---\nname: test\n---\n\nreal first line\n",
    );
    const entries = await discoverClaudeMd(db);
    expect(entries[0].preview).toBe("real first line");
  });

  it("subdir CLAUDE.md 가 인덱스에 포함됨 (type=subdir + subPath)", async () => {
    fs.mkdirSync(path.join(tmpProjectA, "docs"));
    fs.writeFileSync(
      path.join(tmpProjectA, "docs", "CLAUDE.md"),
      "docs section rules\n",
    );
    const entries = await discoverClaudeMd(db);
    const sub = entries.find(
      (e) => e.type === "subdir" && e.filePath.includes("docs/CLAUDE.md"),
    );
    expect(sub).toBeDefined();
    expect(sub!.subPath).toBe("docs/CLAUDE.md");
    expect(sub!.exists).toBe(true);
    expect(sub!.preview).toBe("docs section rules");
    expect(sub!.projectSlug).toBeDefined();
    expect(sub!.projectAbsolutePath).toBe(tmpProjectA);
  });
});

describe("findSubdirClaudeMd", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-sub-"));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("root 의 CLAUDE.md 는 잡지 않음 (team type 이 담당)", async () => {
    fs.writeFileSync(path.join(tmpRoot, "CLAUDE.md"), "team\n");
    expect(await findSubdirClaudeMd(tmpRoot)).toEqual([]);
  });

  it("한 단계 깊이의 subdir 잡힘", async () => {
    fs.mkdirSync(path.join(tmpRoot, "docs"));
    fs.writeFileSync(path.join(tmpRoot, "docs", "CLAUDE.md"), "x\n");
    expect(await findSubdirClaudeMd(tmpRoot)).toEqual(["docs/CLAUDE.md"]);
  });

  it("자동 제외 폴더 (node_modules 등) 안의 CLAUDE.md 는 skip", async () => {
    fs.mkdirSync(path.join(tmpRoot, "node_modules", "x"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, "node_modules", "x", "CLAUDE.md"),
      "no\n",
    );
    expect(await findSubdirClaudeMd(tmpRoot)).toEqual([]);
  });

  it("dot-dirs (.idea, .vscode 등) 도 skip", async () => {
    fs.mkdirSync(path.join(tmpRoot, ".idea"));
    fs.writeFileSync(path.join(tmpRoot, ".idea", "CLAUDE.md"), "no\n");
    expect(await findSubdirClaudeMd(tmpRoot)).toEqual([]);
  });

  it("깊이 5 초과는 skip", async () => {
    // 6단계 깊이 a/b/c/d/e/f/CLAUDE.md — root 부터 6 단계 깊이라 skip
    const deep = path.join(tmpRoot, "a", "b", "c", "d", "e", "f");
    fs.mkdirSync(deep, { recursive: true });
    fs.writeFileSync(path.join(deep, "CLAUDE.md"), "deep\n");
    expect(await findSubdirClaudeMd(tmpRoot)).toEqual([]);
  });

  it("깊이 5 까지는 잡힘", async () => {
    const five = path.join(tmpRoot, "a", "b", "c", "d", "e");
    fs.mkdirSync(five, { recursive: true });
    fs.writeFileSync(path.join(five, "CLAUDE.md"), "five\n");
    expect(await findSubdirClaudeMd(tmpRoot)).toEqual([
      "a/b/c/d/e/CLAUDE.md",
    ]);
  });

  it("여러 subdir 동시 검출 (정렬 보장 안 함)", async () => {
    fs.mkdirSync(path.join(tmpRoot, "docs"));
    fs.mkdirSync(path.join(tmpRoot, "apps", "web"), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, "docs", "CLAUDE.md"), "1\n");
    fs.writeFileSync(path.join(tmpRoot, "apps", "web", "CLAUDE.md"), "2\n");
    const found = await findSubdirClaudeMd(tmpRoot);
    expect(found.sort()).toEqual(
      ["apps/web/CLAUDE.md", "docs/CLAUDE.md"].sort(),
    );
  });
});
