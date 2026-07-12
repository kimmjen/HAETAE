import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { FileTree } from "@/components/FileTree";
import { MarkdownEditor } from "@/components/MarkdownEditor";
import { useFile, type FileResponse } from "@/hooks/useFile";
import { FileConflictError, useUpdateFile } from "@/hooks/useUpdateFile";
import {
  useAggregatedRulesList,
  type AggregatedOrigin,
  type AggregatedSection,
} from "@/hooks/useAggregatedRulesList";
import type { TreeCategory } from "@/hooks/useRulesList";

interface AggregatedRulesViewProps {
  /** Header title in the editor area when nothing is selected. */
  title: string;
  /** Empty-state copy when no scope has any matching files. */
  emptyMessage: string;
  /** category passed through to claude-fs (rules or skills). */
  category: TreeCategory;
  /** Whether to include the global ~/.claude/ section. */
  includeGlobal: boolean;
  /** Where the "+ new" button drops the user (with scope preset). */
  newSkillTargetScope?: "global" | "first-project";
}

interface Selection {
  scope: string;
  path: string;
}

/**
 * Multi-origin rules/skills view used by the Rules and Skills nav. Each
 * origin renders as its own collapsible-style section with a FileTree;
 * selection is keyed by `(scope, path)` so the same relPath in different
 * scopes never collides.
 */
export function AggregatedRulesView({
  title,
  emptyMessage,
  category,
  includeGlobal,
  newSkillTargetScope = "global",
}: AggregatedRulesViewProps) {
  const aggregate = useAggregatedRulesList({ category, includeGlobal });
  const [selected, setSelected] = useState<Selection | null>(null);

  const totalFiles = useMemo(
    () => aggregate.sections.reduce((acc, s) => acc + countFiles(s.data ?? []), 0),
    [aggregate.sections],
  );

  return (
    <div className="h-[calc(100vh-140px)] flex border border-border-main bg-bg-primary overflow-hidden">
      <SectionList
        sections={aggregate.sections}
        isPending={aggregate.isPending}
        isError={aggregate.isError}
        emptyMessage={emptyMessage}
        selected={selected}
        onSelect={setSelected}
        totalFiles={totalFiles}
        category={category}
        newSkillTargetScope={newSkillTargetScope}
      />
      <Editor selection={selected} title={title} />
    </div>
  );
}

interface SectionListProps {
  sections: AggregatedSection[];
  isPending: boolean;
  isError: boolean;
  emptyMessage: string;
  selected: Selection | null;
  onSelect: (next: Selection | null) => void;
  totalFiles: number;
  category: TreeCategory;
  newSkillTargetScope: "global" | "first-project";
}

