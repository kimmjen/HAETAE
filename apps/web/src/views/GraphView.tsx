import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Share2, X } from "lucide-react";
import { useGlobalGraph, useNotesGraph, type GraphNode } from "@/hooks/useProjectGraph";
import { useProjects } from "@/hooks/useProjects";
import { GraphCanvas, LegendSquare } from "@/components/GraphCanvas";
import { NoteText } from "@/components/NoteText";
import { cn } from "@/lib/utils";

type Layer = "projects" | "notes" | "concepts";

const LAYER_INCLUDE: Record<Layer, ("notes" | "concepts")[]> = {
  projects: [],
  notes: ["notes"],
  concepts: ["notes", "concepts"],
};

const LAYERS: { key: Layer; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "notes", label: "+Notes" },
  { key: "concepts", label: "+Concepts" },
];

/**
 * Cross-project graph — one node per project, linked when projects share
 * signal files. The layer toggle overlays each project's atomic notes /
 * ontology concepts (P7.3). Clicking any node opens a detail panel.
 */
export function GraphView() {
  const [layer, setLayer] = useState<Layer>("projects");
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const graphQ = useGlobalGraph(LAYER_INCLUDE[layer]);
  const projectsQ = useProjects();
  const navigate = useNavigate();
  const data = graphQ.data;
  const nodeCount = data?.nodes.length ?? 0;
  const linkCount = data?.edges.length ?? 0;

  const projByPath = useMemo(() => {
    const m = new Map<string, { slug: string; name: string }>();
    for (const p of projectsQ.data ?? []) m.set(p.absolutePath, { slug: p.slug, name: p.name });
    return m;
  }, [projectsQ.data]);

  // Note body isn't in the graph payload — fetch the owning project's notes
  // lazily and pick the selected slug.
  const noteProjectPath = selected?.type === "note" ? (selected.projectPath ?? null) : null;
  const notesQ = useNotesGraph(noteProjectPath, !!noteProjectPath);
  const noteBody =
    selected?.type === "note"
      ? notesQ.data?.notes.find((n) => n.slug === selected.ref)?.content
      : undefined;

  const proj = selected?.projectPath ? projByPath.get(selected.projectPath) : undefined;
  const slug = selected?.projectSlug ?? proj?.slug;
  const projectName = selected?.type === "project" ? selected.label : proj?.name;

  return (
    <div className="h-[calc(100vh-3rem)] flex flex-col">
      <div className="px-3 py-2 border-b border-border-main flex flex-wrap items-center gap-2 shrink-0">
        <Share2 size={14} className="text-text-muted" />
        <span className="text-[12px] font-bold uppercase text-text-main">Projects Graph</span>
        <span className="text-[10px] font-mono text-text-subtle">
          Linked by shared files across projects — overlay notes/concepts to see the whole brain as one graph
        </span>
        <div className="ml-auto flex border border-border-main">
          {LAYERS.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setLayer(l.key)}
              className={cn(
                "text-[10px] font-bold uppercase px-2 py-0.5 transition-colors",
                layer === l.key
                  ? "bg-accent text-text-on-accent"
                  : "text-text-muted hover:bg-bg-hover",
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0">
          <GraphCanvas
            nodes={data?.nodes ?? []}
            edges={data?.edges ?? []}
            isLoading={graphQ.isLoading}
            emptyLabel="No data to build a project graph"
            countsLabel={`${nodeCount} nodes · ${linkCount} links`}
            clusterColorType="project"
            legend={
              <>
                <LegendSquare color="#16a34a" label="Project (color = cluster)" />
                {layer !== "projects" && <LegendSquare color="#d97706" label="Note" />}
                {layer === "concepts" && <LegendSquare color="#2563eb" label="Concept" />}
                <span className="text-[8px] font-mono text-text-subtle ml-auto">
                  click a node for details
                </span>
              </>
            }
            onNodeClick={(node) => setSelected(node)}
            renderTooltip={(node: GraphNode) => (
              <>
                <div className="font-bold text-[10px] truncate">{node.label}</div>
                {node.type === "project" ? (
                  <div className="text-text-muted mt-0.5">{node.tokenCount ?? 0} sessions</div>
                ) : (
                  <div className="text-text-muted mt-0.5">
                    {node.type === "concept" ? `Concept${node.kind ? ` · ${node.kind}` : ""}` : "Note"}
                  </div>
                )}
                <div className="text-text-subtle">click for details</div>
              </>
            )}
          />
        </div>
        {selected && (
          <NodeDetailPanel
            node={selected}
            projectName={projectName}
            slug={slug}
            noteLoading={selected.type === "note" && notesQ.isPending}
            noteBody={noteBody}
            onClose={() => setSelected(null)}
            onOpenProject={(s) => navigate({ to: "/projects/$slug", params: { slug: s } })}
          />
        )}
      </div>
    </div>
  );
}

interface NodeDetailPanelProps {
  node: GraphNode;
  projectName?: string;
  slug?: string;
  noteLoading: boolean;
  noteBody?: string;
  onClose: () => void;
  onOpenProject: (slug: string) => void;
}

function NodeDetailPanel({
  node,
  projectName,
  slug,
  noteLoading,
  noteBody,
  onClose,
  onOpenProject,
}: NodeDetailPanelProps) {
  return (
    <div className="w-72 shrink-0 border-l border-border-main bg-bg-secondary flex flex-col">
      <div className="px-3 py-2 border-b border-border-main flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase px-1 py-0.5 border border-border-main text-text-muted shrink-0">
          {node.type}
        </span>
        <span className="text-[11px] font-bold text-text-main truncate">{node.label}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="ml-auto shrink-0 text-text-muted hover:text-text-main transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {projectName && (
          <div className="text-[10px] font-mono text-text-subtle">Project: {projectName}</div>
        )}

        {node.type === "note" &&
          (noteLoading ? (
            <div className="text-[11px] font-mono text-text-muted">Loading…</div>
          ) : noteBody ? (
            <p className="text-[11px] font-mono text-text-main whitespace-pre-wrap leading-relaxed break-words">
              <NoteText content={noteBody} />
            </p>
          ) : (
            <div className="text-[11px] font-mono text-text-subtle">Note body not found.</div>
          ))}

        {node.type === "concept" && (
          <div className="text-[11px] font-mono text-text-main">Kind: {node.kind ?? "—"}</div>
        )}

        {node.type === "project" && (
          <div className="text-[11px] font-mono text-text-main">{node.tokenCount ?? 0} sessions</div>
        )}
      </div>

      {slug && (
        <div className="p-2 border-t border-border-main">
          <button
            type="button"
            onClick={() => onOpenProject(slug)}
            className="w-full text-[10px] font-bold uppercase px-2 py-1 bg-accent text-text-on-accent hover:opacity-90 transition-opacity"
          >
            Open project
          </button>
        </div>
      )}
    </div>
  );
}
