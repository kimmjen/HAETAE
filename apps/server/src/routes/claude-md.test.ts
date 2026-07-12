import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations } from "../db";
import { registerClaudeMdRoutes } from "./claude-md";

const HOME_ENV = "HAETAE_CLAUDE_HOME";
const ROOTS_ENV = "HAETAE_PROJECT_ROOTS";

describe("claude-md routes", () => {
  let app: FastifyInstance;
  let tmpHome: string;
  let tmpProjectA: string;
  let slugA: string;
  let originalHome: string | undefined;
  let originalRoots: string | undefined;

  beforeEach(async () => {
    originalHome = process.env[HOME_ENV];
    originalRoots = process.env[ROOTS_ENV];
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-cmd-"));
    tmpProjectA = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-projA-"));
    process.env[HOME_ENV] = tmpHome;
    process.env[ROOTS_ENV] = tmpProjectA;
    slugA = path.basename(tmpProjectA).toLowerCase();

    runMigrations(openDb({ filePath: ":memory:" }));

    app = Fastify({ logger: false });
    await registerClaudeMdRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    closeDb();
    if (originalHome === undefined) delete process.env[HOME_ENV];
    else process.env[HOME_ENV] = originalHome;
    if (originalRoots === undefined) delete process.env[ROOTS_ENV];
    else process.env[ROOTS_ENV] = originalRoots;
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpProjectA, { recursive: true, force: true });
  });

  it("GET /api/claude-md — global + projectA team/personal 3개", async () => {
    const r = await app.inject({ method: "GET", url: "/api/claude-md" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    expect(body.data).toHaveLength(3);
    expect(body.data[0].type).toBe("global");
  });

  it("GET /api/claude-md/file — 없는 global 은 404", async () => {
    const r = await app.inject({
      method: "GET",
      url: "/api/claude-md/file?type=global",
    });
    expect(r.statusCode).toBe(404);
  });

  it("PUT /api/claude-md/file — 새 global 쓰기 → GET 으로 회수", async () => {
    const put = await app.inject({
      method: "PUT",
      url: "/api/claude-md/file",
      payload: { type: "global", content: "hello\n" },
    });
    expect(put.statusCode).toBe(200);

    const get = await app.inject({
      method: "GET",
      url: "/api/claude-md/file?type=global",
    });
    expect(get.statusCode).toBe(200);
    expect(get.json().data.content).toBe("hello\n");
  });

  it("PUT — team 미지정 slug 는 403", async () => {
    const r = await app.inject({
      method: "PUT",
      url: "/api/claude-md/file",
      payload: { type: "team", projectSlug: "no-such", content: "x" },
    });
    expect(r.statusCode).toBe(403);
  });

  it("PUT — mtime 충돌은 409", async () => {
    await app.inject({
      method: "PUT",
      url: "/api/claude-md/file",
      payload: { type: "global", content: "v1\n" },
    });
    const r = await app.inject({
      method: "PUT",
      url: "/api/claude-md/file",
      payload: { type: "global", content: "v2\n", expectedMtime: 0 },
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe("stale_mtime");
  });

  it("PUT — team write 후 그 프로젝트 디스크 경로에 실제 기록", async () => {
    const r = await app.inject({
      method: "PUT",
      url: "/api/claude-md/file",
      payload: { type: "team", projectSlug: slugA, content: "team!\n" },
    });
    expect(r.statusCode).toBe(200);
    expect(
      fs.readFileSync(path.join(tmpProjectA, "CLAUDE.md"), "utf8"),
    ).toBe("team!\n");
  });

  it("GET /api/claude-md — subdir CLAUDE.md 도 인덱스에 포함", async () => {
    fs.mkdirSync(path.join(tmpProjectA, "docs"));
    fs.writeFileSync(
      path.join(tmpProjectA, "docs", "CLAUDE.md"),
      "docs rules\n",
    );
    const r = await app.inject({ method: "GET", url: "/api/claude-md" });
    expect(r.statusCode).toBe(200);
    const body = r.json();
    const sub = body.data.find(
      (e: { type: string }) => e.type === "subdir",
    );
    expect(sub).toBeDefined();
    expect(sub.subPath).toBe("docs/CLAUDE.md");
  });

  it("PUT — subdir write 가 등록 외 경로 거부 (403)", async () => {
    const r = await app.inject({
      method: "PUT",
      url: "/api/claude-md/file",
      payload: {
        type: "subdir",
        projectSlug: slugA,
        subPath: "../escape/CLAUDE.md",
        content: "x",
      },
    });
    expect(r.statusCode).toBe(403);
  });

  it("GET → PUT → GET subdir 왕복", async () => {
    const write = await app.inject({
      method: "PUT",
      url: "/api/claude-md/file",
      payload: {
        type: "subdir",
        projectSlug: slugA,
        subPath: "docs/CLAUDE.md",
        content: "hello docs\n",
      },
    });
    expect(write.statusCode).toBe(200);
    const read = await app.inject({
      method: "GET",
      url: `/api/claude-md/file?type=subdir&projectSlug=${slugA}&subPath=docs/CLAUDE.md`,
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().data.content).toBe("hello docs\n");
  });
});