function SectionList({
  sections,
  isPending,
  isError,
  emptyMessage,
  selected,
  onSelect,
  totalFiles,
  category,
  newSkillTargetScope,
}: SectionListProps) {
  const navigate = useNavigate();
  const targetScope = pickNewSkillScope(sections, newSkillTargetScope);
  const allSettled = sections.every((s) => !s.isPending);
  const showEmptyState = !isPending && !isError && allSettled && totalFiles === 0;

  return (
    <div className="w-[320px] border-r border-border-main flex flex-col bg-bg-secondary">
      <div className="p-3 border-b border-border-main bg-bg-primary flex items-center justify-between">
        <div className="text-[10px] font-black uppercase tracking-widest text-text-main">
          Sources
        </div>
        <div className="text-[9px] font-mono text-text-subtle uppercase tracking-wider">
          {totalFiles} file{totalFiles === 1 ? "" : "s"}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isError ? (
          <div className="p-4 text-[11px] font-mono text-danger">
            Failed to load the project list.
          </div>
        ) : isPending ? (
          <div className="p-4 text-[11px] font-mono text-text-muted">Loading…</div>
        ) : showEmptyState ? (
          <div className="p-4 space-y-3">
            <p className="text-[11px] font-mono text-text-muted leading-relaxed">
              {emptyMessage}
            </p>
            {targetScope && (
              <button
                type="button"
                onClick={() =>
                  navigate({
                    to: "/guarding/skills/new",
                    search:
                      targetScope === "global"
                        ? undefined
                        : { scope: targetScope },
                  })
                }
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors"
              >
                <Plus size={12} />
                <span>New {category === "skills" ? "skill" : "rule"}</span>
              </button>
            )}
          </div>
        ) : (
          sections.map((section) => (
            <Section
              key={`${section.origin.kind}:${section.origin.scope}`}
              section={section}
              selected={selected}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}

function Section({
  section,
  selected,
  onSelect,
}: {
  section: AggregatedSection;
  selected: Selection | null;
  onSelect: (next: Selection | null) => void;
}) {
  const { origin, data, isPending, isError } = section;
  const isActiveScope = selected?.scope === origin.scope;

  return (
    <div className="border-b border-border-subtle last:border-b-0">
      <OriginHeader origin={origin} isActiveScope={isActiveScope} />
      {isError ? (
        <div className="px-3 py-2 text-[10px] font-mono text-danger">
          Failed to load this origin's tree.
        </div>
      ) : isPending ? (
        <div className="px-3 py-2 text-[10px] font-mono text-text-muted">Loading…</div>
      ) : origin.missing ? (
        <div className="px-3 py-2 text-[10px] font-mono text-text-subtle leading-relaxed">
          No .claude/ directory
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="px-3 py-2 text-[10px] font-mono text-text-subtle">None</div>
      ) : (
        <FileTree
          entries={data ?? []}
          selectedPath={isActiveScope ? selected!.path : null}
          onSelect={(path) => onSelect({ scope: origin.scope, path })}
        />
      )}
    </div>
  );
}

function OriginHeader({
  origin,
  isActiveScope,
}: {
  origin: AggregatedOrigin;
  isActiveScope: boolean;
}) {
  // Global section's badge already says GLOBAL — repeating the label
  // here would just duplicate the same word.
  const showLabel = origin.kind !== "global";
  return (
    <div className="px-3 py-2 bg-bg-secondary flex items-center gap-2 sticky top-0 z-10">
      <span
        className={cn(
          "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 shrink-0",
          origin.kind === "global"
            ? "bg-accent text-text-on-accent"
            : "bg-bg-primary text-text-muted border border-border-subtle",
        )}
      >
        {origin.kind === "global" ? "GLOBAL" : "PROJECT"}
      </span>
      {showLabel && (
        <span
          className={cn(
            "text-[11px] font-bold uppercase truncate",
            isActiveScope ? "text-text-main" : "text-text-muted",
          )}
        >
          {origin.label}
        </span>
      )}
    </div>
  );
}

function Editor({ selection, title }: { selection: Selection | null; title: string }) {
  if (!selection) {
    return (
      <div className="flex-1 flex flex-col">
        <EditorHeader title={title} path={null} dirty={false} canSave={false} onSave={noop} onRevert={noop} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-[11px] font-mono text-text-muted uppercase">
            Select a file from the tree on the left
          </div>
        </div>
      </div>
    );
  }
  return <EditorScope key={`${selection.scope}:${selection.path}`} selection={selection} title={title} />;
}

function EditorScope({ selection, title }: { selection: Selection; title: string }) {
  const file = useFile(selection.path, selection.scope);

  if (file.isError) {
    return (
      <div className="flex-1 flex flex-col">
        <EditorHeader title={title} path={selection.path} dirty={false} canSave={false} onSave={noop} onRevert={noop} />
        <div className="flex-1 p-6 text-[11px] font-mono text-danger">
          Failed to load the file.
        </div>
      </div>
    );
  }
  if (file.isPending || !file.data) {
    return (
      <div className="flex-1 flex flex-col">
        <EditorHeader title={title} path={selection.path} dirty={false} canSave={false} onSave={noop} onRevert={noop} />
        <div className="flex-1 p-6 text-[11px] font-mono text-text-muted">Loading…</div>
      </div>
    );
  }
  return <EditorReady selection={selection} server={file.data} title={title} />;
}

function EditorReady({
  selection,
  server,
  title,
}: {
  selection: Selection;
  server: FileResponse;
  title: string;
}) {
  const [content, setContent] = useState(server.content);
  const [baseline, setBaseline] = useState(server);
  const update = useUpdateFile(selection.scope);

  useEffect(() => {
    setContent(server.content);
    setBaseline(server);
  }, [selection.scope, selection.path, server.mtime]);

  const dirty = content !== baseline.content;
  const canSave = dirty && !update.isPending;

  const onSave = useCallback(() => {
    if (!canSave) return;
    update.mutate(
      { path: selection.path, content, expectedMtime: baseline.mtime },
      {
        onSuccess: (next) => {
          setBaseline(next);
          setContent(next.content);
          toast.success(`Saved ${selection.path}`, {
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
  }, [baseline.mtime, canSave, content, selection.path, update]);

  const onRevert = useCallback(() => setContent(baseline.content), [baseline.content]);

  return (
    <div className="flex-1 flex flex-col">
      <EditorHeader
        title={title}
        path={selection.path}
        dirty={dirty}
        canSave={canSave}
        onSave={onSave}
        onRevert={onRevert}
        scopeLabel={scopeBadge(selection.scope)}
      />
      <div className="flex-1 bg-bg-elevated">
        <MarkdownEditor value={content} onChange={setContent} onSave={onSave} />
      </div>
    </div>
  );
}

interface EditorHeaderProps {
  title: string;
  path: string | null;
  dirty: boolean;
  canSave: boolean;
  onSave: () => void;
  onRevert: () => void;
  scopeLabel?: string;
}

function EditorHeader({
  title,
  path,
  dirty,
  canSave,
  onSave,
  onRevert,
  scopeLabel,
}: EditorHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 bg-bg-secondary border-b border-border-main">
      <div className="text-[11px] font-black uppercase text-text-main flex items-center gap-2 min-w-0">
        {path ? (
          <>
            {scopeLabel && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-accent text-text-on-accent shrink-0">
                {scopeLabel}
              </span>
            )}
            <span className="text-text-muted">/</span>
            <span className="truncate">{path}</span>
            {dirty && (
              <span
                className="w-2 h-2 rounded-full bg-warning shrink-0"
                aria-label="Unsaved changes"
                title="Unsaved changes"
              />
            )}
          </>
        ) : (
          <span className="text-text-muted">{title}</span>
        )}
      </div>
      <div className="flex gap-2 shrink-0">
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

function noop() {
  /* placeholder for editor controls when nothing is selected */
}

function countFiles(entries: { type: string; children?: unknown[] }[]): number {
  let count = 0;
  for (const e of entries) {
    if (e.type === "file") count += 1;
    else if (e.children) count += countFiles(e.children as typeof entries);
  }
  return count;
}

function scopeBadge(scope: string): string {
  return scope === "global" ? "GLOBAL" : scope.toUpperCase();
}

function pickNewSkillScope(
  sections: AggregatedSection[],
  preference: "global" | "first-project",
): string | null {
  if (preference === "global") {
    return sections.find((s) => s.origin.kind === "global") ? "global" : null;
  }
  const firstProject = sections.find((s) => s.origin.kind === "project" && !s.origin.missing);
  return firstProject?.origin.scope ?? null;
}
