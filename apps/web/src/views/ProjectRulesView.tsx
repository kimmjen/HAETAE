import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, FolderKanban, Play, ShieldAlert, Terminal } from "lucide-react";
import { RulesView } from "@/views/RulesView";
import { useProjects } from "@/hooks/useProjects";
import { ProjectSessionsList } from "@/components/ProjectSessionsList";
import { ProjectMemoryList } from "@/components/ProjectMemoryList";
import { ProjectWikiPanel } from "@/components/ProjectWikiPanel";
import { ProjectQAPanel } from "@/components/ProjectQAPanel";
import { cn } from "@/lib/utils";

interface ProjectRulesViewProps {
  slug: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

/**
 * Per-project RulesView wrapper. Shows the project header banner +
 * "back to global" link, then renders RulesView scoped to the slug.
 *
 * If the slug is not in the discovered projects, render an explainer
 * instead of mounting the editor — the API would just 404 anyway.
 */
type ProjectTab = "overview" | "wiki" | "ask" | "rules";

export function ProjectRulesView({ slug, selectedPath, onSelect }: ProjectRulesViewProps) {
  const projects = useProjects();
  const project = projects.data?.find((p) => p.slug === slug);
  const [tab, setTab] = useState<ProjectTab>("overview");

  if (projects.isPending) {
    return (
      <div className="p-6 text-[11px] font-mono text-text-muted">Loading…</div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-xl">
        <div className="border border-border-main bg-bg-secondary p-4 flex gap-3">
          <ShieldAlert className="text-warning shrink-0 mt-1" size={16} />
          <div>
            <div className="text-[12px] font-bold uppercase text-text-main">
              Unknown project: {slug}
            </div>
            <div className="text-[11px] font-mono text-text-muted mt-1">
              No match among the paths in <code>HAETAE_PROJECT_ROOTS</code> or the ones
              registered in Settings.
            </div>
            <Link
              to="/guarding/rules"
              className="inline-flex items-center gap-1 mt-3 text-[10px] font-bold uppercase text-accent hover:underline"
            >
              <ArrowLeft size={12} />
              <span>Back to global rules</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ProjectHeader
        name={project.name}
        absolutePath={project.absolutePath}
        hasClaudeDir={project.hasClaudeDir}
        hasSession={project.hasSession}
      />

      {/* .claude/ 없음 — 탭과 무관하게 항상 표시 */}
      {!project.hasClaudeDir && (
        <div className="border border-border-main bg-bg-secondary px-3 py-2 text-[10px] font-mono text-text-muted">
          This project has no .claude/ — the Rules tab will be empty.
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-px border-b border-border-main">
        {(["overview", "wiki", "ask", "rules"] as ProjectTab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors border-b-2 -mb-px",
              tab === t
                ? "border-accent text-text-main"
                : "border-transparent text-text-muted hover:text-text-main",
            )}
          >
            {t === "overview" ? "Overview" : t === "wiki" ? "Wiki" : t === "ask" ? "Ask" : "Rules"}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <ProjectSessionsList projectPath={project.absolutePath} />
          <ProjectMemoryList projectPath={project.absolutePath} />
        </div>
      )}

      {tab === "wiki" && (
        <ProjectWikiPanel projectPath={project.absolutePath} />
      )}

      {tab === "ask" && (
        <ProjectQAPanel projectPath={project.absolutePath} />
      )}

      {tab === "rules" && (
        project.hasClaudeDir ? (
          <RulesView selectedPath={selectedPath} onSelect={onSelect} scope={slug} />
        ) : (
          <NoClaudeDir />
        )
      )}
    </div>
  );
}

function ProjectHeader({
  name,
  absolutePath,
  hasClaudeDir,
  hasSession,
}: {
  name: string;
  absolutePath: string;
  hasClaudeDir: boolean;
  hasSession: boolean;
}) {
  // Two terminal entry points side by side. "Continue" only renders when
  // a session log already exists for this cwd — otherwise the user has
  // nothing to resume and a single "Claude Code" button is plenty.
  return (
    <div className="border border-border-main bg-bg-secondary px-3 py-2 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <FolderKanban size={14} className="text-text-muted shrink-0" />
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase text-text-main truncate">
            Project · {name}
          </div>
          <div className="text-[10px] font-mono text-text-muted truncate">
            {absolutePath}
            {hasClaudeDir ? "/.claude" : " (no .claude/)"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {hasSession && (
          <Link
            to="/working/terminal"
            search={{ cwd: absolutePath, autoCommand: "claude --continue" }}
            title="Resume the most recent Claude Code session in this project"
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-border-main bg-accent text-text-on-accent hover:bg-accent-hover transition-colors"
          >
            <Play size={12} />
            <span>Continue</span>
          </Link>
        )}
        <Link
          to="/working/terminal"
          search={{ cwd: absolutePath, autoCommand: "claude" }}
          title="Open a terminal here and start a fresh Claude Code session"
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors"
        >
          <Terminal size={12} />
          <span>Claude Code</span>
        </Link>
        <Link
          to="/guarding/rules"
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors"
        >
          <ArrowLeft size={12} />
          <span>Global</span>
        </Link>
      </div>
    </div>
  );
}

function NoClaudeDir() {
  return (
    <div className="p-6 max-w-xl">
      <div className="border border-border-main bg-bg-secondary p-4">
        <div className="text-[12px] font-bold uppercase text-text-main">
          This project has no .claude/
        </div>
        <div className="text-[11px] font-mono text-text-muted mt-2 leading-relaxed">
          Create a <code>.claude</code> directory at the project root and put
          <code>CLAUDE.md</code> or markdown under <code>rules/</code>, <code>skills/</code>{" "}
          in it — it shows up here.
        </div>
      </div>
    </div>
  );
}
