import { useState } from "react";
import { Search, RefreshCw, List, Network } from "lucide-react";
import {
  useNotebooks,
  useNotebookSources,
  useNotebookQa,
  useSyncNotebooks,
  useAskNotebook,
  useNotebookGraph,
  type NotebookRow,
} from "@/hooks/useNotebooks";
import { GraphCanvas, LegendDot } from "@/components/GraphCanvas";
import { ApiError } from "@/lib/api-client";
import dayjs from "@/lib/dayjs";

/**
 * Map a sync/ask error to a human note. The routes encode the failure kind in
 * the HTTP status (503 = CLI absent, 401 = cookies expired, 502 = other).
 */
function errorNote(err: unknown): string | null {
  if (err instanceof ApiError) {
    if (err.status === 503)
      return "The notebooklm CLI is not installed/on PATH. (notebooklm-py must be installed)";
    if (err.status === 401)
      return "NotebookLM auth has expired. Re-authenticate in the terminal, then sync again.";
    return err.message;
  }
  return err ? String(err) : null;
}

export function NotebooksView() {
  const notebooksQ = useNotebooks();
  const sync = useSyncNotebooks();
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"list" | "graph">("list");

  const notebooks: NotebookRow[] = notebooksQ.data?.notebooks ?? [];
  const syncErr = errorNote(sync.error);

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="border border-border-main bg-bg-secondary px-3 py-2 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-text-main">
          <Search size={12} className="text-text-muted" />
          Notebooks
          <span className="text-[10px] font-mono text-text-muted normal-case">
            {notebooks.length} mirrored
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMode((m) => (m === "list" ? "graph" : "list"))}
            className="flex items-center gap-1 border border-border-main bg-bg-primary px-2 py-0.5 text-[10px] font-mono text-text-main hover:bg-bg-hover"
            title={mode === "list" ? "Graph view" : "List view"}
          >
            {mode === "list" ? <Network size={11} /> : <List size={11} />}
            {mode === "list" ? "Graph" : "List"}
          </button>
          <button
            type="button"
            onClick={() => sync.mutate()}
            disabled={sync.isPending}
            className="flex items-center gap-1 border border-border-main bg-bg-primary px-2 py-0.5 text-[10px] font-mono text-text-main hover:bg-bg-hover disabled:opacity-50"
          >
            <RefreshCw size={11} className={sync.isPending ? "animate-spin" : ""} />
            {sync.isPending ? "Syncing…" : "Sync NotebookLM"}
          </button>
        </div>
      </div>

      {syncErr && (
        <div className="border border-border-main bg-bg-secondary px-3 py-2 text-[10px] font-mono text-text-muted">
          {syncErr}
        </div>
      )}

      {mode === "graph" ? (
        <div className="h-[600px]">
          <NotebookGraphPanel />
        </div>
      ) : notebooksQ.isPending ? (
        <div className="text-[11px] font-mono text-text-muted px-1">Loading…</div>
      ) : notebooks.length === 0 ? (
        <div className="border border-border-main bg-bg-secondary px-4 py-6 text-center">
          <p className="text-[11px] font-mono text-text-muted">
            No mirrored notebooks yet.
          </p>
          <p className="text-[10px] font-mono text-text-subtle mt-1">
            Pull in notebooks with "Sync NotebookLM" above.
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {notebooks.map((nb) => (
            <NotebookItem
              key={nb.notebook_id}
              nb={nb}
              open={selected === nb.notebook_id}
              onToggle={() =>
                setSelected((s) => (s === nb.notebook_id ? null : nb.notebook_id))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NotebookGraphPanel() {
  const q = useNotebookGraph();
  const nodes = q.data?.nodes ?? [];
  const edges = q.data?.edges ?? [];
  const nbCount = nodes.filter((n) => n.type === "notebook").length;
  const srcCount = nodes.filter((n) => n.type === "source").length;

  return (
    <GraphCanvas
      nodes={nodes}
      edges={edges}
      isLoading={q.isLoading}
      emptyLabel="No notebooks — sync first"
      countsLabel={`${nbCount} notebooks · ${srcCount} sources`}
      legend={
        <>
          <LegendDot color="#ec4899" label="Notebook" />
          <LegendDot color="#0891b2" label="Source" />
        </>
      }
      renderTooltip={(node) => (
        <>
          <div className="font-bold text-[10px] truncate">{node.label}</div>
          <div className="text-text-subtle mt-0.5">
            {node.type === "notebook" ? "Notebook" : "Source"}
          </div>
        </>
      )}
    />
  );
}

function NotebookItem({
  nb,
  open,
  onToggle,
}: {
  nb: NotebookRow;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border border-border-main bg-bg-secondary">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-hover"
      >
        <span className="text-[12px] text-text-main flex-1 truncate">
          {nb.title || "(untitled)"}
        </span>
        {nb.created_at && (
          <span className="text-[10px] font-mono text-text-subtle">
            {dayjs(nb.created_at).format("YYYY-MM-DD")}
          </span>
        )}
      </button>
      {open && <NotebookDetail notebookId={nb.notebook_id} />}
    </div>
  );
}

function NotebookDetail({ notebookId }: { notebookId: string }) {
  const sourcesQ = useNotebookSources(notebookId);
  const qaQ = useNotebookQa(notebookId);
  const ask = useAskNotebook(notebookId);
  const [question, setQuestion] = useState("");

  const askErr = errorNote(ask.error);

  return (
    <div className="border-t border-border-main px-3 py-2 space-y-3">
      {/* Sources */}
      <div>
        <div className="text-[10px] font-bold uppercase text-text-muted mb-1">Sources</div>
        {sourcesQ.isPending ? (
          <div className="text-[10px] font-mono text-text-subtle">Loading…</div>
        ) : (sourcesQ.data?.sources.length ?? 0) === 0 ? (
          <div className="text-[10px] font-mono text-text-subtle">None</div>
        ) : (
          <ul className="space-y-0.5">
            {sourcesQ.data!.sources.map((s) => (
              <li key={s.source_id} className="text-[11px] font-mono text-text-main truncate">
                · {s.title || s.source_id}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Ask */}
      <div>
        <div className="text-[10px] font-bold uppercase text-text-muted mb-1">Ask</div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = question.trim();
            if (q) ask.mutate(q, { onSuccess: () => setQuestion("") });
          }}
          className="flex gap-1"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask this notebook…"
            className="flex-1 bg-bg-primary border border-border-main text-[11px] font-mono text-text-main px-2 py-1 focus:outline-none"
          />
          <button
            type="submit"
            disabled={ask.isPending || !question.trim()}
            className="border border-border-main bg-bg-primary px-2 py-1 text-[10px] font-mono text-text-main hover:bg-bg-hover disabled:opacity-50"
          >
            {ask.isPending ? "…" : "Ask"}
          </button>
        </form>
        {askErr && (
          <div className="text-[10px] font-mono text-text-muted mt-1">{askErr}</div>
        )}
      </div>

      {/* Q&A history */}
      {(qaQ.data?.qa.length ?? 0) > 0 && (
        <div className="space-y-2">
          {qaQ.data!.qa.map((row) => (
            <div key={row.id} className="border border-border-main bg-bg-primary px-2 py-1">
              <div className="text-[11px] font-mono text-text-main">Q. {row.question}</div>
              <div className="text-[11px] font-mono text-text-muted whitespace-pre-wrap mt-1">
                {row.answer}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
