import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { GitCompare, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api-client";
import type { Scope } from "@/lib/scope";
import { collectFilePaths } from "@/lib/tree-paths";
import { FileTree } from "@/components/FileTree";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { filterRulesTree } from "@/lib/filterTree";
import { useFile, type FileResponse } from "@/hooks/useFile";
import {
  useRulesList,
  type RulesEntry,
  type TreeCategory,
} from "@/hooks/useRulesList";
import { FileConflictError, useUpdateFile } from "@/hooks/useUpdateFile";

interface RulesViewProps {
  selectedPath: string | null;
  onSelect: (path: string) => void;
  /** Defaults to "global" — pass a project slug to scope the entire view. */
  scope?: Scope;
  /** Filter the tree by category (ADR 0007). Defaults to full tree. */
  category?: TreeCategory;
}

export function RulesView({ selectedPath, onSelect, scope = "global", category }: RulesViewProps) {
  const tree = useRulesList(scope, category);
  const entries: RulesEntry[] = tree.data ?? [];
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => filterRulesTree(entries, filter), [entries, filter]);

  return (
    <div className="h-[calc(100vh-140px)] flex border border-border-main bg-bg-primary overflow-hidden">
      <RuleNavList
        entries={filtered}
        isLoading={tree.isPending}
        isError={tree.isError}
        selectedPath={selectedPath}
        onSelect={onSelect}
        filter={filter}
        onFilterChange={setFilter}
        scope={scope}
      />
      <RuleEditor selectedPath={selectedPath} scope={scope} />
    </div>
  );
}

interface RuleNavListProps {
  entries: RulesEntry[];
  isLoading: boolean;
  isError: boolean;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  filter: string;
  onFilterChange: (next: string) => void;
  scope: Scope;
}

function RuleNavList({
  entries,
  isLoading,
  isError,
  selectedPath,
  onSelect,
  filter,
  onFilterChange,
  scope,
}: RuleNavListProps) {
  const navigate = useNavigate();
  const filtering = filter.trim().length > 0;
  const emptyMessage = filtering
    ? "No matching items."
    : "No rules registered yet.";
  const emptyAction = filtering ? null : (
    <button
      type="button"
      onClick={() =>
        navigate({
          to: "/guarding/skills/new",
          search:
            scope && scope !== "global" ? { scope } : undefined,
        })
      }
      className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors"
    >
      <Plus size={12} />
      <span>New rule / skill</span>
    </button>
  );

  return (
    <div className="w-[280px] border-r border-border-main flex flex-col bg-bg-secondary">
      <div className="p-3 border-b border-border-main bg-bg-primary">
        <div className="text-[10px] font-black uppercase tracking-widest mb-2 text-text-main">
          Rule Navigation
        </div>
        <div className="relative">
          <input
            type="text"
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="FILTER..."
            spellCheck={false}
            className="w-full text-[11px] font-bold px-3 py-1.5 bg-bg-secondary text-text-main border border-border-main focus:bg-bg-primary focus:outline-none focus:ring-1 focus:ring-accent transition-colors placeholder:text-text-subtle"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isError ? (
          <div className="p-4 text-[11px] font-mono text-danger">
            Failed to load the tree.
          </div>
        ) : isLoading ? (
          <div className="p-4 text-[11px] font-mono text-text-muted">Loading…</div>
        ) : (
          <FileTree
            entries={entries}
            selectedPath={selectedPath}
            onSelect={onSelect}
            emptyMessage={emptyMessage}
            emptyAction={emptyAction}
          />
        )}
      </div>
    </div>
  );
}

function RuleEditor({ selectedPath, scope }: { selectedPath: string | null; scope: Scope }) {
  const file = useFile(selectedPath, scope);

  if (!selectedPath) {
    return (
      <div className="flex-1 flex flex-col">
        <EditorHeader path={null} dirty={false} canSave={false} onSave={() => undefined} onRevert={() => undefined} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[11px] font-mono text-text-muted uppercase">
            Select a file from the tree on the left
          </div>
        </div>
      </div>
    );
  }

  if (file.isError) {
    return (
      <div className="flex-1 flex flex-col">
        <EditorHeader path={selectedPath} dirty={false} canSave={false} onSave={() => undefined} onRevert={() => undefined} />
        <div className="flex-1 p-6 text-[11px] font-mono text-danger">
          Failed to load the file.
        </div>
      </div>
    );
  }

  if (file.isPending || !file.data) {
    return (
      <div className="flex-1 flex flex-col">
        <EditorHeader path={selectedPath} dirty={false} canSave={false} onSave={() => undefined} onRevert={() => undefined} />
        <div className="flex-1 p-6 text-[11px] font-mono text-text-muted">Loading…</div>
      </div>
    );
  }

  return <RuleEditorReady path={selectedPath} server={file.data} scope={scope} />;
}

