import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  FileAlreadyExistsError,
  FileNotFoundError,
  InvalidFileExtensionError,
  PathOutsideClaudeHomeError,
  StaleMtimeError,
  UnknownScopeError,
  createFile,
  readFile,
  readTree,
  resolveScope,
  searchTree,
  writeFile,
} from "../services/claude-fs";
import { getDb } from "../db";

const TreeEntrySchema: z.ZodType<{
  name: string;
  type: "file" | "directory";
  path: string;
  children?: unknown[];
}> = z.lazy(() =>
  z.object({
    name: z.string(),
    type: z.enum(["file", "directory"]),
    path: z.string(),
    children: z.array(TreeEntrySchema).optional(),
  }),
);

const TreeResponseSchema = z.array(TreeEntrySchema);

const ScopeSchema = z.string().min(1).max(200).optional();
const CategorySchema = z.enum(["rules", "skills"]).optional();

const ListQuerySchema = z.object({
  scope: ScopeSchema,
  category: CategorySchema,
});

const FileQuerySchema = z.object({
  path: z.string().min(1),
  scope: ScopeSchema,
});

const FileWriteBodySchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  expectedMtime: z.number().nonnegative(),
  scope: ScopeSchema,
});

const SearchQuerySchema = z.object({
  q: z.string().min(2).max(200),
  scope: ScopeSchema,
});

const FileCreateBodySchema = z.object({
  path: z.string().min(1).max(500),
  content: z.string(),
  scope: ScopeSchema,
});

export async function registerRulesRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/rules/list", async (req, reply) => {
    const parsedQuery = ListQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      reply.code(400);
      return { error: "invalid query", issues: parsedQuery.error.issues };
    }
    try {
      const scope = await resolveScope(parsedQuery.data.scope);
      const tree = await readTree(scope.claudeHome, {
        category: parsedQuery.data.category,
      });
      const parsed = TreeResponseSchema.safeParse(tree);
      if (!parsed.success) {
        app.log.error({ issues: parsed.error.issues }, "rules tree failed schema check");
        reply.code(500);
        return { error: "rules tree failed validation" };
      }
      return parsed.data;
    } catch (err) {
      return mapClaudeFsError(reply, err);
    }
  });

  app.get("/api/rules/file", async (req, reply) => {
    const parsed = FileQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid query", issues: parsed.error.issues };
    }
    try {
      const scope = await resolveScope(parsed.data.scope);
      return await readFile(scope.claudeHome, parsed.data.path);
    } catch (err) {
      return mapClaudeFsError(reply, err);
    }
  });

  app.get("/api/rules/search", async (req, reply) => {
    const parsed = SearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid query", issues: parsed.error.issues };
    }
    try {
      const scope = await resolveScope(parsed.data.scope);
      return await searchTree(scope.claudeHome, parsed.data.q);
    } catch (err) {
      return mapClaudeFsError(reply, err);
    }
  });

  app.post("/api/rules/file", async (req, reply) => {
    const parsed = FileCreateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid body", issues: parsed.error.issues };
    }
    try {
      const scope = await resolveScope(parsed.data.scope);
      const result = await createFile(
        getDb(),
        scope.claudeHome,
        parsed.data.path,
        parsed.data.content,
      );
      reply.code(201);
      return result;
    } catch (err) {
      return mapClaudeFsError(reply, err);
    }
  });

  app.put("/api/rules/file", async (req, reply) => {
    const parsed = FileWriteBodySchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: "invalid body", issues: parsed.error.issues };
    }
    try {
      const scope = await resolveScope(parsed.data.scope);
      return await writeFile(
        getDb(),
        scope.claudeHome,
        scope.key,
        parsed.data.path,
        parsed.data.content,
        parsed.data.expectedMtime,
      );
    } catch (err) {
      return mapClaudeFsError(reply, err);
    }
  });
}

function mapClaudeFsError(reply: FastifyReply, err: unknown) {
  if (err instanceof UnknownScopeError) {
    reply.code(404);
    return { error: "unknown scope", scope: err.slug };
  }
  if (err instanceof PathOutsideClaudeHomeError) {
    reply.code(403);
    return { error: "path outside claude home", path: err.attempted };
  }
  if (err instanceof FileNotFoundError) {
    reply.code(404);
    return { error: "file not found", path: err.relPath };
  }
  if (err instanceof StaleMtimeError) {
    reply.code(409);
    return {
      error: "file changed on disk",
      path: err.relPath,
      expectedMtime: err.expectedMtime,
      actualMtime: err.actualMtime,
    };
  }
  if (err instanceof FileAlreadyExistsError) {
    reply.code(409);
    return { error: "file already exists", path: err.relPath };
  }
  if (err instanceof InvalidFileExtensionError) {
    reply.code(400);
    return { error: "only .md files are allowed", path: err.relPath };
  }
  throw err;
}
