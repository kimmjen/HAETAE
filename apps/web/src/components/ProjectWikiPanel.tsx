import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { BookOpen, RefreshCw, AlertTriangle, FileCode, History, Undo2, Download } from "lucide-react";
import {
  useProjectWiki,
  useGenerateWiki,
  useWikiHistory,
  useRollbackWiki,
  useVaultExport,
  WIKI_MODELS,
  type WikiModel,
  type WikiGenerateResult,
} from "@/hooks/useProjectWiki";
import { ProjectGraphPanel } from "@/components/ProjectGraphPanel";
import { WikiEvalBar } from "@/components/WikiEvalBar";
import { shortModel } from "@/lib/models";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";

interface TocEntry {
  level: number;
  text: string;
  id: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function extractToc(markdown: string): TocEntry[] {
  return markdown
    .split("\n")
    .map((line) => {
      const m = line.match(/^(#{1,3})\s+(.+)/);
      if (!m) return null;
      const text = m[2].trim();
      return { level: m[1].length, text, id: slugify(text) };
    })
    .filter((e): e is TocEntry => e !== null);
}

interface ProjectWikiPanelProps {
  projectPath: string;
}

export function ProjectWikiPanel({ projectPath }: ProjectWikiPanelProps) {
  const wikiQ = useProjectWiki(projectPath);
  const generate = useGenerateWiki();
  const [model, setModel] = useState<WikiModel>("claude-opus-4-8");
  const [showRaw, setShowRaw] = useState(false);
  const [lastResult, setLastResult] = useState<WikiGenerateResult | null>(null);
  const [showHistory, setShowHistory] = useState(false);
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
          </div>
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
      title={exportVault.data?.dir ?? "Notes + wiki as a .md vault — open with Obsidian"}
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

function WikiMarkdown({ content }: { content: string }) {
  const idCounters = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    idCounters.current.clear();
  }, [content]);

  function makeId(text: string): string {
    const base = slugify(text);
    const count = (idCounters.current.get(base) ?? 0) + 1;
    idCounters.current.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  }

  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => {
          const id = makeId(String(children));
          return (
            <h1
              data-heading-id={id}
              className="text-[14px] font-black uppercase tracking-tight text-text-main mb-3 pb-1 border-b border-border-main scroll-mt-4"
            >
              {children}
            </h1>
          );
        },
        h2: ({ children }) => {
          const id = makeId(String(children));
          return (
            <h2
              data-heading-id={id}
              className="text-[12px] font-bold uppercase tracking-wide text-text-main mt-5 mb-2 scroll-mt-4"
            >
              {children}
            </h2>
          );
        },
        h3: ({ children }) => {
          const id = makeId(String(children));
          return (
            <h3
              data-heading-id={id}
              className="text-[11px] font-bold text-text-main mt-3 mb-1 scroll-mt-4"
            >
              {children}
            </h3>
          );
        },
        p: ({ children }) => (
          <p className="text-[11px] font-mono text-text-main leading-relaxed mb-2">{children}</p>
        ),
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => (
          <li className="text-[11px] font-mono text-text-main leading-relaxed">{children}</li>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            return (
              <pre className="bg-bg-primary border border-border-main p-2 text-[10px] font-mono text-text-main overflow-x-auto mb-2">
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-bg-primary px-1 text-[10px] font-mono text-text-main">
              {children}
            </code>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-border-main pl-3 text-text-muted mb-2">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="border-border-main my-3" />,
        strong: ({ children }) => <strong className="font-bold text-text-main">{children}</strong>,
        em: ({ children }) => <em className="italic text-text-muted">{children}</em>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
