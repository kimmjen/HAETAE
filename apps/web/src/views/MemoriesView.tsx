import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BrainCircuit } from "lucide-react";
import { useMemories, type MemoryRow } from "@/hooks/useMemories";
import { useUsageByProject } from "@/hooks/useUsageLocal";
import dayjs from "@/lib/dayjs";
import { formatTokensCompact } from "@/lib/format/tokens";
import { cn } from "@/lib/utils";

export function MemoriesView() {
  const [projectFilter, setProjectFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const memoriesQ = useMemories({ projectPath: projectFilter || undefined, limit: 100 });
  const byProjectQ = useUsageByProject(90);

  const rows: MemoryRow[] = memoriesQ.data?.data ?? [];
  const total: number = memoriesQ.data?.meta.total ?? 0;
  const projects =
    byProjectQ.data?.data?.map((p) => ({ path: p.projectPath, label: p.label })) ?? [];

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="border border-border-main bg-bg-secondary px-3 py-2 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-text-main">
          <BrainCircuit size={12} className="text-text-muted" />
          Memories
          <span className="text-[10px] font-mono text-text-muted normal-case">
            {total} compact {total === 1 ? "summary" : "summaries"}
          </span>
        </div>

        <div className="ml-auto">
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="bg-bg-primary border border-border-main text-[10px] font-mono text-text-main px-2 py-0.5 focus:outline-none"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.path} value={p.path}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Memory list */}
      {memoriesQ.isPending ? (
        <div className="text-[11px] font-mono text-text-muted px-1">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="border border-border-main bg-bg-secondary px-4 py-6 text-center">
          <p className="text-[11px] font-mono text-text-muted">
            No compact summaries yet.
          </p>
          <p className="text-[10px] font-mono text-text-subtle mt-1">
            Run /compact in Claude Code and it will be recorded automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <MemoryCard
              key={row.id}
              row={row}
              isExpanded={expanded.has(row.id)}
              onToggle={() => toggleExpand(row.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface MemoryCardProps {
  row: MemoryRow;
  isExpanded: boolean;
  onToggle: () => void;
}

const PREVIEW_LEN = 300;

function MemoryCard({ row, isExpanded, onToggle }: MemoryCardProps) {
  const now = dayjs();
  const projectName = row.projectPath.split("/").pop() ?? row.projectPath;
  const compressionPct =
    row.compactPreTokens && row.compactPostTokens
      ? Math.round((1 - row.compactPostTokens / row.compactPreTokens) * 100)
      : null;

  const needsTruncate = row.content.length > PREVIEW_LEN;
  const displayContent =
    !needsTruncate || isExpanded ? row.content : row.content.slice(0, PREVIEW_LEN) + "…";

  return (
    <div className="border border-border-main bg-bg-primary">
      {/* Card header */}
      <div className="bg-bg-secondary border-b border-border-main px-3 py-1.5 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-text-main truncate max-w-[200px]">
          {projectName}
        </span>

        {row.compactTrigger && (
          <span
            className={cn(
              "text-[9px] font-bold uppercase px-1 py-0.5 border",
              row.compactTrigger === "manual"
                ? "border-border-main text-text-muted"
                : "border-accent/40 text-accent",
            )}
          >
            {row.compactTrigger}
          </span>
        )}

        {compressionPct !== null && (
          <span className="text-[10px] font-mono text-text-muted">
            {formatTokensCompact(row.compactPreTokens!)} → {formatTokensCompact(row.compactPostTokens!)}{" "}
            <span className="text-text-subtle">({compressionPct}% compressed)</span>
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          {row.sessionId && (
            <Link
              to="/watching/sessions/$sessionId"
              params={{ sessionId: row.sessionId }}
              className="text-[9px] font-mono text-text-subtle hover:text-accent transition-colors"
            >
              View session →
            </Link>
          )}
          <span className="text-[10px] font-mono text-text-subtle">
            {dayjs(row.ts).from(now)}
          </span>
        </div>
      </div>

      {/* Summary content */}
      <div className="px-3 py-2">
        <pre className="text-[11px] font-mono text-text-main whitespace-pre-wrap leading-relaxed break-words">
          {displayContent}
        </pre>
        {needsTruncate && (
          <button
            type="button"
            onClick={onToggle}
            className="mt-1 text-[10px] font-bold text-accent hover:underline"
          >
            {isExpanded ? "Collapse" : "Show all"}
          </button>
        )}
      </div>
    </div>
  );
}
