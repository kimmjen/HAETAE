import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, openDb, runMigrations } from "../db";
import { registerRulesRoutes } from "./rules";

const HOME_ENV = "HAETAE_CLAUDE_HOME";
const ROOTS_ENV = "HAETAE_PROJECT_ROOTS";

describe("rules routes", () => {
  let app: FastifyInstance;
  let tmpHome: string;
  let originalHome: string | undefined;
  let originalRoots: string | undefined;

  beforeEach(async () => {
    originalHome = process.env[HOME_ENV];
    originalRoots = process.env[ROOTS_ENV];
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-rules-"));
    process.env[HOME_ENV] = tmpHome;
    process.env[ROOTS_ENV] = "";

    runMigrations(openDb({ filePath: ":memory:" }));

    app = Fastify({ logger: false });
    await registerRulesRoutes(app);
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
  });

  describe("GET /api/rules/list", () => {
    it("returns 200 and an empty array when the home is empty", async () => {
      const res = await app.inject({ method: "GET", url: "/api/rules/list" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });

    it("returns CLAUDE.md and the configured directories when present", async () => {
      fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), "");
      fs.mkdirSync(path.join(tmpHome, "rules"));
      fs.writeFileSync(path.join(tmpHome, "rules/typescript.md"), "");

      const res = await app.inject({ method: "GET", url: "/api/rules/list" });
      const body = res.json() as Array<{ name: string; type: string }>;
      expect(body[0]).toMatchObject({ name: "CLAUDE.md", type: "file" });
      expect(body[1]).toMatchObject({ name: "rules", type: "directory" });
    });

    it("returns 404 for an unknown scope", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/rules/list?scope=does-not-exist",
      });
      expect(res.statusCode).toBe(404);
    });

    it("?category=rules returns CLAUDE.md + rules/ only", async () => {
      fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), "");
      fs.mkdirSync(path.join(tmpHome, "rules"));
      fs.writeFileSync(path.join(tmpHome, "rules/r.md"), "");
      fs.mkdirSync(path.join(tmpHome, "skills"));
      fs.writeFileSync(path.join(tmpHome, "skills/s.md"), "");

      const res = await app.inject({ method: "GET", url: "/api/rules/list?category=rules" });
      const body = res.json() as Array<{ name: string; type: string }>;
      const names = body.map((e) => e.name);
      expect(names).toContain("CLAUDE.md");
      expect(names).toContain("rules");
      expect(names).not.toContain("skills");
    });

    it("?category=skills returns skills/ only (no CLAUDE.md, no rules/)", async () => {
      fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), "");
      fs.mkdirSync(path.join(tmpHome, "rules"));
      fs.writeFileSync(path.join(tmpHome, "rules/r.md"), "");
      fs.mkdirSync(path.join(tmpHome, "skills"));
      fs.writeFileSync(path.join(tmpHome, "skills/s.md"), "");

      const res = await app.inject({ method: "GET", url: "/api/rules/list?category=skills" });
      const body = res.json() as Array<{ name: string; type: string }>;
      expect(body.map((e) => e.name)).toEqual(["skills"]);
    });

    it("returns 400 when category is not in the enum", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/rules/list?category=agents",
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/rules/file", () => {
    it("returns content + frontmatter + mtime", async () => {
      fs.writeFileSync(
        path.join(tmpHome, "CLAUDE.md"),
        "---\ntitle: root\n---\nbody\n",
      );
      const res = await app.inject({
        method: "GET",
        url: "/api/rules/file?path=CLAUDE.md",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as { content: string; frontmatter: Record<string, unknown>; mtime: number };
      expect(body.frontmatter).toEqual({ title: "root" });
      expect(body.content.trim()).toBe("body");
      expect(typeof body.mtime).toBe("number");
    });

    it("returns 400 when query path is missing", async () => {
      const res = await app.inject({ method: "GET", url: "/api/rules/file" });
      expect(res.statusCode).toBe(400);
    });

    it("returns 404 when the file is missing", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/rules/file?path=rules/nope.md",
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 403 for paths outside claude home", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/rules/file?path=../escape",
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("PUT /api/rules/file", () => {
    it("writes content and creates a backup", async () => {
      const file = path.join(tmpHome, "rules/a.md");
      fs.mkdirSync(path.dirname(file));
      fs.writeFileSync(file, "old\n");
      const stat = fs.statSync(file);

      const res = await app.inject({
        method: "PUT",
        url: "/api/rules/file",
        payload: { path: "rules/a.md", content: "new\n", expectedMtime: stat.mtimeMs },
      });
      expect(res.statusCode).toBe(200);
      expect(fs.readFileSync(file, "utf8")).toBe("new\n");
      const body = res.json() as { backupId: number };
      expect(body.backupId).toBeGreaterThan(0);
    });

    it("returns 409 on stale mtime", async () => {
      const file = path.join(tmpHome, "rules/b.md");
      fs.mkdirSync(path.dirname(file));
      fs.writeFileSync(file, "v1\n");

      const res = await app.inject({
        method: "PUT",
        url: "/api/rules/file",
        payload: { path: "rules/b.md", content: "v2\n", expectedMtime: 0 },
      });
      expect(res.statusCode).toBe(409);
      const body = res.json() as { actualMtime: number };
      expect(body.actualMtime).toBeGreaterThan(0);
    });

    it("returns 404 when the target file does not exist", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/rules/file",
        payload: { path: "rules/missing.md", content: "x", expectedMtime: 0 },
      });
      expect(res.statusCode).toBe(404);
    });

    it("returns 400 on malformed body", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/rules/file",
        payload: { path: "rules/a.md" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 403 for paths outside claude home", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/rules/file",
        payload: { path: "../escape.md", content: "x", expectedMtime: 0 },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("POST /api/rules/file", () => {
    it("creates a new file and returns 201", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/rules/file",
        payload: { path: "skills/new.md", content: "---\nname: x\n---\nbody" },
      });
      expect(res.statusCode).toBe(201);
      expect(fs.existsSync(path.join(tmpHome, "skills/new.md"))).toBe(true);
      const body = res.json() as { path: string; frontmatter: Record<string, unknown> };
      expect(body.path).toBe("skills/new.md");
      expect(body.frontmatter).toEqual({ name: "x" });
    });

    it("returns 409 when the file already exists", async () => {
      fs.mkdirSync(path.join(tmpHome, "rules"));
      fs.writeFileSync(path.join(tmpHome, "rules/dup.md"), "old");
      const res = await app.inject({
        method: "POST",
        url: "/api/rules/file",
        payload: { path: "rules/dup.md", content: "new" },
      });
      expect(res.statusCode).toBe(409);
    });

    it("returns 400 for non-.md extension", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/rules/file",
        payload: { path: "rules/x.txt", content: "x" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 for malformed body", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/rules/file",
        payload: { content: "missing path" },
      });
      expect(res.statusCode).toBe(400);
    });

    it("returns 403 for paths outside claude home", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/rules/file",
        payload: { path: "../escape.md", content: "x" },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe("GET /api/rules/search", () => {
    it("returns 400 when q is missing", async () => {
      const res = await app.inject({ method: "GET", url: "/api/rules/search" });
      expect(res.statusCode).toBe(400);
    });

    it("returns 400 when q is too short (< 2)", async () => {
      const res = await app.inject({ method: "GET", url: "/api/rules/search?q=x" });
      expect(res.statusCode).toBe(400);
    });

    it("returns matched files with line numbers", async () => {
      fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), "first line\nbloomberg appears here");
      const res = await app.inject({
        method: "GET",
        url: "/api/rules/search?q=bloomberg",
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Array<{ path: string; matches: Array<{ line: number }> }>;
      expect(body).toHaveLength(1);
      expect(body[0]?.matches[0]?.line).toBe(2);
    });

    it("returns empty array when no matches", async () => {
      fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), "no needles here");
      const res = await app.inject({
        method: "GET",
        url: "/api/rules/search?q=zzzz",
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });
  });

  describe("scope isolation (project)", () => {
    let projectRoot: string;
    let projectHome: string;

    beforeEach(() => {
      projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-rules-proj-"));
      projectHome = path.join(projectRoot, ".claude");
      fs.mkdirSync(projectHome);
      process.env[ROOTS_ENV] = projectRoot;
      // Slug is derived from basename — capture it from the actual mkdtemp name.
    });

    afterEach(() => {
      fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    it("list returns the project tree, not global, when scope=<slug>", async () => {
      const slug = path.basename(projectRoot).toLowerCase();

      // global has CLAUDE.md
      fs.writeFileSync(path.join(tmpHome, "CLAUDE.md"), "global\n");
      // project has skills/proj.md
      fs.mkdirSync(path.join(projectHome, "skills"));
      fs.writeFileSync(path.join(projectHome, "skills/proj.md"), "");

      const res = await app.inject({
        method: "GET",
        url: `/api/rules/list?scope=${slug}`,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Array<{ name: string; type: string; children?: Array<{ name: string }> }>;
      expect(body.find((e) => e.name === "CLAUDE.md")).toBeUndefined();
      expect(body.find((e) => e.name === "skills")?.children?.[0]?.name).toBe("proj.md");
    });

    it("create writes inside the project scope only", async () => {
      const slug = path.basename(projectRoot).toLowerCase();

      const res = await app.inject({
        method: "POST",
        url: "/api/rules/file",
        payload: { path: "skills/scoped.md", content: "x", scope: slug },
      });
      expect(res.statusCode).toBe(201);
      expect(fs.existsSync(path.join(projectHome, "skills/scoped.md"))).toBe(true);
      expect(fs.existsSync(path.join(tmpHome, "skills/scoped.md"))).toBe(false);
    });
  });

  describe("scope isolation (project ↔ project)", () => {
    let projectA: string;
    let projectB: string;

    beforeEach(() => {
      projectA = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-rules-projA-"));
      projectB = fs.mkdtempSync(path.join(os.tmpdir(), "haetae-rules-projB-"));
      fs.mkdirSync(path.join(projectA, ".claude"));
      fs.mkdirSync(path.join(projectB, ".claude"));
      process.env[ROOTS_ENV] = `${projectA}:${projectB}`;
    });

    afterEach(() => {
      fs.rmSync(projectA, { recursive: true, force: true });
      fs.rmSync(projectB, { recursive: true, force: true });
    });

    it("a write to project A does not appear in project B's tree", async () => {
      const slugA = path.basename(projectA).toLowerCase();
      const slugB = path.basename(projectB).toLowerCase();

      const create = await app.inject({
        method: "POST",
        url: "/api/rules/file",
        payload: { path: "skills/a-only.md", content: "from A", scope: slugA },
      });
      expect(create.statusCode).toBe(201);

      // A sees it
      const listA = await app.inject({
        method: "GET",
        url: `/api/rules/list?scope=${slugA}`,
      });
      const bodyA = listA.json() as Array<{ name: string; children?: Array<{ name: string }> }>;
      expect(bodyA.find((e) => e.name === "skills")?.children?.map((c) => c.name)).toContain("a-only.md");

      // B does not
      const listB = await app.inject({
        method: "GET",
        url: `/api/rules/list?scope=${slugB}`,
      });
      const bodyB = listB.json() as Array<{ name: string; children?: Array<{ name: string }> }>;
      expect(bodyB.find((e) => e.name === "skills")).toBeUndefined();

      // And reading the same relPath from B yields 404, not A's contents
      const readB = await app.inject({
        method: "GET",
        url: `/api/rules/file?path=skills/a-only.md&scope=${slugB}`,
      });
      expect(readB.statusCode).toBe(404);
    });
  });
});
