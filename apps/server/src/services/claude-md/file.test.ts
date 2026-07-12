import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations, type Db } from "../../db";
import { listBackups } from "../claude-fs/backup";
import {
  ClaudeMdFileNotFoundError,
  ClaudeMdPathDeniedError,
  ClaudeMdStaleMtimeError,
  readClaudeMd,
  writeClaudeMd,
} from "./file";

describe("readClaudeMd / writeClaudeMd", () => {
  let tmpHome: string;
  let tmpProjectA: string;
  let db: Db;
  let slugA: string;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-cmd-"));
    tmpProjectA = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-projA-"));
    process.env.HAETAE_CLAUDE_HOME = tmpHome;
    process.env.HAETAE_PROJECT_ROOTS = tmpProjectA;
    db = openDb({ filePath: ":memory:" });
    runMigrations(db);
    // slug 는 discover 가 만드는데 basename 기반.
    slugA = path.basename(tmpProjectA).toLowerCase();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProjectA, { recursive: true, force: true });
    delete process.env.HAETAE_CLAUDE_HOME;
    delete process.env.HAETAE_PROJECT_ROOTS;
  });

  it("global read — 파일 없으면 FileNotFound", async () => {
    await expect(readClaudeMd(db, "global")).rejects.toBeInstanceOf(
      ClaudeMdFileNotFoundError,
    );
  });

  it("global write → read 왕복", async () => {
    const r = await writeClaudeMd(db, "global", "hello world\n");
    expect(r.size).toBeGreaterThan(0);
    const read = await readClaudeMd(db, "global");
    expect(read.content).toBe("hello world\n");
  });

  it("team write 는 알려진 slug 만 허용", async () => {
    await expect(
      writeClaudeMd(db, "team", "x", {}, "no-such-slug"),
    ).rejects.toBeInstanceOf(ClaudeMdPathDeniedError);
  });

  it("team write — 실제 프로젝트 root 의 CLAUDE.md 에 기록", async () => {
    await writeClaudeMd(db, "team", "team rules\n", {}, slugA);
    const onDisk = fs.readFileSync(
      path.join(tmpProjectA, "CLAUDE.md"),
      "utf8",
    );
    expect(onDisk).toBe("team rules\n");
  });

  it("personal write — CLAUDE.local.md 에 기록", async () => {
    await writeClaudeMd(db, "personal", "private notes\n", {}, slugA);
    const onDisk = fs.readFileSync(
      path.join(tmpProjectA, "CLAUDE.local.md"),
      "utf8",
    );
    expect(onDisk).toBe("private notes\n");
  });

  it("덮어쓰기 전 이전 내용을 file_backups 에 백업", async () => {
    await writeClaudeMd(db, "global", "v1\n");
    await writeClaudeMd(db, "global", "v2\n");
    const backups = listBackups(db, "claude-md-global", "CLAUDE.md");
    expect(backups).toHaveLength(1);
    expect(backups[0].content).toBe("v1\n");
  });

  it("mtime 충돌 — expectedMtime 이 실제와 다르면 Stale", async () => {
    await writeClaudeMd(db, "global", "v1\n");
    await expect(
      writeClaudeMd(db, "global", "v2\n", { expectedMtime: 0 }),
    ).rejects.toBeInstanceOf(ClaudeMdStaleMtimeError);
  });

  it("새 파일 (mtime 없음) 은 expectedMtime 무관하게 생성", async () => {
    const r = await writeClaudeMd(db, "global", "fresh\n", {
      expectedMtime: null,
    });
    expect(r.size).toBeGreaterThan(0);
  });

  describe("subdir", () => {
    it("subPath 없으면 PathDenied", async () => {
      await expect(
        writeClaudeMd(db, "subdir", "x", {}, slugA),
      ).rejects.toBeInstanceOf(ClaudeMdPathDeniedError);
    });

    it(".. 포함 거부", async () => {
      await expect(
        writeClaudeMd(db, "subdir", "x", {}, slugA, "../escape/CLAUDE.md"),
      ).rejects.toBeInstanceOf(ClaudeMdPathDeniedError);
    });

    it("절대 경로 거부", async () => {
      await expect(
        writeClaudeMd(db, "subdir", "x", {}, slugA, "/etc/CLAUDE.md"),
      ).rejects.toBeInstanceOf(ClaudeMdPathDeniedError);
    });

    it("basename 이 CLAUDE.md 아니면 거부", async () => {
      await expect(
        writeClaudeMd(db, "subdir", "x", {}, slugA, "docs/NOTES.md"),
      ).rejects.toBeInstanceOf(ClaudeMdPathDeniedError);
    });

    it("자동 제외 폴더 (node_modules) 안 거부", async () => {
      await expect(
        writeClaudeMd(
          db,
          "subdir",
          "x",
          {},
          slugA,
          "node_modules/pkg/CLAUDE.md",
        ),
      ).rejects.toBeInstanceOf(ClaudeMdPathDeniedError);
    });

    it("dot-dir (.idea) 안 거부", async () => {
      await expect(
        writeClaudeMd(db, "subdir", "x", {}, slugA, ".idea/CLAUDE.md"),
      ).rejects.toBeInstanceOf(ClaudeMdPathDeniedError);
    });

    it("깊이 5 초과 거부", async () => {
      await expect(
        writeClaudeMd(
          db,
          "subdir",
          "x",
          {},
          slugA,
          "a/b/c/d/e/f/CLAUDE.md",
        ),
      ).rejects.toBeInstanceOf(ClaudeMdPathDeniedError);
    });

    it("write → read 왕복 + 디스크 기록", async () => {
      await writeClaudeMd(
        db,
        "subdir",
        "docs rules\n",
        {},
        slugA,
        "docs/CLAUDE.md",
      );
      const read = await readClaudeMd(db, "subdir", slugA, "docs/CLAUDE.md");
      expect(read.content).toBe("docs rules\n");
      expect(
        fs.readFileSync(path.join(tmpProjectA, "docs", "CLAUDE.md"), "utf8"),
      ).toBe("docs rules\n");
    });

    it("백업 scope 는 slug + subPath 까지 포함", async () => {
      await writeClaudeMd(
        db,
        "subdir",
        "v1\n",
        {},
        slugA,
        "docs/CLAUDE.md",
      );
      await writeClaudeMd(
        db,
        "subdir",
        "v2\n",
        {},
        slugA,
        "docs/CLAUDE.md",
      );
      const backups = listBackups(
        db,
        `claude-md-subdir:${slugA}:docs/CLAUDE.md`,
        "docs/CLAUDE.md",
      );
      expect(backups).toHaveLength(1);
      expect(backups[0].content).toBe("v1\n");
    });
  });
});
