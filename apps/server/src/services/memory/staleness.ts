import { sql } from "drizzle-orm";
import { getDb, type Db } from "../../db";
import { projectWiki } from "../../db/schema";

/**
 * A derived layer (notes / ontology / eval) is stale when the wiki it was
 * distilled from has since been regenerated — i.e. the wiki's generatedAt is
 * newer than the derived layer's. Unknown wiki time (null) → not stale.
 */
export function isDerivedStale(derivedGeneratedAt: number, wikiGeneratedAt: number | null): boolean {
  return wikiGeneratedAt !== null && wikiGeneratedAt > derivedGeneratedAt;
}

/** The wiki's last generation time for a project, or null if no wiki yet. */
export function getWikiGeneratedAt(projectPath: string, db: Db = getDb()): number | null {
  const row = db
    .select({ generatedAt: projectWiki.generatedAt })
    .from(projectWiki)
    .where(sql`${projectWiki.projectPath} = ${projectPath}`)
    .get();
  return row?.generatedAt ?? null;
}
