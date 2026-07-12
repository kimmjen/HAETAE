import { Link } from "@tanstack/react-router";
import { History } from "lucide-react";
import { useProjectSessions } from "@/hooks/useUsageLocal";
import { formatRelativeTime } from "@/lib/format/datetime";
import { formatTokensCompact } from "@/lib/format/tokens";
import { useMoney } from "@/lib/currency";

interface Props {
  projectPath: string;
}

/**
 * \"이 프로젝트에서 했던 과거 세션 전체\". 클릭 시 #142 의 drill-down
 * (\`/watching/sessions/$sessionId\`) 으로 점프. Recent Sessions (전역
 * 5개) 와 다른 점은 (a) 이 프로젝트만, (b) 시간 역순 50개까지.
 */
export function ProjectSessionsList({ projectPath }: Props) {
  const money = useMoney();
  const q = useProjectSessions(projectPath, 50);
  const rows = q.data?.data ?? [];

  return (
    <div className="border border-border-main bg-bg-primary">
      <div className="bg-bg-secondary border-b border-border-main px-3 py-1.5 flex items-center gap-2">
        <History size={12} className="text-text-muted" />
        <span className="text-[11px] font-bold uppercase text-text-main">
          Sessions for this project
        </span>
        <span className="text-[10px] font-mono text-text-muted ml-auto">
          {rows.length} sessions
        </span>
      </div>
      {q.isPending && (
        <div className="p-3 text-[11px] font-mono text-text-muted">Loading…</div>
      )}
      {q.isError && (
        <div className="p-3 text-[11px] font-mono text-danger">
          Failed to load the session list.
        </div>
      )}
      {!q.isPending && rows.length === 0 && (
        <div className="p-3 text-[11px] font-mono text-text-subtle">
          No sessions recorded for this project yet.
        </div>
      )}
      {rows.length > 0 && (
        <div className="max-h-72 overflow-y-auto divide-y divide-border-subtle">
          {rows.map((s) => (
            <Link
              key={s.sessionId}
              to="/watching/sessions/$sessionId"
              params={{ sessionId: s.sessionId }}
              className="block px-3 py-2 font-mono text-[11px] hover:bg-bg-hover transition-colors"
              title={`${s.eventCount} events · ${formatRelativeTime(s.lastTs)}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-text-main truncate">{s.sessionId.slice(0, 8)}…</span>
                <span className="text-text-muted text-[10px]">
                  {formatRelativeTime(s.lastTs)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-[10px] text-text-muted mt-0.5">
                <span className="truncate">{s.model.replace(/^claude-/, "")}</span>
                <span className="tabular-nums">
                  {formatTokensCompact(s.inputTokens + s.outputTokens)} ·{" "}
                  {money.format(s.costUsd)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
