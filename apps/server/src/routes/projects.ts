import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  DuplicateRootError,
  InvalidPathError,
  RootNotFoundError,
  addProjectRoot,
  deleteProjectRoot,
  discoverProjects,
} from "../services/projects";
import { listProjectMemory, readProjectMemoryFile } from "../services/projects/memory";
import { getDb } from "../db";

const ProjectSchema = z.object({
  slug: z.string(),
  name: z.string(),
  absolutePath: z.string(),
  hasClaudeDir: z.boolean(),
  hasSession: z.boolean(),
  source: z.enum(["env", "user"]),
  id: z.number().int().positive().optional(),
});

const ProjectsResponseSchema = z.array(ProjectSchema);

const AddRootBodySchema = z.object({
  absolutePath: z.string().min(1).max(4096),
});

const DeleteRootParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export async function registerProjectsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/projects", async (_req, reply) => {
    const projects = await discoverProjects(getDb());
    const parsed = ProjectsResponseSchema.safeParse(projects);
    if (!parsed.success) {
      app.log.error({ issues: parsed.error.issues }, "projects payload failed schema check");
      reply.code(500);
      return { error: "projects payload failed validation" };
    }
    return parsed.data;
  });

  app.post("/api/projects/roots", async (req, reply) => {
    const parsed = AddRootBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid body", issues: parsed.error.issues };
    }
    try {
      const row = await addProjectRoot(getDb(), parsed.data.absolutePath);
      reply.code(201);
      return row;
    } catch (err) {
      return mapRootsError(reply, err);
    }
  });

  app.get("/api/projects/memory", async (req, reply) => {
    const parsed = z
      .object({ projectPath: z.string().min(1).max(4096) })
      .safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_query", issues: parsed.error.issues };
    }
    const entries = await listProjectMemory(parsed.data.projectPath);
    return {
      data: entries,
      meta: {
        generatedAt: new Date().toISOString(),
        totalEvents: entries.length,
      },
    };
  });

  app.get("/api/projects/memory/file", async (req, reply) => {
    const parsed = z
      .object({
        projectPath: z.string().min(1).max(4096),
        name: z.string().min(1).max(256),
      })
      .safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_query", issues: parsed.error.issues };
    }
    const result = await readProjectMemoryFile(
      parsed.data.projectPath,
      parsed.data.name,
    );
    if (!result) {
      reply.code(404);
      return { error: "memory_not_found" };
    }
    return {
      data: { name: parsed.data.name, ...result },
      meta: { generatedAt: new Date().toISOString() },
    };
  });

  app.delete<{ Params: { id: string } }>("/api/projects/roots/:id", async (req, reply) => {
    const parsed = DeleteRootParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid id", issues: parsed.error.issues };
    }
    try {
      deleteProjectRoot(getDb(), parsed.data.id);
      reply.code(204);
      return null;
    } catch (err) {
      return mapRootsError(reply, err);
    }
  });
}

function mapRootsError(reply: FastifyReply, err: unknown) {
  if (err instanceof InvalidPathError) {
    reply.code(400);
    return { error: err.message, path: err.attempted };
  }
  if (err instanceof DuplicateRootError) {
    reply.code(409);
    return { error: err.message, path: err.absolutePath, source: err.source };
  }
  if (err instanceof RootNotFoundError) {
    reply.code(404);
    return { error: err.message, id: err.id };
  }
  throw err;
}
