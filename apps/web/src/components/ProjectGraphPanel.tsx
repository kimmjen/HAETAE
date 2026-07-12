import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { RefreshCw, Sparkles, X } from "lucide-react";
import {
  useProjectGraph,
  useOntologyGraph,
  useGenerateOntology,
  useNotesGraph,
  useGenerateNotes,
  useNotesSearch,
  useLinksGraph,
  useGenerateLinks,
  type GraphNode,
  type AtomicNote,
} from "@/hooks/useProjectGraph";
import { GraphCanvas, LegendDot, LegendSquare } from "@/components/GraphCanvas";
import { StaleBadge } from "@/components/StaleBadge";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";

type Mode = "structure" | "ontology" | "notes" | "unified";

interface ProjectGraphPanelProps {
  projectPath: string;
}

export function ProjectGraphPanel({ projectPath }: ProjectGraphPanelProps) {
  const [mode, setMode] = useState<Mode>("structure");
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-px px-2 pt-1.5 border-b border-border-main shrink-0">
        <ModeTab label="Structure" active={mode === "structure"} onClick={() => setMode("structure")} />
        <ModeTab label="Ontology" active={mode === "ontology"} onClick={() => setMode("ontology")} />
        <ModeTab label="Notes" active={mode === "notes"} onClick={() => setMode("notes")} />
        <ModeTab label="Unified" active={mode === "unified"} onClick={() => setMode("unified")} />
      </div>
      <div className="flex-1 min-h-0">
        {mode === "structure" ? (
          <StructureGraph projectPath={projectPath} />
        ) : mode === "ontology" ? (
          <OntologyGraph projectPath={projectPath} />
        ) : mode === "notes" ? (
          <NotesGraph projectPath={projectPath} />
        ) : (
          <UnifiedGraph projectPath={projectPath} />
        )}
      </div>
    </div>
  );
}

function ModeTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2 py-1 text-[9px] font-bold uppercase tracking-wider border-b-2 -mb-px transition-colors",
        active ? "border-accent text-text-main" : "border-transparent text-text-muted hover:text-text-main",
      )}
    >
      {label}
    </button>
  );
}

function StructureGraph({ projectPath }: { projectPath: string }) {
  const graphQ = useProjectGraph(projectPath);
  const navigate = useNavigate();
  const data = graphQ.data;
  const sessionCount = data?.nodes.filter((n) => n.type === "session").length ?? 0;
  const topicCount = data?.nodes.filter((n) => n.type === "topic").length ?? 0;

  return (
    <GraphCanvas
      nodes={data?.nodes ?? []}
      edges={data?.edges ?? []}
      isLoading={graphQ.isLoading}
      emptyLabel="No session data"
      countsLabel={`${sessionCount} sessions · ${topicCount} files`}
      clusterColorType="topic"
      legend={
        <>
          <LegendDot color="#7c3aed" label="Opus" />
          <LegendDot color="#2563eb" label="Sonnet" />
          <LegendDot color="#0891b2" label="Haiku" />
          <LegendSquare color="#16a34a" label="File (color = cluster)" />
          <span className="text-[8px] font-mono text-text-subtle ml-auto">click a session for details</span>
        </>
      }
      onNodeClick={(node) => {
        if (node.type === "session" && node.sessionId) {
          navigate({ to: "/watching/sessions/$sessionId", params: { sessionId: node.sessionId } });
        }
      }}
      renderTooltip={(node) => <StructureTooltip node={node} />}
    />
  );
}

