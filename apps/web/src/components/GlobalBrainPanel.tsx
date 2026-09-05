import { useState } from "react";
import { Globe, Brain, Layers, RefreshCw, Check, X, Circle, Minus, AlertTriangle, ShieldCheck } from "lucide-react";
import {
  useGlobalWiki,
  useGlobalTopics,
  useGlobalEval,
  useGenerateGlobalWiki,
  useGenerateGlobalTopics,
  useGenerateGlobalEval,
} from "@/hooks/useGlobalBrain";
import type { EvalReport } from "@/hooks/useEval";
import type { WikiModel } from "@/lib/models";
import { WikiMarkdown } from "./WikiMarkdown";
import { DEFAULT_MODEL, shortModel } from "@/lib/models";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";

// Global synthesis is all whole-portfolio reasoning — the synthesis tier (Opus),
// same choice the per-project Build Brain makes for wiki/topics/eval.
const SYNTHESIS_MODEL: WikiModel = DEFAULT_MODEL;

type LayerKey = "wiki" | "topics" | "eval";
const LAYERS: { key: LayerKey; label: string }[] = [
  { key: "wiki", label: "Wiki" },
  { key: "topics", label: "Topics" },
  { key: "eval", label: "Eval" },
];

type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";
interface StepState {
  key: LayerKey;
  label: string;
  status: StepStatus;
  error?: string;
}

