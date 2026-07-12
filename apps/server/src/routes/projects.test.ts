import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations } from "../db";
import { registerProjectsRoutes } from "./projects";

const ENV = "HAETAE_PROJECT_ROOTS";

describe("projects routes", () => {
  let app: FastifyInstance;
  let original: string | undefined;
  let tmpDir: string;

  beforeEach(async () => {
    original = process.env[ENV];
    delete process.env[ENV];
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-routes-projects-"));
    runMigrations(openDb({ filePath: ":memory:" }));

    app = Fastify({ logger: false });
    await registerProjectsRoutes(app);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    closeDb();
    if (original === undefined) delete process.env[ENV];
    else process.env[ENV] = original;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("GET /api/projects", () => {
    it("returns [] when no roots configured", async () => {
      const res = await app.inject({ method: "GET", url: "/api/projects" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("returns discovered projects with hasClaudeDir + hasSession flags and source", async () => {
      const dir = path.join(tmpDir, "Alpha");
      fs.mkdirSync(path.join(dir, ".claude"), { recursive: true });
      process.env[ENV] = dir;

      const res = await app.inject({ method: "GET", url: "/api/projects" });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Array<{
        slug: string;
        name: string;
        absolutePath: string;
        hasClaudeDir: boolean;
        hasSession: boolean;
        source: string;
      }>;
      expect(body).toHaveLength(1);
      expect(body[0]).toMatchObject({
        slug: "alpha",
        name: "Alpha",
        hasClaudeDir: true,
        // No ~/.claude/projects/<encoded>/ session yet → hasSession=false.
        // The route schema must surface this field; an earlier bug had
        // zod silently strip it because it wasn't declared.
        hasSession: false,
        source: "env",
      });
    });
  });

  describe("POST /api/projects/roots", () => {
    it("inserts a user root and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/roots",
        payload: { absolutePath: tmpDir },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json() as { id: number; absolutePath: string };
      expect(body.id).toBeGreaterThan(0);
      expect(body.absolutePath).toBe(path.resolve(tmpDir));
    });

    it("rejects with 400 when path does not exist", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/roots",
        payload: { absolutePath: path.join(tmpDir, "ghost") },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects with 400 when path is relative", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/roots",
        payload: { absolutePath: "./rel" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("rejects with 409 when path duplicates env", async () => {
      process.env[ENV] = tmpDir;
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/roots",
        payload: { absolutePath: tmpDir },
      });
      expect(res.statusCode).toBe(409);
      expect((res.json() as { source: string }).source).toBe("env");
    });

    it("rejects with 409 when path already in DB", async () => {
      await app.inject({
        method: "POST",
        url: "/api/projects/roots",
        payload: { absolutePath: tmpDir },
      });
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/roots",
        payload: { absolutePath: tmpDir },
      });
      expect(res.statusCode).toBe(409);
      expect((res.json() as { source: string }).source).toBe("user");
    });

    it("rejects with 400 on malformed body", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/projects/roots",
        payload: {},
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("DELETE /api/projects/roots/:id", () => {
    it("removes a row and returns 204", async () => {
      const created = await app.inject({
        method: "POST",
        url: "/api/projects/roots",
        payload: { absolutePath: tmpDir },
      });
      const { id } = created.json() as { id: number };

      const res = await app.inject({
        method: "DELETE",
        url: `/api/projects/roots/${id}`,
      });
      expect(res.statusCode).toBe(204);
    });

    it("returns 404 for an unknown id", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/projects/roots/999999",
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 400 for a non-numeric id", async () => {
      const res = await app.inject({
        method: "DELETE",
        url: "/api/projects/roots/abc",
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/projects merge", () => {
    it("includes both env and user-added roots, env first", async () => {
      const envDir = path.join(tmpDir, "EnvProj");
      const userDir = path.join(tmpDir, "UserProj");
      fs.mkdirSync(envDir);
      fs.mkdirSync(userDir);
      process.env[ENV] = envDir;
      await app.inject({
        method: "POST",
        url: "/api/projects/roots",
        payload: { absolutePath: userDir },
      });

      const res = await app.inject({ method: "GET", url: "/api/projects" });
      const body = res.json() as Array<{ name: string; source: string; id?: number }>;
      expect(body).toHaveLength(2);
      expect(body[0]).toMatchObject({ name: "EnvProj", source: "env" });
      expect(body[1]).toMatchObject({ name: "UserProj", source: "user" });
      expect(body[1]?.id).toBeGreaterThan(0);
    });
  });

  describe("GET /api/projects/memory", () => {
    const CLAUDE_HOME_ENV = "HAETAE_CLAUDE_HOME";
    let originalClaudeHome: string | undefined;
    let claudeHome: string;

    beforeEach(() => {
      originalClaudeHome = process.env[CLAUDE_HOME_ENV];
      claudeHome = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-mem-"));
      process.env[CLAUDE_HOME_ENV] = claudeHome;
    });
    afterEach(() => {
      if (originalClaudeHome === undefined) delete process.env[CLAUDE_HOME_ENV];
      else process.env[CLAUDE_HOME_ENV] = originalClaudeHome;
      fs.rmSync(claudeHome, { recursive: true, force: true });
    });

    it("returns 400 without projectPath", async () => {
      const res = await app.inject({ method: "GET", url: "/api/projects/memory" });
      expect(res.statusCode).toBe(400);
    });

    it("returns empty list when memory dir is missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/projects/memory?projectPath=/no/such/proj",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { data: unknown[] };
      expect(body.data).toEqual([]);
    });

    it("rejects unsafe filenames on /memory/file (path traversal)", async () => {
      const projectAbs = "/x/Demo";
      const memDir = path.join(
        claudeHome,
        "projects",
        projectAbs.replace(/\//g, "-"),
        "memory",
      );
      fs.mkdirSync(memDir, { recursive: true });
      fs.writeFileSync(path.join(memDir, "ok.md"), "hi");

      const res = await app.inject({
        method: "GET",
        url: `/api/projects/memory/file?projectPath=${encodeURIComponent(projectAbs)}&name=${encodeURIComponent("../../etc/passwd")}`,
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns file content on /memory/file", async () => {
      const projectAbs = "/x/Demo";
      const memDir = path.join(
        claudeHome,
        "projects",
        projectAbs.replace(/\//g, "-"),
        "memory",
      );
      fs.mkdirSync(memDir, { recursive: true });
      fs.writeFileSync(path.join(memDir, "topic.md"), "# Topic\n\nbody");

      const res = await app.inject({
        method: "GET",
        url: `/api/projects/memory/file?projectPath=${encodeURIComponent(projectAbs)}&name=topic.md`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { data: { name: string; content: string; size: number } };
      expect(body.data.name).toBe("topic.md");
      expect(body.data.content).toBe("# Topic\n\nbody");
      expect(body.data.size).toBe(13);
    });

    it("lists *.md files with MEMORY.md first and preview", async () => {
      const projectAbs = "/x/Demo";
      const memDir = path.join(
        claudeHome,
        "projects",
        projectAbs.replace(/\//g, "-"),
        "memory",
      );
      fs.mkdirSync(memDir, { recursive: true });
      fs.writeFileSync(path.join(memDir, "MEMORY.md"), "# Index\n\n- [foo](foo.md)\n");
      fs.writeFileSync(path.join(memDir, "foo.md"), "---\nname: foo\n---\n\n첫 의미있는 줄\n");
      fs.writeFileSync(path.join(memDir, "ignore.txt"), "skip me");

      const res = await app.inject({
        method: "GET",
        url: `/api/projects/memory?projectPath=${encodeURIComponent(projectAbs)}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as {
        data: Array<{ name: string; preview: string | null; size: number }>;
      };
      expect(body.data.map((e) => e.name)).toEqual(["MEMORY.md", "foo.md"]);
      expect(body.data[0]?.preview).toBe("# Index");
      expect(body.data[1]?.preview).toBe("첫 의미있는 줄");
    });
  });
});