function OntologyGraph({ projectPath }: { projectPath: string }) {
  const q = useOntologyGraph(projectPath);
  const generate = useGenerateOntology();
  const onto = q.data;

  if (!q.isLoading && !onto && !generate.isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-3">
        <div className="text-[10px] font-mono text-text-muted max-w-xs leading-relaxed">
          A knowledge ontology of concepts and semantic relations (supports · extends · depends on · contradicts …) extracted from the wiki.
        </div>
        {generate.isError && (
          <div className="text-[9px] font-mono text-danger max-w-xs">
            {generate.error instanceof Error ? generate.error.message : "Generation failed"}
          </div>
        )}
        <button
          type="button"
          onClick={() => generate.mutate({ projectPath, model: "claude-opus-4-7" })}
          className="px-3 py-1 text-[10px] font-bold uppercase border border-accent bg-accent text-text-on-accent hover:bg-accent-hover transition-colors"
        >
          Generate Ontology
        </button>
      </div>
    );
  }

  if (generate.isPending) {
    return (
      <div className="flex items-center justify-center h-full text-[10px] font-mono text-text-muted gap-2">
        <RefreshCw size={14} className="animate-spin" />
        Extracting concepts & relations…
      </div>
    );
  }

  const conceptCount = onto?.graph.nodes.length ?? 0;
  const relCount = onto?.graph.edges.length ?? 0;

  return (
    <GraphCanvas
      nodes={onto?.graph.nodes ?? []}
      edges={onto?.graph.edges ?? []}
      isLoading={q.isLoading}
      emptyLabel="No concepts extracted"
      countsLabel={`${conceptCount} concepts · ${relCount} relations`}
      showEdgeLabels
      legend={
        <>
          <LegendDot color="#ef4444" label="Decision" />
          <LegendDot color="#2563eb" label="Component" />
          <LegendDot color="#0891b2" label="Tech" />
          <LegendDot color="#f59e0b" label="Problem" />
          <LegendDot color="#16a34a" label="Goal" />
          {onto?.isStale ? (
            <span className="ml-auto">
              <StaleBadge
                onRegenerate={() => generate.mutate({ projectPath, model: "claude-opus-4-7" })}
                pending={generate.isPending}
              />
            </span>
          ) : (
            <span className="text-[8px] font-mono text-text-subtle ml-auto">edge = semantic relation</span>
          )}
        </>
      }
      renderTooltip={(node) => (
        <>
          <div className="font-bold text-[10px] truncate">{node.label}</div>
          <div className="text-text-muted mt-0.5">{node.kind || "concept"}</div>
        </>
      )}
    />
  );
}

function NotesGraph({ projectPath }: { projectPath: string }) {
  const q = useNotesGraph(projectPath);
  const generate = useGenerateNotes();
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [matchSlugs, setMatchSlugs] = useState<string[] | null>(null);
  const result = q.data;

  if (!q.isLoading && !result && !generate.isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-3">
        <div className="text-[10px] font-mono text-text-muted max-w-xs leading-relaxed">
          A Zettelkasten that splits the wiki into one-idea atomic notes linked by [[wikilinks]].
        </div>
        {generate.isError && (
          <div className="text-[9px] font-mono text-danger max-w-xs">
            {generate.error instanceof Error ? generate.error.message : "Generation failed"}
          </div>
        )}
        <button
          type="button"
          onClick={() => generate.mutate({ projectPath, model: "claude-opus-4-7" })}
          className="px-3 py-1 text-[10px] font-bold uppercase border border-accent bg-accent text-text-on-accent hover:bg-accent-hover transition-colors"
        >
          Generate Notes
        </button>
      </div>
    );
  }

  if (generate.isPending) {
    return (
      <div className="flex items-center justify-center h-full text-[10px] font-mono text-text-muted gap-2">
        <RefreshCw size={14} className="animate-spin" />
        Splitting the wiki into atomic notes…
      </div>
    );
  }

  const notes = result?.notes ?? [];
  const selected = selectedSlug ? notes.find((n) => n.slug === selectedSlug) : null;
  // Only navigate to slugs that exist — content may hold dangling wikilinks.
  const navigateToNote = (slug: string) => {
    if (notes.some((n) => n.slug === slug)) setSelectedSlug(slug);
  };
  // Semantic-search matches → graph node ids the canvas spotlights.
  const highlightIds = useMemo(
    () => (matchSlugs ? new Set(matchSlugs.map((s) => `note:${s}`)) : null),
    [matchSlugs],
  );

  return (
    <GraphCanvas
      nodes={result?.graph.nodes ?? []}
      edges={result?.graph.edges ?? []}
      isLoading={q.isLoading}
      emptyLabel="No notes"
      countsLabel={`${notes.length} notes · ${result?.graph.edges.length ?? 0} links`}
      clusterColorType="note"
      highlightIds={highlightIds}
      legend={
        <>
          <LegendDot color="#d97706" label="Note (color = cluster)" />
          {result?.isStale ? (
            <span className="ml-auto">
              <StaleBadge
                onRegenerate={() => generate.mutate({ projectPath, model: "claude-opus-4-7" })}
                pending={generate.isPending}
              />
            </span>
          ) : (
            <span className="text-[8px] font-mono text-text-subtle ml-auto">click a note for content</span>
          )}
        </>
      }
      onNodeClick={(node) => {
        if (node.type === "note") setSelectedSlug(node.id.replace(/^note:/, ""));
      }}
      renderTooltip={(node) => (
        <>
          <div className="font-bold text-[10px] truncate">{node.label}</div>
          <div className="text-text-subtle mt-0.5">Click to open the note</div>
        </>
      )}
      overlay={
        <>
          {result && (
            <NoteSemanticSearch projectPath={projectPath} matched={matchSlugs} onResults={setMatchSlugs} />
          )}
          {selected && (
            <NoteOverlay note={selected} onClose={() => setSelectedSlug(null)} onNavigate={navigateToNote} />
          )}
        </>
      }
    />
  );
}

