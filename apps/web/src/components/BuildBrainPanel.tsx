import { useState } from "react";
import { Brain, RefreshCw, Check, X, Circle, Minus } from "lucide-react";
import { useGenerateWiki, WIKI_MODELS, type WikiModel } from "@/hooks/useProjectWiki";
import {
  useGenerateNotes,
  useGenerateOntology,
  useGenerateLinks,
  useGenerateTopics,
} from "@/hooks/useProjectGraph";
import { useGenerateEval } from "@/hooks/useEval";
import { DEFAULT_MODEL, shortModel } from "@/lib/models";
import { cn } from "@/lib/utils";

interface BuildBrainPanelProps {
  projectPath: string;
}

// Dependency order — each layer consumes the output of the ones before it.
// Wiki is the root (it injects CLAUDE.md itself, so no separate inject step);
// notes/ontology need the wiki, links needs notes+ontology, topics/eval read
// the finished layers. Mirrors services/memory/cascade.ts.
type LayerKey = "wiki" | "notes" | "ontology" | "links" | "topics" | "eval";

const LAYERS: { key: LayerKey; label: string }[] = [
  { key: "wiki", label: "Wiki" },
  { key: "notes", label: "Notes" },
  { key: "ontology", label: "Ontology" },
  { key: "links", label: "Links" },
  { key: "topics", label: "Topics" },
  { key: "eval", label: "Eval" },
];

// Every layer builds on the default tier. This map is per-layer on purpose: it
// is where re-tiering goes if the synthesis-heavy layers (wiki/topics/eval,
// which reason over the whole project and set the brain's quality ceiling) ever
// earn Opus again over the mechanical ones (notes/ontology/links). The override
// dropdown below forces a single model across all six.
const LAYER_MODEL: Record<LayerKey, WikiModel> = {
  wiki: DEFAULT_MODEL,
  notes: DEFAULT_MODEL,
  ontology: DEFAULT_MODEL,
  links: DEFAULT_MODEL,
  topics: DEFAULT_MODEL,
  eval: DEFAULT_MODEL,
};

type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

interface StepState {
  key: LayerKey;
  label: string;
  status: StepStatus;
  /** Model this step ran (or will run) with — tiered default or the override. */
  model: WikiModel;
  error?: string;
}

export function BuildBrainPanel({ projectPath }: BuildBrainPanelProps) {
  const genWiki = useGenerateWiki();
  const genNotes = useGenerateNotes();
  const genOntology = useGenerateOntology();
  const genLinks = useGenerateLinks();
  const genTopics = useGenerateTopics();
  const genEval = useGenerateEval();

  // null = use the tiered defaults; a WikiModel = force every layer to it.
  const [override, setOverride] = useState<WikiModel | null>(null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepState[]>(() =>
    LAYERS.map((l) => ({ ...l, status: "pending", model: LAYER_MODEL[l.key] })),
  );

  function runLayer(key: LayerKey, model: WikiModel): Promise<unknown> {
    switch (key) {
      case "wiki":
        return genWiki.mutateAsync({ projectPath, model });
      case "notes":
        return genNotes.mutateAsync({ projectPath, model });
      case "ontology":
        return genOntology.mutateAsync({ projectPath, model });
      case "links":
        return genLinks.mutateAsync({ projectPath, model });
      case "topics":
        return genTopics.mutateAsync({ projectPath, model });
      case "eval":
        return genEval.mutateAsync({ projectPath, model });
    }
  }

  async function handleBuild() {
    // Lock in the resolved model per layer up-front so a mid-run override change
    // can't retarget already-scheduled steps.
    let current: StepState[] = LAYERS.map((l) => ({
      ...l,
      status: "pending",
      model: override ?? LAYER_MODEL[l.key],
    }));
    setSteps(current);
    setRunning(true);

    for (let i = 0; i < current.length; i++) {
      const step = current[i];
      current = current.map((s, idx) => (idx === i ? { ...s, status: "running" } : s));
      setSteps(current);

      try {
        await runLayer(step.key, step.model);
        current = current.map((s, idx) => (idx === i ? { ...s, status: "done" } : s));
        setSteps(current);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        current = current.map((s, idx) => (idx === i ? { ...s, status: "failed", error: message } : s));
        // Wiki is the root every later layer reads — if it fails there is nothing
        // to build on, so skip the rest. Later layers are independent enough that
        // one failing shouldn't abort the others, so we continue past them.
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

  const hasRun = steps.some((s) => s.status !== "pending");

  return (
    <div className="border border-border-main bg-bg-secondary">
      <div className="px-3 py-2 flex flex-wrap items-center gap-2 border-b border-border-main">
        <div className="flex items-center gap-2 min-w-0">
          <Brain size={12} className="text-text-muted shrink-0" />
          <span className="text-[11px] font-bold uppercase text-text-main">Build Brain</span>
          <span className="text-[9px] font-mono text-text-subtle truncate">
            Wiki → Notes → Ontology → Links → Topics → Eval
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Optional single-model override; empty = keep the tiered defaults. */}
          <select
            value={override ?? ""}
            onChange={(e) => setOverride(e.target.value === "" ? null : (e.target.value as WikiModel))}
            disabled={running}
            className="bg-bg-primary border border-border-main text-[9px] font-mono text-text-main px-1.5 py-0.5 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">Tiered (Opus / Sonnet)</option>
            {WIKI_MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                All: {m.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={running}
            aria-disabled={running}
            onClick={handleBuild}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase border transition-colors",
              running
                ? "border-border-main text-text-subtle cursor-not-allowed"
                : "border-accent bg-accent text-text-on-accent hover:bg-accent-hover",
            )}
          >
            <RefreshCw size={10} className={cn(running && "animate-spin")} />
            {running ? "Building…" : hasRun ? "Rebuild" : "Build Brain"}
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
          step.status === "running"
            ? "text-text-main"
            : step.status === "done"
              ? "text-text-main"
              : step.status === "skipped"
                ? "text-text-subtle"
                : "text-text-muted",
        )}
      >
        {step.label}
      </span>
      <span className="text-[9px] text-text-subtle shrink-0">{shortModel(step.model)}</span>
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

  // Wiki is the only layer whose failure skips the rest, so any skipped steps
  // mean the run was aborted at the root.
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
        <span className="text-success">Second brain built — all {total} layers done.</span>
      )}
    </div>
  );
}
