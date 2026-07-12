import { useState } from "react";
import { ShieldCheck, RefreshCw } from "lucide-react";
import { Line, LineChart, ResponsiveContainer, Tooltip, YAxis } from "recharts";
import { useEval, useEvalHistory, useGenerateEval, type EvalIssue } from "@/hooks/useEval";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<EvalIssue["type"], string> = {
  accuracy: "Accuracy",
  staleness: "Staleness",
  gap: "Gap",
  vibe: "Vibe",
};
const SEV_COLOR: Record<EvalIssue["severity"], string> = {
  high: "text-danger",
  medium: "text-warning",
  low: "text-text-muted",
};

function scoreColor(score: number): string {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-danger";
}

/**
 * Eval score trend — does the self-correcting loop (eval → wiki regen) actually
 * lift trust over time? Needs ≥2 runs to read as a trend; hidden otherwise.
 */
function EvalTrend({ projectPath }: { projectPath: string }) {
  const { data } = useEvalHistory(projectPath);
  const points = data?.history ?? [];
  if (points.length < 2) return null;
  const first = points[0].score;
  const last = points[points.length - 1].score;
  const delta = last - first;
  const chartData = points.map((p) => ({ score: p.score, label: dayjs(p.generatedAt).format("MM/DD HH:mm") }));
  return (
    <div className="bg-bg-primary border border-border-main px-2 py-1">
      <div className="flex items-center justify-between text-[8px] font-mono text-text-muted mb-0.5">
        <span>Trust trend · {points.length} runs</span>
        <span className={cn("font-bold", delta > 0 ? "text-success" : delta < 0 ? "text-danger" : "text-text-subtle")}>
          {delta >= 0 ? "+" : ""}{delta} (first {first} → now {last})
        </span>
      </div>
      <div className="h-9">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
            <YAxis domain={[0, 100]} hide />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-bg-elevated)",
                border: "1px solid var(--color-border-main)",
                fontSize: 10,
                fontFamily: "var(--font-mono)",
                padding: "2px 6px",
              }}
              labelStyle={{ color: "var(--color-text-muted)" }}
              itemStyle={{ color: "var(--color-text-main)" }}
              formatter={(v) => [`${v}/100`, "Trust"]}
            />
            <Line type="monotone" dataKey="score" stroke="var(--color-accent)" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * Eval-loop bar — shows the wiki's last self-audit score + issues and a
 * re-check button. The issues tell the user how to "조정" (regenerate, fix gaps).
 */
export function WikiEvalBar({ projectPath }: { projectPath: string }) {
  const [open, setOpen] = useState(false);
  const evalQ = useEval(projectPath);
  const generate = useGenerateEval();
  const result = evalQ.data?.eval ?? null;
  const report = result?.report;

  return (
    <div className="border-b border-border-main">
      <div className="px-3 py-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-[9px] font-mono text-text-muted hover:text-text-main transition-colors"
        >
          <ShieldCheck size={10} />
          Eval {open ? "▾" : "▸"}
        </button>
        {report && (
          <span className="text-[9px] font-mono">
            <span className={cn("font-bold", scoreColor(report.score))}>{report.score}/100</span>
            <span className="text-text-subtle"> · {report.issues.length} issues · {dayjs(result!.generatedAt).fromNow()}</span>
            {result!.isStale && <span className="text-warning font-bold"> · wiki updated</span>}
          </span>
        )}
        {!report && !generate.isPending && (
          <span className="text-[9px] font-mono text-text-subtle">Not evaluated yet</span>
        )}
        <button
          type="button"
          disabled={generate.isPending}
          onClick={() => generate.mutate({ projectPath, model: "claude-opus-4-7" })}
          className="ml-auto inline-flex items-center gap-1 text-[9px] font-mono text-text-muted hover:text-text-main transition-colors disabled:opacity-50"
        >
          <RefreshCw size={9} className={generate.isPending ? "animate-spin" : ""} />
          {generate.isPending ? "Evaluating…" : "Re-evaluate"}
        </button>
      </div>

      {generate.isError && (
        <div className="px-3 pb-1 text-[9px] font-mono text-danger">
          {generate.error instanceof Error ? generate.error.message : "Evaluation failed"}
        </div>
      )}

      {open && report && (
        <div className="px-3 pb-2 space-y-1">
          <EvalTrend projectPath={projectPath} />
          {report.summary && <div className="text-[9px] font-mono text-text-muted italic">{report.summary}</div>}
          {report.issues.length === 0 && (
            <div className="text-[9px] font-mono text-success">No issues — the wiki is accurate, current, and on-intent.</div>
          )}
          {report.issues.map((iss, i) => (
            <div key={i} className="text-[9px] font-mono bg-bg-primary border border-border-main px-2 py-1">
              <div className="flex items-center gap-1.5">
                <span className={cn("font-bold uppercase", SEV_COLOR[iss.severity])}>{iss.severity}</span>
                <span className="text-text-muted">{TYPE_LABEL[iss.type]}</span>
              </div>
              <div className="text-text-main mt-0.5">{iss.detail}</div>
              {iss.fix && <div className="text-text-subtle mt-0.5">→ {iss.fix}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