/**
 * "의미로 찾기" — runs a meaning-based note search (not the header's literal
 * substring filter) and spotlights the matched nodes. Karpathy index pattern:
 * the agent reads the note titles and picks by meaning, so "인증" finds the
 * OAuth note even though that word never appears.
 */
function NoteSemanticSearch({
  projectPath,
  matched,
  onResults,
}: {
  projectPath: string;
  matched: string[] | null;
  onResults: (slugs: string[] | null) => void;
}) {
  const [q, setQ] = useState("");
  const search = useNotesSearch();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    search.mutate({ projectPath, query }, { onSuccess: (d) => onResults(d.slugs) });
  };
  const disabled = search.isPending || !q.trim();
  return (
    <form
      onSubmit={submit}
      className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-bg-secondary border border-border-main p-1"
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by meaning…"
        className="w-28 bg-bg-primary border border-border-main text-[9px] font-mono text-text-main px-1.5 py-0.5 focus:outline-none focus:w-36 transition-all"
      />
      <button
        type="submit"
        disabled={disabled}
        aria-disabled={disabled}
        title="Search by meaning (LLM)"
        className={cn(
          "shrink-0 transition-colors",
          disabled ? "text-text-subtle cursor-not-allowed" : "text-text-muted hover:text-text-main",
        )}
      >
        {search.isPending ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
      </button>
      {matched !== null && (
        <>
          <span className="text-[8px] font-mono text-text-muted whitespace-nowrap">
            {search.isError ? "Search failed" : `${matched.length} matches`}
          </span>
          <button
            type="button"
            onClick={() => {
              onResults(null);
              setQ("");
            }}
            title="Clear"
            className="shrink-0 text-text-muted hover:text-text-main transition-colors"
          >
            <X size={11} />
          </button>
        </>
      )}
    </form>
  );
}

/**
 * Unified graph — atomic notes (layer 1) + ontology concepts (layer 2) tied by
 * note→concept "mentions" edges the agent inferred by meaning. Requires both
 * notes and ontology; the generate button surfaces that prerequisite if missing.
 */
