import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Terminal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useProjects, type ProjectEntry } from "@/hooks/useProjects";
import {
  DuplicateRootError,
  InvalidRootPathError,
  useAddProjectRoot,
  useDeleteProjectRoot,
} from "@/hooks/useProjectRoots";

/**
 * Self-contained CRUD widget for the `project_roots` DB table.
 *
 * Lists every entry returned by `useProjects` (env + DB merged), lets the
 * user add an absolute path, and remove rows that originated from the DB.
 * Used by both Settings and Profile so the same control surfaces in two
 * places — keeping discoverability high without duplicating logic.
 */
export function ProjectRootsManager() {
  const projects = useProjects();
  const add = useAddProjectRoot();
  const remove = useDeleteProjectRoot();
  const [input, setInput] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ProjectEntry | null>(null);

  const onAdd = () => {
    const value = input.trim();
    if (value.length === 0) return;
    add.mutate(value, {
      onSuccess: (row) => {
        toast.success(`Added ${row.absolutePath}`);
        setInput("");
      },
      onError: (err) => {
        if (err instanceof DuplicateRootError) {
          toast.error(`Already registered (${err.source})`, {
            description: err.absolutePath,
          });
          return;
        }
        if (err instanceof InvalidRootPathError) {
          toast.error("Invalid path", { description: err.message });
          return;
        }
        if (err instanceof ApiError) {
          toast.error(`Add failed (HTTP ${err.status})`);
          return;
        }
        toast.error("Add failed", { description: err.message });
      },
    });
  };

  const onConfirmDelete = () => {
    if (!pendingDelete?.id) return;
    const target = pendingDelete;
    remove.mutate(target.id!, {
      onSuccess: () => {
        toast.success(`Removed ${target.absolutePath}`);
      },
      onError: (err) => {
        if (err instanceof ApiError) {
          toast.error(`Delete failed (HTTP ${err.status})`);
          return;
        }
        toast.error("Delete failed", { description: err.message });
      },
    });
    setPendingDelete(null);
  };

  const entries = projects.data ?? [];

  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
        Project Roots
      </label>
      <p className="text-[10px] text-text-subtle font-mono leading-relaxed">
        Register absolute paths to surface them in the sidebar.
        <code className="mx-1">HAETAE_PROJECT_ROOTS</code> env entries (ENV) are
        read-only; only rows added here (USER) can be removed.
      </p>

      <div className="border border-border-main divide-y divide-border-subtle">
        {projects.isError && (
          <div className="px-3 py-2 text-[11px] font-mono text-danger">
            Failed to load projects.
          </div>
        )}
        {projects.isPending && (
          <div className="px-3 py-2 text-[11px] font-mono text-text-muted">Loading…</div>
        )}
        {!projects.isPending && !projects.isError && entries.length === 0 && (
          <div className="px-3 py-2 text-[11px] font-mono text-text-subtle">
            No project roots registered.
          </div>
        )}
        {entries.map((entry) => (
          <RootRow
            key={`${entry.source}:${entry.absolutePath}`}
            entry={entry}
            onDelete={() => setPendingDelete(entry)}
          />
        ))}
      </div>

      <div className="flex gap-2 pt-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="/Users/me/Documents/GitHub/MyProject"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
          className="flex-1 bg-bg-secondary text-text-main border border-border-main px-3 py-2 text-[12px] font-mono focus:bg-bg-primary focus:outline-none focus:ring-1 focus:ring-accent transition-colors placeholder:text-text-subtle"
        />
        <button
          type="button"
          onClick={onAdd}
          disabled={add.isPending || input.trim().length === 0}
          className="inline-flex items-center gap-1 px-4 py-2 text-[10px] font-bold uppercase bg-accent text-text-on-accent hover:bg-accent-hover transition-colors disabled:bg-bg-secondary disabled:text-text-subtle disabled:border disabled:border-border-subtle disabled:cursor-not-allowed"
        >
          <Plus size={12} />
          <span>{add.isPending ? "Adding…" : "Add"}</span>
        </button>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
        title="Remove project root?"
        description={
          pendingDelete
            ? `Removes ${pendingDelete.absolutePath} from the sidebar. Nothing on disk is touched.`
            : ""
        }
        confirmLabel="Remove"
        cancelLabel="Keep"
        variant="danger"
        onConfirm={onConfirmDelete}
      />
    </div>
  );
}

function RootRow({ entry, onDelete }: { entry: ProjectEntry; onDelete: () => void }) {
  const isUser = entry.source === "user";
  return (
    <div className="px-3 py-2 flex items-center gap-3 bg-bg-primary">
      <span
        className={
          isUser
            ? "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-accent text-text-on-accent shrink-0"
            : "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-bg-secondary text-text-muted border border-border-subtle shrink-0"
        }
      >
        {entry.source}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-mono text-text-main truncate">
          {entry.absolutePath}
        </div>
        <div className="text-[10px] font-mono text-text-muted">
          {entry.hasClaudeDir ? ".claude/ ✓" : ".claude/ missing"}
        </div>
      </div>
      <Link
        to="/working/terminal"
        search={{ cwd: entry.absolutePath }}
        title="Open a terminal at this project root"
        aria-label={`Open terminal at ${entry.absolutePath}`}
        className="shrink-0 p-1 text-text-muted hover:text-text-main hover:bg-bg-hover transition-colors"
      >
        <Terminal size={14} />
      </Link>
      <button
        type="button"
        onClick={onDelete}
        disabled={!isUser}
        title={isUser ? "Remove" : "ENV entries are edited in .env.local directly"}
        aria-label={`Remove ${entry.absolutePath}`}
        className="shrink-0 p-1 text-text-muted hover:text-danger hover:bg-bg-hover transition-colors disabled:text-text-subtle disabled:cursor-not-allowed disabled:hover:bg-transparent"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
