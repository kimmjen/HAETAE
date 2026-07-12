import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  ClaudeMdFileNotFoundError,
  ClaudeMdPathDeniedError,
  ClaudeMdStaleMtimeError,
  discoverClaudeMd,
  readClaudeMd,
  writeClaudeMd,
} from "../services/claude-md";
import { getDb } from "../db";

const TypeSchema = z.enum(["global", "team", "personal", "subdir"]);

const SubPathSchema = z.string().min(1).max(500).optional();

const FileQuerySchema = z.object({
  type: TypeSchema,
  projectSlug: z.string().min(1).max(200).optional(),
  subPath: SubPathSchema,
});

const WriteBodySchema = z.object({
  type: TypeSchema,
  projectSlug: z.string().min(1).max(200).optional(),
  subPath: SubPathSchema,
  content: z.string().max(1_000_000),
  /** 마지막 read 시 받은 mtime — undefined 면 새 파일 생성 의도. */
  expectedMtime: z.number().nullable().optional(),
});

export async function registerClaudeMdRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/api/claude-md", async () => {
    const entries = await discoverClaudeMd(getDb());
    return {
      data: entries,
      meta: {
        generatedAt: new Date().toISOString(),
        totalEvents: entries.length,
      },
    };
  });

  app.get("/api/claude-md/file", async (req, reply) => {
    const parsed = FileQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_query", issues: parsed.error.issues };
    }
    try {
      const r = await readClaudeMd(
        getDb(),
        parsed.data.type,
        parsed.data.projectSlug,
        parsed.data.subPath,
      );
      return { data: r, meta: { generatedAt: new Date().toISOString() } };
    } catch (err) {
      if (err instanceof ClaudeMdFileNotFoundError) {
        reply.code(404);
        return { error: "not_found", filePath: err.filePath };
      }
      if (err instanceof ClaudeMdPathDeniedError) {
        reply.code(403);
        return { error: "path_denied", reason: err.message };
      }
      throw err;
    }
  });

  app.put("/api/claude-md/file", async (req, reply) => {
    const parsed = WriteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid_body", issues: parsed.error.issues };
    }
    try {
      const r = await writeClaudeMd(
        getDb(),
        parsed.data.type,
        parsed.data.content,
        { expectedMtime: parsed.data.expectedMtime ?? null },
        parsed.data.projectSlug,
        parsed.data.subPath,
      );
      return { data: r, meta: { generatedAt: new Date().toISOString() } };
    } catch (err) {
      if (err instanceof ClaudeMdPathDeniedError) {
        reply.code(403);
        return { error: "path_denied", reason: err.message };
      }
      if (err instanceof ClaudeMdStaleMtimeError) {
        reply.code(409);
        return { error: "stale_mtime", diskMtime: err.diskMtime };
      }
      throw err;
    }
  });
}
