import path from "node:path";
import { discoverProjects } from "../projects";
import { getClaudeHome } from "./path";

/**
 * A resolved scope — where on disk to look, and how to namespace the
 * backup history. Construct with `resolveScope`.
 */
export interface ResolvedScope {
  /** Backup table key. "global" or "project:<slug>". */
  key: string;
  /** Absolute path to the .claude directory for this scope. */
  claudeHome: string;
  /** "global" or the project slug. */
  kind: "global" | "project";
  /** Project slug when kind === "project". */
  slug?: string;
  /** Project basename (display) when kind === "project". */
  projectName?: string;
}

export class UnknownScopeError extends Error {
  constructor(public readonly slug: string) {
    super(`Unknown project scope: ${slug}`);
    this.name = "UnknownScopeError";
  }
}

export const GLOBAL_SCOPE: ResolvedScope = {
  key: "global",
  claudeHome: "", // populated lazily; resolveScope("global") fills it
  kind: "global",
};

/**
 * Map an opaque scope id (`undefined` / `"global"` / a project slug) to a
 * `ResolvedScope`. `claudeHome` always points at a `.claude` directory —
 * it may not exist on disk yet (project repos that have never used
 * Claude Code), in which case the tree/read calls return empty rather
 * than throwing.
 */
export async function resolveScope(scope: string | undefined): Promise<ResolvedScope> {
  if (scope === undefined || scope === "" || scope === "global") {
    return {
      key: "global",
      claudeHome: getClaudeHome(),
      kind: "global",
    };
  }

  const projects = await discoverProjects();
  const found = projects.find((p) => p.slug === scope);
  if (!found) throw new UnknownScopeError(scope);

  return {
    key: `project:${found.slug}`,
    claudeHome: path.join(found.absolutePath, ".claude"),
    kind: "project",
    slug: found.slug,
    projectName: found.name,
  };
}