export function GlobalBrainPanel() {
  const wikiQ = useGlobalWiki();
  const topicsQ = useGlobalTopics();
  const evalQ = useGlobalEval();
  const genWiki = useGenerateGlobalWiki();
  const genTopics = useGenerateGlobalTopics();
  const genEval = useGenerateGlobalEval();

  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepState[]>(() =>
    LAYERS.map((l) => ({ ...l, status: "pending" as StepStatus })),
  );
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  function runLayer(key: LayerKey): Promise<unknown> {
    switch (key) {
      case "wiki":
        return genWiki.mutateAsync({ model: SYNTHESIS_MODEL });
      case "topics":
        return genTopics.mutateAsync({ model: SYNTHESIS_MODEL });
      case "eval":
        return genEval.mutateAsync({ model: SYNTHESIS_MODEL });
    }
  }

  async function handleBuild() {
    let current: StepState[] = LAYERS.map((l) => ({ ...l, status: "pending" }));
    setSteps(current);
    setRunning(true);

    for (let i = 0; i < current.length; i++) {
      const step = current[i];
      current = current.map((s, idx) => (idx === i ? { ...s, status: "running" } : s));
      setSteps(current);
      try {
        await runLayer(step.key);
        current = current.map((s, idx) => (idx === i ? { ...s, status: "done" } : s));
        setSteps(current);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        current = current.map((s, idx) => (idx === i ? { ...s, status: "failed", error: message } : s));
        // Wiki is the root topics + eval both derive from — if it fails there is
        // nothing to build on, so skip the rest. (Topics failing still lets eval run.)
        if (step.key === "wiki") {
          current = current.map((s, idx) => (idx > i ? { ...s, status: "skipped" } : s));
          setSteps(current);
          break;
        }
        setSteps(current);
      }
    }
    setRunning(false);
  }

  const wiki = wikiQ.data ?? null;
  const topics = topicsQ.data?.topics ?? [];
  const activeTopic = topics.find((t) => t.slug === selectedSlug) ?? topics[0] ?? null;
  const evalResult = evalQ.data ?? null;
  const built = !!wiki;
  const hasRun = steps.some((s) => s.status !== "pending");

  return (
    <div className="space-y-3">
      {/* Build controls */}
      <div className="border border-border-main bg-bg-secondary">
        <div className="px-3 py-2 flex flex-wrap items-center gap-2 border-b border-border-main">
          <div className="flex items-center gap-2 min-w-0">
            <Brain size={12} className="text-text-muted shrink-0" />
            <span className="text-[11px] font-bold uppercase text-text-main">Build Global Brain</span>
            <span className="text-[9px] font-mono text-text-subtle truncate">
              Wiki → Topics → Eval · synthesized from every project wiki
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[9px] font-mono text-text-subtle">All {shortModel(SYNTHESIS_MODEL)}</span>
            <button
              type="button"
              disabled={running}
              aria-disabled={running}
              onClick={handleBuild}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase border transition-colors",
                running
                  ? "border-border-main text-text-subtle cursor-not-allowed"
                  : built
                    ? wiki?.isStale
                      ? "border-warning bg-bg-primary text-warning hover:bg-bg-hover"
                      : "border-border-main bg-bg-primary text-text-main hover:bg-bg-hover"
                    : "border-accent bg-accent text-text-on-accent hover:bg-accent-hover",
              )}
            >
              <RefreshCw size={10} className={cn(running && "animate-spin")} />
              {running ? "Building…" : built ? "Rebuild" : "Build Global Brain"}
            </button>
          </div>
        </div>

        <div className="px-3 py-2 space-y-px">
          {steps.map((step) => (
            <StepRow key={step.key} step={step} />
          ))}
        </div>

        {!running && hasRun && <SummaryLine steps={steps} />}
      </div>

      {/* Global wiki */}
      {wikiQ.isLoading ? (
        <div className="border border-border-main bg-bg-secondary px-3 py-4 text-[10px] font-mono text-text-muted">
          Loading…
        </div>
      ) : !wiki ? (
        <EmptyState onBuild={handleBuild} disabled={running} />
      ) : (
        <div className="border border-border-main bg-bg-secondary">
          <div className="px-3 py-2 flex flex-wrap items-center gap-2 border-b border-border-main">
            <Globe size={12} className="text-text-muted shrink-0" />
            <span className="text-[11px] font-bold uppercase text-text-main">Global Wiki</span>
            <span className="text-[9px] font-mono text-text-subtle">
              {dayjs(wiki.generatedAt).fromNow()} · {shortModel(wiki.model)} · {wiki.projectsCovered} projects
            </span>
            {wiki.isStale && (
              <span
                className="flex items-center gap-0.5 text-[9px] font-mono text-warning uppercase"
                title="A project wiki changed after this global overview — rebuild to refresh"
              >
                <AlertTriangle size={9} />
                Stale
              </span>
            )}
          </div>
          {evalResult && <EvalBar report={evalResult.report} isStale={evalResult.isStale} />}
          <div className="p-4">
            <WikiMarkdown content={wiki.content} />
          </div>
        </div>
      )}

      {/* Global topic pages */}
      {topics.length > 0 && activeTopic && (
        <div className="border border-border-main bg-bg-secondary">
          <div className="px-3 py-2 flex items-center gap-2 border-b border-border-main">
            <Layers size={12} className="text-text-muted shrink-0" />
            <span className="text-[11px] font-bold uppercase text-text-main">Global Topic Pages</span>
            {topicsQ.data?.isStale && (
              <span className="flex items-center gap-0.5 text-[9px] font-mono text-warning uppercase">
                <AlertTriangle size={9} />
                Stale
              </span>
            )}
          </div>
          <div className="flex min-h-0" style={{ maxHeight: "72vh" }}>
            <div className="w-44 shrink-0 border-r border-border-main overflow-y-auto py-3">
              <div className="px-2 mb-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">Pages</div>
              <nav className="space-y-px">
                {topics.map((page) => (
                  <button
                    key={page.slug}
                    type="button"
                    onClick={() => setSelectedSlug(page.slug)}
                    className={cn(
                      "w-full text-left px-2 py-1 text-[9px] font-mono hover:bg-bg-hover transition-colors truncate",
                      page.slug === activeTopic.slug
                        ? "font-bold text-text-main bg-bg-hover"
                        : "text-text-muted hover:text-text-main",
                    )}
                  >
                    {page.title}
                  </button>
                ))}
              </nav>
            </div>
            <div className="flex-1 overflow-y-auto min-w-0">
              <div className="p-4">
                <WikiMarkdown content={activeTopic.content} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StepRow({ step }: { step: StepState }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 px-2 py-1 text-[10px] font-mono",
        step.status === "running" && "bg-bg-primary",
      )}
    >
      <span className="shrink-0 mt-0.5">
        <StatusIcon status={step.status} />
      </span>
      <span
        className={cn(
          "font-bold w-16 shrink-0",
          step.status === "done" || step.status === "running"
            ? "text-text-main"
            : step.status === "skipped"
              ? "text-text-subtle"
              : "text-text-muted",
        )}
      >
        {step.label}
      </span>
      {step.status === "failed" && step.error && (
        <span className="text-[9px] text-danger min-w-0 break-words">{step.error}</span>
      )}
      {step.status === "skipped" && (
        <span className="text-[9px] text-text-subtle">skipped — Wiki failed</span>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "running":
      return <RefreshCw size={11} className="text-accent animate-spin" />;
    case "done":
      return <Check size={11} className="text-success" />;
    case "failed":
      return <X size={11} className="text-danger" />;
    case "skipped":
      return <Minus size={11} className="text-text-subtle" />;
    default:
      return <Circle size={11} className="text-text-subtle" />;
  }
}

function SummaryLine({ steps }: { steps: StepState[] }) {
  const done = steps.filter((s) => s.status === "done").length;
  const failed = steps.filter((s) => s.status === "failed").length;
  const skipped = steps.filter((s) => s.status === "skipped").length;
  const total = steps.length;
  const aborted = skipped > 0;

  return (
    <div className="px-3 py-1.5 text-[9px] font-mono border-t border-border-main bg-bg-primary">
      {aborted ? (
        <span className="text-danger">Build stopped — Wiki failed; {skipped} dependent layers skipped.</span>
      ) : failed > 0 ? (
        <span className="text-warning">
          Built {done}/{total} layers · {failed} failed (the rest still ran).
        </span>
      ) : (
        <span className="text-success">Global brain built — all {total} layers done.</span>
      )}
    </div>
  );
}

const SEVERITY_COLOR: Record<EvalReport["issues"][number]["severity"], string> = {
  high: "text-danger",
  medium: "text-warning",
  low: "text-text-muted",
};

function EvalBar({ report, isStale }: { report: EvalReport; isStale: boolean }) {
  return (
    <div className="px-3 py-2 border-b border-border-main bg-bg-primary space-y-1">
      <div className="flex items-center gap-2 text-[9px] font-mono">
        <ShieldCheck size={11} className="text-text-muted shrink-0" />
        <span className="font-bold uppercase text-text-main">Eval</span>
        <span className="text-text-main">{report.score}/100</span>
        <span className="text-text-subtle">· {report.issues.length} issues</span>
        {isStale && <span className="text-warning uppercase">· stale</span>}
        {report.summary && <span className="text-text-muted truncate">— {report.summary}</span>}
      </div>
      {report.issues.length > 0 && (
        <ul className="space-y-px pl-4">
          {report.issues.map((iss, i) => (
            <li key={i} className="text-[9px] font-mono text-text-muted">
              <span className={cn("font-bold uppercase", SEVERITY_COLOR[iss.severity])}>
                [{iss.type}/{iss.severity}]
              </span>{" "}
              {iss.detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ onBuild, disabled }: { onBuild: () => void; disabled: boolean }) {
  return (
    <div className="border border-border-main bg-bg-secondary px-3 py-8 flex flex-col items-center gap-3 text-center">
      <Brain size={24} className="text-text-subtle" />
      <div>
        <div className="text-[11px] font-bold text-text-main">No global brain yet</div>
        <div className="text-[10px] font-mono text-text-muted mt-1 leading-relaxed max-w-md">
          The global brain synthesizes a portfolio-level overview from every project's wiki —
          cross-cutting themes and how projects connect. Build each project's wiki first, then build this.
        </div>
      </div>
      <button
        type="button"
        onClick={onBuild}
        disabled={disabled}
        className="px-3 py-1 text-[10px] font-bold uppercase border border-accent bg-accent text-text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
      >
        Build Global Brain
      </button>
    </div>
  );
}
