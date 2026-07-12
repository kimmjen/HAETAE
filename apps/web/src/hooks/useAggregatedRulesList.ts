import { useQueries } from "@tanstack/react-query";
import {
  rulesListQueryOptions,
  type RulesEntry,
  type TreeCategory,
} from "./useRulesList";
import { useProjects, type ProjectEntry } from "./useProjects";

export interface AggregatedOrigin {
  /** "global" or project slug — what the scope-aware API needs. */
  scope: string;
  /** "global" or "project" — drives the badge. */
  kind: "global" | "project";
  /** Display name (GLOBAL or the project's basename). */
  label: string;
  /** Set when the project has no `.claude/` — explains why the tree is empty. */
  missing?: boolean;
}

export interface AggregatedSection {
  origin: AggregatedOrigin;
  data?: RulesEntry[];
  isPending: boolean;
  isError: boolean;
}

export interface AggregatedRulesResult {
  /** True until the projects list is known. */
  isPending: boolean;
  /** True if the projects list itself failed (sections are empty). */
  isError: boolean;
  sections: AggregatedSection[];
}

interface UseAggregatedRulesListArgs {
  category: TreeCategory;
  /** When false the global ~/.claude/ section is omitted. */
  includeGlobal: boolean;
}

/**
 * Aggregates `/api/rules/list` across multiple scopes for the Rules and
 * Skills nav (ADR 0007). Each origin keeps its own tree + loading state
 * so the view can render partial data while individual scopes are still
 * loading.
 */
export function useAggregatedRulesList(
  args: UseAggregatedRulesListArgs,
): AggregatedRulesResult {
  const { category, includeGlobal } = args;
  const projects = useProjects();

  const origins: AggregatedOrigin[] = [];
  if (includeGlobal) {
    origins.push({ scope: "global", kind: "global", label: "GLOBAL" });
  }
  for (const p of projects.data ?? []) {
    origins.push(originFromProject(p));
  }

  const queries = useQueries({
    queries: origins.map((o) => ({
      ...rulesListQueryOptions(o.scope, category),
      // Project entries that have no .claude/ directory still resolve
      // (server returns []), so we let the query run and label the
      // section instead of disabling it.
    })),
  });

  const sections: AggregatedSection[] = origins.map((origin, i) => {
    const q = queries[i]!;
    return {
      origin,
      data: q.data,
      isPending: q.isPending,
      isError: q.isError,
    };
  });

  return {
    isPending: projects.isPending,
    isError: projects.isError,
    sections,
  };
}

function originFromProject(p: ProjectEntry): AggregatedOrigin {
  return {
    scope: p.slug,
    kind: "project",
    label: p.name,
    missing: !p.hasClaudeDir,
  };
}
