import { type FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { memories } from "../db/schema";

export async function registerMemoriesRoutes(app: FastifyInstance) {
  /**
   * GET /api/memories
   * ?projectPath=  filter by project (exact match)
   * ?limit=        default 50, max 200
   * ?offset=       pagination
   *
   * Returns memories sorted newest-first.
   */
  app.get("/api/memories", async (req, reply) => {
    const { projectPath, limit: limitStr, offset: offsetStr } = req.query as Record<string, string>;
    const limit = Math.min(parseInt(limitStr ?? "50", 10) || 50, 200);
    const offset = parseInt(offsetStr ?? "0", 10) || 0;

    const db = getDb();

    const rows = db
      .select()
      .from(memories)
      .where(projectPath ? sql`${memories.projectPath} = ${projectPath}` : undefined)
      .orderBy(sql`${memories.ts} DESC`)
      .limit(limit)
      .offset(offset)
      .all();

    const [{ total }] = db
      .select({ total: sql<number>`count(*)` })
      .from(memories)
      .where(projectPath ? sql`${memories.projectPath} = ${projectPath}` : undefined)
      .all();

    reply.header("Cache-Control", "no-store");
    return {
      data: rows,
      meta: { total, limit, offset, generatedAt: new Date().toISOString() },
    };
  });
}
