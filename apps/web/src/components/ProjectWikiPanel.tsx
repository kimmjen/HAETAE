import { useState, useRef } from "react";
import { BookOpen, RefreshCw, AlertTriangle, FileCode, History, Undo2, Download, Link as LinkIcon } from "lucide-react";
import {
  useProjectWiki,
  useGenerateWiki,
  useWikiHistory,
  useRollbackWiki,
  useVaultExport,
  useExternalSources,
  useAddExternalSource,
  useRemoveExternalSource,
  WIKI_MODELS,
  type WikiModel,
  type WikiGenerateResult,
} from "@/hooks/useProjectWiki";
import { ProjectGraphPanel } from "@/components/ProjectGraphPanel";
import { WikiEvalBar } from "@/components/WikiEvalBar";
import { extractToc, WikiMarkdown } from "./WikiMarkdown";
import { DEFAULT_MODEL, shortModel } from "@/lib/models";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";

interface ProjectWikiPanelProps {
  projectPath: string;
}

export function ProjectWikiPanel({ projectPath }: ProjectWikiPanelProps) {
  const wikiQ = useProjectWiki(projectPath);
  const generate = useGenerateWiki();
  const [model, setModel] = useState<WikiModel>(DEFAULT_MODEL);
  const [showRaw, setShowRaw] = useState(false);
  const [lastResult, setLastResult] = useState<WikiGenerateResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const historyQ = useWikiHistory(projectPath, showHistory);
  const rollback = useRollbackWiki();
  const contentRef = useRef<HTMLDivElement>(null);

  const wiki = wikiQ.data ?? null;
  const toc = wiki ? extractToc(wiki.content) : [];
  const history = historyQ.data?.data ?? [];

  function handleGenerate() {
    generate.mutate({ projectPath, model }, {
      onSuccess: (data) => setLastResult(data),
    });
  }

  function handleRollback(historyId: number) {
    rollback.mutate({ projectPath, historyId }, { onSuccess: () => setShowHistory(false) });
  }

  function scrollToId(id: string) {
    const el = contentRef.current?.querySelector(`[data-heading-id="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (wikiQ.isLoading) {
    return (
      <div className="border border-border-main bg-bg-secondary">
        <PanelHeader
          wiki={null}
          model={model}
          onModelChange={setModel}
          isGenerating={false}
          showRaw={showRaw}
          onToggleRaw={() => setShowRaw((v) => !v)}
          onGenerate={handleGenerate}
        />
        <div className="px-3 py-4 text-[10px] font-mono text-text-muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="border border-border-main bg-bg-secondary">
      <PanelHeader
        wiki={wiki}
        model={model}
        onModelChange={setModel}
        isGenerating={generate.isPending}
        showRaw={showRaw}
        onToggleRaw={() => setShowRaw((v) => !v)}
        onGenerate={handleGenerate}
      />

      {generate.isError && (
        <div className="px-3 py-2 text-[10px] font-mono text-danger border-b border-border-main">
          {generate.error instanceof Error ? generate.error.message : "Generation failed"}
        </div>
      )}

      {lastResult && !generate.isPending && (
        <div className="px-3 py-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-mono border-b border-border-main bg-bg-primary">
          {lastResult.noChange ? (
            <span className="text-text-muted">No changes — nothing new to fold in</span>
          ) : (
            <span className="text-success">
              Folded {lastResult.foldedMessages} messages
              {lastResult.pendingMessages > 0 && (
                <span className="text-warning"> · {lastResult.pendingMessages} left (refresh again to continue)</span>
              )}
            </span>
          )}
          {lastResult.claudeMd && (
            <span className="flex items-center gap-1 text-success">
              <FileCode size={10} />
              .claude/CLAUDE.md {lastResult.claudeMd.action === "created" ? "created" : lastResult.claudeMd.action === "replaced" ? "updated" : "appended"}
            </span>
          )}
        </div>
      )}

      {!generate.isPending && wiki && (
        <div className="border-b border-border-main">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="px-3 py-1 flex items-center gap-1 text-[9px] font-mono text-text-muted hover:text-text-main transition-colors"
            >
              <History size={10} />
              History {showHistory ? "▾" : "▸"}
            </button>
            <VaultExportButton projectPath={projectPath} />
            <SourcesToggle projectPath={projectPath} open={showSources} onToggle={() => setShowSources((v) => !v)} />
          </div>
          {showSources && <ExternalSourcesStrip projectPath={projectPath} />}
          {showHistory && (
            <div className="px-3 pb-2 space-y-1 max-h-48 overflow-y-auto">
              {historyQ.isLoading && <div className="text-[9px] font-mono text-text-muted">Loading…</div>}
              {!historyQ.isLoading && history.length === 0 && (
                <div className="text-[9px] font-mono text-text-subtle">
                  No previous versions — the prior version is kept whenever you refresh/regenerate.
                </div>
              )}
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center gap-2 text-[9px] font-mono bg-bg-primary border border-border-main px-2 py-1"
                >
                  <span className="text-text-muted shrink-0">{dayjs(h.archivedAt).fromNow()}</span>
                  <span className="text-text-subtle shrink-0">
                    {h.messagesCovered} msgs · {shortModel(h.model)}
                  </span>
                  <span className="text-text-main truncate flex-1">{h.summary ?? "(no summary)"}</span>
                  <button
                    type="button"
                    disabled={rollback.isPending}
                    onClick={() => handleRollback(h.id)}
                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold uppercase border border-border-main bg-bg-secondary text-text-main hover:bg-bg-hover transition-colors disabled:opacity-50 shrink-0"
                  >
                    <Undo2 size={9} />
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {rollback.isError && (
        <div className="px-3 py-1.5 text-[9px] font-mono text-danger border-b border-border-main">
          Rollback failed: {rollback.error instanceof Error ? rollback.error.message : "error"}
        </div>
      )}

      {!generate.isPending && wiki && <WikiEvalBar projectPath={projectPath} />}

      {generate.isPending && (
        <div className="px-3 py-6 text-[10px] font-mono text-text-muted text-center">
          <RefreshCw size={14} className="inline mr-2 animate-spin" />
          Generating the wiki page with Claude {WIKI_MODELS.find((m) => m.value === model)?.label ?? model}… (up to 3 minutes)
        </div>
      )}

      {!generate.isPending && !wiki && <EmptyState onGenerate={handleGenerate} />}

      {!generate.isPending && wiki && (
        <div className="flex min-h-0" style={{ maxHeight: "72vh" }}>
          {/* TOC sidebar */}
          {toc.length > 0 && !showRaw && (
            <div className="w-36 shrink-0 border-r border-border-main overflow-y-auto py-3">
              <div className="px-2 mb-2 text-[9px] font-bold uppercase tracking-widest text-text-muted">
                Contents
              </div>
              <nav className="space-y-px">
                {toc.map((entry, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => scrollToId(entry.id)}
                    className={cn(
                      "w-full text-left text-[9px] font-mono text-text-muted hover:text-text-main hover:bg-bg-hover transition-colors truncate",
                      entry.level === 1 && "px-2 py-1 font-bold text-text-main",
                      entry.level === 2 && "px-3 py-0.5",
                      entry.level === 3 && "px-5 py-0.5 text-text-subtle",
                    )}
                  >
                    {entry.text}
                  </button>
                ))}
              </nav>
            </div>
          )}

          {/* Wiki content */}
          <div ref={contentRef} className="flex-1 overflow-y-auto min-w-0">
            {showRaw ? (
              <pre className="p-3 text-[10px] font-mono text-text-main whitespace-pre-wrap leading-relaxed">
                {wiki.content}
              </pre>
            ) : (
              <div className="p-4">
                <WikiMarkdown content={wiki.content} />
              </div>
            )}
          </div>

          {/* Graph panel */}
          <div className="w-72 shrink-0 border-l border-border-main">
            <ProjectGraphPanel projectPath={wiki.projectPath} />
          </div>
        </div>
      )}
    </div>
  );
}

function PanelHeader({
  wiki,
  model,
  onModelChange,
  isGenerating,
  showRaw,
  onToggleRaw,
  onGenerate,
}: {
  wiki: { messagesCovered: number; pendingMessages: number; generatedAt: number; model: string; isStale: boolean } | null;
  model: WikiModel;
  onModelChange: (m: WikiModel) => void;
  isGenerating: boolean;
  showRaw: boolean;
  onToggleRaw: () => void;
  onGenerate: () => void;
}) {
  return (
    <div className="px-3 py-2 flex flex-wrap items-center gap-2 border-b border-border-main">
      <div className="flex items-center gap-2">
        <BookOpen size={12} className="text-text-muted shrink-0" />
        <span className="text-[11px] font-bold uppercase text-text-main">Wiki</span>

        {wiki && (
          <>
            <span className="text-[9px] font-mono text-text-subtle">
              {wiki.messagesCovered} msgs · {dayjs(wiki.generatedAt).fromNow()} · {shortModel(wiki.model)}
            </span>
            {wiki.isStale && (
              <span
                className="flex items-center gap-0.5 text-[9px] font-mono text-warning uppercase"
                title={`${wiki.pendingMessages} unfolded conversations — refresh to continue`}
              >
                <AlertTriangle size={9} />
                +{wiki.pendingMessages}
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
          className="bg-bg-primary border border-border-main text-[9px] font-mono text-text-main px-1.5 py-0.5 focus:outline-none disabled:opacity-50"
        >
          {WIKI_MODELS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        {wiki && (
          <button
            type="button"
            onClick={onToggleRaw}
            className="text-[9px] font-mono text-text-muted hover:text-text-main transition-colors uppercase"
          >
            {showRaw ? "Rendered" : "RAW"}
          </button>
        )}

        <button
          type="button"
          disabled={isGenerating}
          onClick={onGenerate}
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase border transition-colors",
            isGenerating
              ? "border-border-main text-text-subtle cursor-not-allowed"
              : wiki
                ? wiki.isStale
                  ? "border-warning bg-bg-primary text-warning hover:bg-bg-hover"
                  : "border-border-main bg-bg-primary text-text-main hover:bg-bg-hover"
                : "border-accent bg-accent text-text-on-accent hover:bg-accent-hover",
          )}
        >
          <RefreshCw size={10} className={cn(isGenerating && "animate-spin")} />
          {wiki ? "Refresh" : "Generate"}
        </button>
      </div>
    </div>
  );
}

function SourcesToggle({
  projectPath,
  open,
  onToggle,
}: {
  projectPath: string;
  open: boolean;
  onToggle: () => void;
}) {
  const sourcesQ = useExternalSources(projectPath);
  const count = sourcesQ.data?.data.length ?? 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="px-3 py-1 flex items-center gap-1 text-[9px] font-mono text-text-muted hover:text-text-main transition-colors"
    >
      <LinkIcon size={10} />
      Sources{count > 0 ? ` (${count})` : ""} {open ? "▾" : "▸"}
    </button>
  );
}

/**
 * External sources (#390): drop a URL → the server fetches + extracts text →
 * the next wiki synthesis absorbs it as an attributed [E…] claim.
 */
function ExternalSourcesStrip({ projectPath }: { projectPath: string }) {
  const sourcesQ = useExternalSources(projectPath);
  const add = useAddExternalSource();
  const remove = useRemoveExternalSource();
  const [url, setUrl] = useState("");
  const sources = sourcesQ.data?.data ?? [];

  function handleAdd() {
    const trimmed = url.trim();
    if (!trimmed) return;
    add.mutate({ projectPath, url: trimmed }, { onSuccess: () => setUrl("") });
  }

  return (
    <div className="px-3 pb-2 space-y-1">
      <div className="flex items-center gap-1">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="https:// — absorbed into the next wiki synthesis, always attributed"
          disabled={add.isPending}
          className="flex-1 bg-bg-primary border border-border-main text-[9px] font-mono text-text-main px-2 py-1 placeholder:text-text-subtle focus:outline-none focus-visible:border-accent disabled:opacity-50"
        />
        <button
          type="button"
          disabled={add.isPending || !url.trim()}
          onClick={handleAdd}
          aria-disabled={add.isPending || !url.trim()}
          className={cn(
            "px-2 py-1 text-[9px] font-bold uppercase border transition-colors",
            add.isPending || !url.trim()
              ? "border-border-main text-text-subtle cursor-not-allowed"
              : "border-border-main bg-bg-primary text-text-main hover:bg-bg-hover",
          )}
        >
          {add.isPending ? "Fetching…" : "Add"}
        </button>
      </div>
      {add.isError && (
        <div className="text-[9px] font-mono text-danger">
          {add.error instanceof Error ? add.error.message : "Fetch failed"}
        </div>
      )}
      {sources.length === 0 && !sourcesQ.isLoading && (
        <div className="text-[9px] font-mono text-text-subtle">
          No external sources — drop a URL to fold outside knowledge into the brain (provenance-tagged).
        </div>
      )}
      {sources.map((s) => (
        <div
          key={s.id}
          className="flex items-center gap-2 text-[9px] font-mono bg-bg-primary border border-border-main px-2 py-1"
        >
          <span className="text-text-main truncate flex-1" title={s.url}>
            {s.title}
          </span>
          <span className="text-text-subtle shrink-0">{dayjs(s.fetchedAt).fromNow()}</span>
          <button
            type="button"
            disabled={remove.isPending}
            onClick={() => remove.mutate({ projectPath, id: s.id })}
            className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-bold uppercase border border-border-main bg-bg-secondary text-text-main hover:bg-bg-hover transition-colors disabled:opacity-50 shrink-0"
          >
            Remove
          </button>
        </div>
      ))}
    </div>
  );
}

/** Export the brain (notes + wiki) as an Obsidian vault under .haetae/vault/. */
function VaultExportButton({ projectPath }: { projectPath: string }) {
  const exportVault = useVaultExport();
  const label = exportVault.isPending
    ? "Exporting…"
    : exportVault.isError
      ? "Export failed"
      : exportVault.data
        ? `Vault: ${exportVault.data.files} files → .haetae/vault`
        : "Export to Obsidian vault";
  return (
    <button
      type="button"
      disabled={exportVault.isPending}
      onClick={() => exportVault.mutate({ projectPath })}
      title={exportVault.data?.dir ?? "Whole brain (notes + concepts + links + topics + wiki) as a .md vault — open with Obsidian"}
      className="px-3 py-1 flex items-center gap-1 text-[9px] font-mono text-text-muted hover:text-text-main transition-colors disabled:opacity-50"
    >
      <Download size={10} />
      {label}
    </button>
  );
}

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="px-3 py-8 flex flex-col items-center gap-3 text-center">
      <BookOpen size={24} className="text-text-subtle" />
      <div>
        <div className="text-[11px] font-bold text-text-main">No wiki page yet</div>
        <div className="text-[10px] font-mono text-text-muted mt-1 leading-relaxed max-w-xs">
          Synthesizes a wiki page from every conversation in this project.
        </div>
      </div>
      <button
        type="button"
        onClick={onGenerate}
        className="px-3 py-1 text-[10px] font-bold uppercase border border-accent bg-accent text-text-on-accent hover:bg-accent-hover transition-colors"
      >
        Generate Wiki
      </button>
    </div>
  );
}
