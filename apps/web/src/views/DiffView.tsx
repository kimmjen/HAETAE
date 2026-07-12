import { Link } from "@tanstack/react-router";
import { ArrowLeft, GitCompare } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import type { Scope } from "@/lib/scope";
import { MarkdownDiffEditor } from "@/components/MarkdownDiffEditor";
import { useFile } from "@/hooks/useFile";
import { useProjects } from "@/hooks/useProjects";

interface DiffViewProps {
  left: Scope;
  right: Scope;
  path: string;
}

/**
 * Side-by-side comparison of the same relPath across two scopes.
 *
 * Both reads are independent: a missing file on either side is fine and
 * surfaces as the empty-side hint. The Monaco diff editor itself stays
 * read-only — to actually edit, navigate back to the scope's RulesView.
 */
export function DiffView({ left, right, path }: DiffViewProps) {
  const projects = useProjects();
  const leftFile = useFile(path, left);
  const rightFile = useFile(path, right);

  const leftLabel = labelForScope(left, projects.data);
  const rightLabel = labelForScope(right, projects.data);
  const projectSlug = pickProjectSlug(left, right);

  const leftMissing = isMissing(leftFile.error);
  const rightMissing = isMissing(rightFile.error);

  return (
    <div className="space-y-3">
      <div className="border border-border-main bg-bg-secondary px-3 py-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <GitCompare size={14} className="text-text-muted shrink-0" />
          <div className="text-[11px] font-bold uppercase text-text-main truncate">
            Diff · <span className="text-text-muted normal-case font-mono">{path}</span>
          </div>
        </div>
        {projectSlug ? (
          <Link
            to="/projects/$slug"
            params={{ slug: projectSlug }}
            search={{ file: path }}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors shrink-0"
          >
            <ArrowLeft size={12} />
            <span>Back</span>
          </Link>
        ) : (
          <Link
            to="/guarding/global-rules"
            search={{ file: path }}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors shrink-0"
          >
            <ArrowLeft size={12} />
            <span>Back</span>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SideHeader label={leftLabel} missing={leftMissing} />
        <SideHeader label={rightLabel} missing={rightMissing} />
      </div>

      {leftMissing || rightMissing ? (
        <SingleSidedHint
          leftLabel={leftLabel}
          rightLabel={rightLabel}
          leftMissing={leftMissing}
          rightMissing={rightMissing}
        />
      ) : leftFile.isPending || rightFile.isPending ? (
        <div className="border border-border-main bg-bg-primary p-6 text-[11px] font-mono text-text-muted">
          Loading…
        </div>
      ) : leftFile.isError || rightFile.isError ? (
        <div className="border border-border-main bg-bg-primary p-6 text-[11px] font-mono text-danger">
          Failed to load the file.
        </div>
      ) : (
        <div className="border border-border-main bg-bg-elevated h-[calc(100vh-220px)]">
          <MarkdownDiffEditor
            original={leftFile.data?.content ?? ""}
            modified={rightFile.data?.content ?? ""}
          />
        </div>
      )}
    </div>
  );
}

function SideHeader({ label, missing }: { label: string; missing: boolean }) {
  return (
    <div className="border border-border-main bg-bg-secondary px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest flex items-center justify-between">
      <span className="text-text-main">{label}</span>
      {missing && <span className="text-danger font-mono normal-case tracking-normal">missing</span>}
    </div>
  );
}

function SingleSidedHint({
  leftLabel,
  rightLabel,
  leftMissing,
  rightMissing,
}: {
  leftLabel: string;
  rightLabel: string;
  leftMissing: boolean;
  rightMissing: boolean;
}) {
  let message: string;
  if (leftMissing && rightMissing) {
    message = "Neither side has this file.";
  } else if (leftMissing) {
    message = `${leftLabel} has no file. Only one side to compare.`;
  } else {
    message = `${rightLabel} has no file. Only one side to compare.`;
  }
  return (
    <div className="border border-border-main bg-bg-secondary p-4 text-[11px] font-mono text-text-muted">
      {message}
    </div>
  );
}

function labelForScope(scope: Scope, projects?: Array<{ slug: string; name: string }>): string {
  if (!scope || scope === "global") return "GLOBAL";
  const project = projects?.find((p) => p.slug === scope);
  return project ? `PROJECT · ${project.name}` : `PROJECT · ${scope}`;
}

function isMissing(err: unknown): boolean {
  return err instanceof ApiError && err.status === 404;
}

function pickProjectSlug(left: Scope, right: Scope): string | null {
  for (const s of [right, left]) {
    if (s && s !== "global") return s;
  }
  return null;
}