function UnifiedGraph({ projectPath }: { projectPath: string }) {
  const q = useLinksGraph(projectPath);
  const generate = useGenerateLinks();
  const result = q.data;
  const regenerate = () => generate.mutate({ projectPath, model: "claude-opus-4-7" });

  if (!q.isLoading && !result && !generate.isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-3">
        <div className="text-[10px] font-mono text-text-muted max-w-xs leading-relaxed">
          Links atomic notes and ontology concepts by meaning into one knowledge graph. Generate notes and ontology first.
        </div>
        {generate.isError && (
          <div className="text-[9px] font-mono text-danger max-w-xs">
            {generate.error instanceof Error ? generate.error.message : "Generation failed"}
          </div>
        )}
        <button
          type="button"
          onClick={regenerate}
          className="px-3 py-1 text-[10px] font-bold uppercase border border-accent bg-accent text-text-on-accent hover:bg-accent-hover transition-colors"
        >
          Link Notes & Concepts
        </button>
      </div>
    );
  }

  if (generate.isPending) {
    return (
      <div className="flex items-center justify-center h-full text-[10px] font-mono text-text-muted gap-2">
        <RefreshCw size={14} className="animate-spin" />
        Linking notes and concepts by meaning…
      </div>
    );
  }

  const nodes = result?.graph.nodes ?? [];
  const noteCount = nodes.filter((n) => n.type === "note").length;
  const conceptCount = nodes.filter((n) => n.type === "concept").length;
  const linkCount = result?.links.length ?? 0;

  return (
    <GraphCanvas
      nodes={nodes}
      edges={result?.graph.edges ?? []}
      isLoading={q.isLoading}
      emptyLabel="No linked graph"
      countsLabel={`${noteCount} notes · ${conceptCount} concepts · ${linkCount} links`}
      legend={
        <>
          <LegendDot color="#d97706" label="Notes" />
          <LegendDot color="#2563eb" label="Concept" />
          <LegendSquare color="#94a3b8" label="Note→Concept" />
          {result?.isStale ? (
            <span className="ml-auto">
              <StaleBadge onRegenerate={regenerate} pending={generate.isPending} />
            </span>
          ) : (
            <span className="text-[8px] font-mono text-text-subtle ml-auto">edge = mentions (semantic)</span>
          )}
        </>
      }
      renderTooltip={(node) => (
        <>
          <div className="font-bold text-[10px] truncate">{node.label}</div>
          <div className="text-text-muted mt-0.5">{node.type === "note" ? "Note" : node.kind || "concept"}</div>
        </>
      )}
    />
  );
}

function NoteOverlay({
  note,
  onClose,
  onNavigate,
}: {
  note: AtomicNote;
  onClose: () => void;
  onNavigate: (slug: string) => void;
}) {
  // Split content on [[slug]] / [[slug|alias]] and render links as buttons.
  const parts = note.content.split(/(\[\[[^\]]+\]\])/g);
  return (
    <div className="absolute top-2 right-2 z-20 w-64 max-h-[70%] overflow-y-auto bg-bg-secondary border border-border-main p-2.5">
      <div className="flex items-start gap-2">
        <div className="font-bold text-[10px] font-mono text-text-main flex-1">{note.title}</div>
        <button type="button" onClick={onClose} className="text-text-muted hover:text-text-main shrink-0">
          <X size={11} />
        </button>
      </div>
      <div className="mt-1.5 text-[9px] font-mono text-text-muted leading-relaxed whitespace-pre-wrap">
        {parts.map((p, i) => {
          const m = p.match(/^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/);
          if (!m) return <span key={i}>{p}</span>;
          const slug = m[1].trim();
          return (
            <button
              key={i}
              type="button"
              onClick={() => onNavigate(slug)}
              className="text-accent underline underline-offset-2 hover:text-accent-hover"
            >
              {m[2]?.trim() || slug}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StructureTooltip({ node }: { node: GraphNode }) {
  return (
    <>
      <div className="font-bold text-[10px] truncate">{node.label}</div>
      {node.type === "session" && (
        <>
          <div className="text-text-muted mt-0.5">{node.tokenCount?.toLocaleString()} tokens</div>
          {node.ts && <div className="text-text-subtle">{dayjs(node.ts).fromNow()} · click for details</div>}
        </>
      )}
      {node.type === "topic" && (
        <div className="text-text-muted mt-0.5">File/module — linked to sessions that touched it</div>
      )}
    </>
  );
}