function RuleEditorReady({ path, server, scope }: { path: string; server: FileResponse; scope: Scope }) {
  const [content, setContent] = useState(server.content);
  const [baseline, setBaseline] = useState(server);
  const update = useUpdateFile(scope);
  const isProjectScope = scope !== undefined && scope !== "global";
  // Always reads the global tree (cached if we're on the global view, a
  // sibling fetch if we're on a project). Used to flag files that exist
  // in both places so we can offer a "Diff with global" entry-point.
  const globalTree = useRulesList("global");
  const globalHasTwin = useMemo(() => {
    if (!isProjectScope || !globalTree.data) return false;
    return collectFilePaths(globalTree.data).has(path);
  }, [globalTree.data, isProjectScope, path]);

  useEffect(() => {
    setContent(server.content);
    setBaseline(server);
  }, [path, server.mtime]);

  const dirty = content !== baseline.content;
  const canSave = dirty && !update.isPending;

  const onSave = useCallback(() => {
    if (!canSave) return;
    update.mutate(
      { path, content, expectedMtime: baseline.mtime },
      {
        onSuccess: (next) => {
          setBaseline(next);
          setContent(next.content);
          toast.success(`Saved ${path}`, {
            description: `backup #${next.backupId}`,
          });
        },
        onError: (err) => {
          if (err instanceof FileConflictError) {
            toast.error("File changed on disk", {
              description: `${err.path}  was modified on disk externally. Revert and try again.`,
            });
            return;
          }
          if (err instanceof ApiError) {
            toast.error(`Save failed (HTTP ${err.status})`);
            return;
          }
          toast.error("Save failed", { description: err.message });
        },
      },
    );
  }, [baseline.mtime, canSave, content, path, update]);

  const onRevert = useCallback(() => {
    setContent(baseline.content);
  }, [baseline.content]);

  const diffWithGlobal =
    isProjectScope && globalHasTwin && typeof scope === "string"
      ? { left: "global", right: scope, path }
      : null;

  return (
    <div className="flex-1 flex flex-col">
      <EditorHeader
        path={path}
        dirty={dirty}
        canSave={canSave}
        onSave={onSave}
        onRevert={onRevert}
        diffWithGlobal={diffWithGlobal}
      />
      {Object.keys(baseline.frontmatter).length > 0 && (
        <FrontmatterPanel frontmatter={baseline.frontmatter} />
      )}
      <div className="flex-1 bg-bg-elevated">
        <MarkdownEditor value={content} onChange={setContent} onSave={onSave} />
      </div>
    </div>
  );
}

interface EditorHeaderProps {
  path: string | null;
  dirty: boolean;
  canSave: boolean;
  onSave: () => void;
  onRevert: () => void;
  diffWithGlobal?: { left: string; right: string; path: string } | null;
}

function EditorHeader({ path, dirty, canSave, onSave, onRevert, diffWithGlobal }: EditorHeaderProps) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-bg-secondary border-b border-border-main">
      <div className="text-[11px] font-black uppercase text-text-main flex items-center gap-2">
        {path ? (
          <>
            <span className="text-text-muted">Edit /</span> {path}
            {dirty && (
              <span
                className="w-2 h-2 rounded-full bg-warning"
                aria-label="Unsaved changes"
                title="Unsaved changes"
              />
            )}
          </>
        ) : (
          <span className="text-text-muted">No file selected</span>
        )}
      </div>
      <div className="flex gap-2">
        {diffWithGlobal && (
          <button
            type="button"
            onClick={() =>
              navigate({
                to: "/diff",
                search: diffWithGlobal,
              })
            }
            title="Diff with global"
            className="inline-flex items-center gap-1 px-3 py-1 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors"
          >
            <GitCompare size={12} />
            <span>Diff w/ Global</span>
          </button>
        )}
        <button
          type="button"
          onClick={onRevert}
          disabled={!dirty}
          className={cn(
            "px-3 py-1 text-[10px] font-bold border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors",
            !dirty && "text-text-subtle cursor-not-allowed hover:bg-bg-primary",
          )}
        >
          REVERT
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={!canSave}
          className={cn(
            "px-3 py-1 text-[10px] font-bold bg-accent text-text-on-accent hover:bg-accent-hover transition-colors",
            !canSave && "bg-bg-secondary text-text-subtle cursor-not-allowed border border-border-main",
          )}
        >
          SAVE_DOC
        </button>
      </div>
    </div>
  );
}

function FrontmatterPanel({ frontmatter }: { frontmatter: Record<string, unknown> }) {
  return (
    <div className="border-b border-border-subtle px-6 py-3 bg-bg-secondary">
      <div className="text-[10px] font-black uppercase tracking-widest text-text-muted mb-2">
        Frontmatter
      </div>
      <div className="space-y-1">
        {Object.entries(frontmatter).map(([key, value]) => (
          <div key={key} className="text-[11px] font-mono text-text-main">
            <span className="text-text-muted">{key}:</span>{" "}
            <span>{formatFmValue(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatFmValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}
