import { useState } from "react";
import { Layers, RefreshCw, AlertTriangle } from "lucide-react";
import { useTopics, useGenerateTopics, type TopicsResult } from "@/hooks/useProjectGraph";
import { WIKI_MODELS, type WikiModel } from "@/hooks/useProjectWiki";
import { WikiMarkdown } from "./WikiMarkdown";
import { DEFAULT_MODEL, shortModel } from "@/lib/models";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";

interface ProjectTopicsPanelProps {
  projectPath: string;
}

export function ProjectTopicsPanel({ projectPath }: ProjectTopicsPanelProps) {
  const topicsQ = useTopics(projectPath);
  const generate = useGenerateTopics();
  const [model, setModel] = useState<WikiModel>(DEFAULT_MODEL);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const result = topicsQ.data ?? null;
  const topics = result?.topics ?? [];
  const active = topics.find((t) => t.slug === selectedSlug) ?? topics[0] ?? null;

  function handleGenerate() {
    generate.mutate({ projectPath, model });
  }

  if (topicsQ.isLoading) {
    return (
      <div className="border border-border-main bg-bg-secondary">
        <PanelHeader
          result={null}
          model={model}
          onModelChange={setModel}
          isGenerating={false}
          onGenerate={handleGenerate}
        />
        <div className="px-3 py-4 text-[10px] font-mono text-text-muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="border border-border-main bg-bg-secondary">
      <PanelHeader
        result={result}
        model={model}
        onModelChange={setModel}
        isGenerating={generate.isPending}
        onGenerate={handleGenerate}
      />

      {generate.isError && (
        <div className="px-3 py-2 text-[10px] font-mono text-danger border-b border-border-main">
          {generate.error instanceof Error ? generate.error.message : "Generation failed"}
        </div>
      )}

      {generate.isPending && (
        <div className="px-3 py-6 text-[10px] font-mono text-text-muted text-center">
          <RefreshCw size={14} className="inline mr-2 animate-spin" />
          Generating topic pages with Claude {WIKI_MODELS.find((m) => m.value === model)?.label ?? model}… (up to 3 minutes)
        </div>
      )}

      {!generate.isPending && topics.length === 0 && <EmptyState onGenerate={handleGenerate} />}

      {!generate.isPending && topics.length > 0 && active && (
        <div className="flex min-h-0" style={{ maxHeight: "72vh" }}>
          {/* Page list */}
          <div className="w-44 shrink-0 border-r border-border-main overflow-y-auto py-3">
            <div className="px-2 mb-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">
              Pages
            </div>
            <nav className="space-y-px">
              {topics.map((page) => (
                <button
                  key={page.slug}
                  type="button"
                  onClick={() => setSelectedSlug(page.slug)}
                  className={cn(
                    "w-full text-left px-2 py-1 text-[9px] font-mono hover:bg-bg-hover transition-colors truncate",
                    page.slug === active.slug
                      ? "font-bold text-text-main bg-bg-hover"
                      : "text-text-muted hover:text-text-main",
                  )}
                >
                  {page.title}
                </button>
              ))}
            </nav>
          </div>

          {/* Page content */}
          <div className="flex-1 overflow-y-auto min-w-0">
            <div className="p-4">
              <WikiMarkdown content={active.content} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelHeader({
  result,
  model,
  onModelChange,
  isGenerating,
  onGenerate,
}: {
  result: TopicsResult | null;
  model: WikiModel;
  onModelChange: (m: WikiModel) => void;
  isGenerating: boolean;
  onGenerate: () => void;
}) {
  const hasTopics = !!result && result.topics.length > 0;
  return (
    <div className="px-3 py-2 flex flex-wrap items-center gap-2 border-b border-border-main">
      <div className="flex items-center gap-2">
        <Layers size={12} className="text-text-muted shrink-0" />
        <span className="text-[11px] font-bold uppercase text-text-main">Topic Pages</span>

        {result && (
          <>
            <span className="text-[9px] font-mono text-text-subtle">
              {dayjs(result.generatedAt).fromNow()} · {shortModel(result.model)}
            </span>
            {result.isStale && (
              <span
                className="flex items-center gap-0.5 text-[9px] font-mono text-warning uppercase"
                title="The wiki changed after these pages were generated — refresh to update"
              >
                <AlertTriangle size={9} />
                Stale
              </span>
            )}
          </>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {/* Model selector */}
        <select
          value={model}
          onChange={(e) => onModelChange(e.target.value as WikiModel)}
          disabled={isGenerating}
          aria-disabled={isGenerating}
          className="bg-bg-primary border border-border-main text-[9px] font-mono text-text-main px-1.5 py-0.5 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {WIKI_MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={isGenerating}
          aria-disabled={isGenerating}
          onClick={onGenerate}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase border transition-colors",
            isGenerating
              ? "border-border-main text-text-subtle cursor-not-allowed"
              : hasTopics
                ? result?.isStale
                  ? "border-warning bg-bg-primary text-warning hover:bg-bg-hover"
                  : "border-border-main bg-bg-primary text-text-main hover:bg-bg-hover"
                : "border-accent bg-accent text-text-on-accent hover:bg-accent-hover",
          )}
        >
          <RefreshCw size={10} className={cn(isGenerating && "animate-spin")} />
          {hasTopics ? "Refresh" : "Generate"}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="px-3 py-8 flex flex-col items-center gap-3 text-center">
      <Layers size={24} className="text-text-subtle" />
      <div>
        <div className="text-[11px] font-bold text-text-main">No topic pages yet</div>
        <div className="text-[10px] font-mono text-text-muted mt-1 leading-relaxed max-w-xs">
          Topic pages go deeper on a single theme than the core wiki.
        </div>
      </div>
      <button
        type="button"
        onClick={onGenerate}
        className="px-3 py-1 text-[10px] font-bold uppercase border border-accent bg-accent text-text-on-accent hover:bg-accent-hover transition-colors"
      >
        Generate Topics
      </button>
    </div>
  );
}
