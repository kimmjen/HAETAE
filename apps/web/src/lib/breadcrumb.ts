const SEGMENT_LABEL: Record<string, string> = {
  // sections
  watching: "Watching",
  guarding: "Guarding",
  working: "Working",
  research: "Research",
  projects: "Projects",
  // pages
  overview: "Overview",
  local: "Local Usage",
  api: "API Cost",
  unified: "Unified",
  sessions: "Sessions",
  memories: "Memories",
  graph: "Graph",
  voice: "Voice",
  knowledge: "Knowledge",
  rules: "Rules",
  "global-rules": "Global Rules",
  skills: "Skills",
  commands: "Commands",
  "claude-md": "CLAUDE.md",
  terminal: "Terminal",
  notebooks: "Notebooks",
  profile: "Profile",
  settings: "Settings",
};

const ID_TRUNCATE = 10;

/**
 * Breadcrumb-style page title from the URL path so every route — including
 * dynamic ones (session detail, project pages) — tells you where you are
 * without reading the address bar. Known segments map to friendly labels;
 * dynamic ids/slugs pass through (long opaque ids are truncated).
 */
export function breadcrumbTitle(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "Haetae Console";
  return segments
    .map((s) => SEGMENT_LABEL[s] ?? (s.length > ID_TRUNCATE ? `${s.slice(0, 8)}…` : s))
    .join(" / ");
}
