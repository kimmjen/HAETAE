import { useEffect, useRef, useState, type ReactNode } from "react";
import Graph from "graphology";
import { Sigma } from "sigma";
import forceAtlas2 from "graphology-layout-forceatlas2";
import louvain from "graphology-communities-louvain";
import { GitBranch, Maximize2, Minimize2, Crosshair, Search } from "lucide-react";
import type { GraphNode, GraphEdge } from "@/hooks/useProjectGraph";
import { cn } from "@/lib/utils";

// Cluster palette for Louvain communities — warm/green tones that do NOT
// collide with the cool session-model colors (Opus purple / Sonnet blue /
// Haiku cyan).
const CLUSTER_PALETTE = [
  "#16a34a", "#f59e0b", "#ec4899", "#ef4444", "#a3a300", "#65a30d", "#db2777", "#92400e",
];
const DIM_COLOR = "#2a2a2a";
const EDGE_COLOR: Record<string, string> = {
  related: "#16a34a88",
  topic: "#16a34a44",
  temporal: "#6b728055",
};

export interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  isLoading?: boolean;
  emptyLabel?: string;
  /** Short "N sessions · M files" style summary shown in the header. */
  countsLabel: string;
  legend: ReactNode;
  /** Node type whose nodes get recolored by Louvain community (e.g. "topic"). */
  clusterColorType?: GraphNode["type"];
  /** Render edge labels (e.g. typed ontology relations). */
  showEdgeLabels?: boolean;
  onNodeClick?: (node: GraphNode) => void;
  renderTooltip: (node: GraphNode) => ReactNode;
  /** Overlay rendered inside the canvas container (survives fullscreen). */
  overlay?: ReactNode;
  /**
   * Node ids to spotlight (e.g. semantic-search matches). When set, matched
   * nodes keep their color + label and the rest dim out. null = no spotlight.
   */
  highlightIds?: Set<string> | null;
}

export function GraphCanvas({
  nodes,
  edges,
  isLoading,
  emptyLabel = "No data",
  countsLabel,
  legend,
  clusterColorType,
  showEdgeLabels,
  onNodeClick,
  renderTooltip,
  overlay,
  highlightIds = null,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const hoveredRef = useRef<string | null>(null);
  const queryRef = useRef("");
  const clickRef = useRef(onNodeClick);
  clickRef.current = onNodeClick;
  // Spotlight set read inside the reducers; a ref so changing it only triggers a
  // refresh (below) instead of rebuilding Sigma + re-running the whole layout.
  const highlightRef = useRef(highlightIds);
  highlightRef.current = highlightIds;

  const [tooltip, setTooltip] = useState<GraphNode | null>(null);
  const [query, setQuery] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const empty = !nodes || nodes.length === 0;

  useEffect(() => {
    if (!containerRef.current || empty) return;
    sigmaRef.current?.kill();

    const graph = new Graph({ multi: false });
    const n = nodes.length;
    nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / n;
      graph.addNode(node.id, {
        label: node.label,
        size: node.size,
        color: node.color,
        x: Math.cos(angle),
        y: Math.sin(angle),
        nodeData: node,
      });
    });

    for (const e of edges) {
      if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) continue;
      if (graph.hasEdge(e.source, e.target)) continue;
      graph.addEdge(e.source, e.target, {
        // Hairline edges read as scattered dots, not a connected web — give the
        // links enough body to be the visible connective tissue (Obsidian feel).
        size: Math.max(1.4, e.weight * 1.6),
        color: e.color ?? EDGE_COLOR[e.type] ?? "#6b728055",
        ...(e.label ? { label: e.label, forceLabel: true } : {}),
      });
    }

    if (clusterColorType && graph.size > 0) {
      const communities = louvain(graph) as Record<string, number>;
      graph.forEachNode((id, attrs) => {
        const nd = attrs.nodeData as GraphNode;
        if (nd.type === clusterColorType) {
          const c = communities[id] ?? 0;
          graph.setNodeAttribute(id, "color", CLUSTER_PALETTE[c % CLUSTER_PALETTE.length]);
        }
      });
    }

    // Obsidian-style: node size grows with connection count (degree).
    graph.forEachNode((id) => {
      const deg = graph.degree(id);
      graph.setNodeAttribute(id, "size", Math.max(4, Math.min(20, 4 + Math.sqrt(deg) * 3.5)));
    });

    const matchesQuery = (label: unknown): boolean => {
      const q = queryRef.current.trim().toLowerCase();
      if (!q) return true;
      return String(label ?? "").toLowerCase().includes(q);
    };

    const sigma = new Sigma(graph, containerRef.current, {
      renderEdgeLabels: !!showEdgeLabels,
      edgeLabelFont: "monospace",
      edgeLabelSize: 9,
      edgeLabelColor: { color: "#9ca3af" },
      defaultEdgeColor: "#6b728033",
      defaultNodeColor: "#4a90e2",
      labelFont: "monospace",
      labelSize: 9,
      labelWeight: "bold",
      labelColor: { color: "#9ca3af" },
      // Obsidian-style: labels appear/declutter by zoom & node prominence
      // rather than all-always (which clutters).
      labelRenderedSizeThreshold: 7,
      nodeReducer: (node, attrs) => {
        const res = { ...attrs } as Record<string, unknown>;
        if (!matchesQuery(attrs.label)) {
          res.hidden = true;
          return res;
        }
        const hl = highlightRef.current;
        if (hl) {
          // Spotlight mode: matches keep color + always show their label; the
          // rest fade so the meaning-relevant nodes pop. Takes precedence over
          // hover dimming.
          if (hl.has(node)) {
            res.forceLabel = true;
            res.highlighted = true;
          } else {
            res.color = DIM_COLOR;
            res.label = "";
          }
          return res;
        }
        const hov = hoveredRef.current;
        if (hov && node !== hov && !graph.areNeighbors(node, hov)) {
          res.color = DIM_COLOR;
          res.label = "";
        }
        return res;
      },
      edgeReducer: (edge, attrs) => {
        const res = { ...attrs } as Record<string, unknown>;
        const [s, t] = graph.extremities(edge);
        if (!matchesQuery(graph.getNodeAttribute(s, "label")) && !matchesQuery(graph.getNodeAttribute(t, "label"))) {
          res.hidden = true;
          return res;
        }
        const hl = highlightRef.current;
        if (hl && !hl.has(s) && !hl.has(t)) {
          res.hidden = true;
          return res;
        }
        const hov = hoveredRef.current;
        if (hov && s !== hov && t !== hov) res.hidden = true;
        return res;
      },
    });

    // Drag + simulation state (declared before the handlers that close over it).
    const drag = { id: null as string | null, x: 0, y: 0 };
    let justDragged = false;
    let energy = 1;
    let rafId = 0;

    sigma.on("enterNode", ({ node }) => {
      hoveredRef.current = node;
      setTooltip(graph.getNodeAttribute(node, "nodeData") as GraphNode);
      sigma.refresh();
    });
    sigma.on("leaveNode", () => {
      hoveredRef.current = null;
      setTooltip(null);
      sigma.refresh();
    });
    sigma.on("clickNode", ({ node }) => {
      // A drag ends with both mouseup and clickNode — only a real click (no
      // intervening move) should activate the node.
      if (justDragged) {
        justDragged = false;
        return;
      }
      clickRef.current?.(graph.getNodeAttribute(node, "nodeData") as GraphNode);
    });

    // Obsidian-style live physics: rather than fire-and-forget the layout for a
    // fixed time, integrate one ForceAtlas2 step per frame with a cooling factor
    // so the graph eases into place and then stops (no idle CPU). Dragging a node
    // pins it under the cursor and re-heats the simulation, so its neighbours
    // elastically follow — the interaction that makes the graph feel alive.
    const settings = {
      ...forceAtlas2.inferSettings(graph),
      linLogMode: true,
      gravity: 0.5,
      scalingRatio: 8,
      adjustSizes: true,
      slowDown: 9,
      barnesHutOptimize: n > 100,
    };

    const pin = () => {
      if (drag.id) {
        graph.setNodeAttribute(drag.id, "x", drag.x);
        graph.setNodeAttribute(drag.id, "y", drag.y);
      }
    };
    const step = () => {
      pin(); // hold the dragged node before forces resolve around it
      forceAtlas2.assign(graph, { iterations: 1, settings });
      pin(); // and after, so it stays exactly under the cursor
      sigma.refresh();
      if (!drag.id) energy *= 0.985; // cool only when not actively dragging
      rafId = energy > 0.03 || drag.id ? requestAnimationFrame(step) : 0;
    };
    const reheat = () => {
      energy = 1;
      if (!rafId) rafId = requestAnimationFrame(step);
    };
    reheat(); // initial spread from the seeded circle

    const mouse = sigma.getMouseCaptor();
    sigma.on("downNode", ({ node }) => {
      drag.id = node;
      justDragged = false;
      graph.setNodeAttribute(node, "highlighted", true);
      reheat();
    });
    mouse.on("mousemovebody", (e) => {
      if (!drag.id) return;
      const pos = sigma.viewportToGraph(e);
      drag.x = pos.x;
      drag.y = pos.y;
      justDragged = true;
      reheat();
      e.preventSigmaDefault();
      e.original.preventDefault();
      e.original.stopPropagation();
    });
    mouse.on("mouseup", () => {
      if (!drag.id) return;
      graph.removeNodeAttribute(drag.id, "highlighted");
      drag.id = null; // release so the graph relaxes around the new position
      reheat();
    });

    sigmaRef.current = sigma;
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      sigma.kill();
      sigmaRef.current = null;
    };
    // `fullscreen` rebuilds Sigma into the correctly-sized container — resizing
    // the same instance across a large size change blanks the WebGL canvas.
  }, [nodes, edges, clusterColorType, showEdgeLabels, empty, fullscreen]);

  // Spotlight changes only need a reducer re-run, not a rebuild/relayout.
  useEffect(() => {
    sigmaRef.current?.refresh();
  }, [highlightIds]);

  function onQueryChange(v: string) {
    setQuery(v);
    queryRef.current = v;
    sigmaRef.current?.refresh();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-[10px] font-mono text-text-muted">
        Loading…
      </div>
    );
  }
  if (empty) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-3">
        <GitBranch size={20} className="text-text-subtle" />
        <div className="text-[10px] font-mono text-text-muted">{emptyLabel}</div>
      </div>
    );
  }

  return (
    <div className={cn("relative flex flex-col", fullscreen ? "fixed inset-0 z-50 bg-bg-primary" : "h-full")}>
      <div className="px-2 py-1.5 border-b border-border-main flex items-center gap-2 shrink-0">
        <span className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Graph</span>
        <span className="text-[9px] font-mono text-text-subtle shrink-0">{countsLabel}</span>
        <div className="relative ml-auto flex items-center">
          <Search size={10} className="absolute left-1.5 text-text-subtle pointer-events-none" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Filter…"
            className="w-24 bg-bg-primary border border-border-main text-[9px] font-mono text-text-main pl-5 pr-1.5 py-0.5 focus:outline-none focus:w-32 transition-all"
          />
        </div>
        <button type="button" onClick={() => sigmaRef.current?.getCamera().animatedReset()} title="Fit to view (reset zoom)" className="text-text-muted hover:text-text-main transition-colors">
          <Crosshair size={12} />
        </button>
        <button type="button" onClick={() => setFullscreen((v) => !v)} title={fullscreen ? "Exit fullscreen" : "Fullscreen"} className="text-text-muted hover:text-text-main transition-colors">
          {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>

      <div className="px-2 py-1 border-b border-border-main flex items-center gap-2 flex-wrap shrink-0">{legend}</div>

      <div ref={containerRef} className="flex-1 min-h-0" />

      {tooltip && (
        <div className="absolute bottom-2 left-2 z-10 bg-bg-secondary border border-border-main px-2 py-1.5 text-[9px] font-mono text-text-main pointer-events-none max-w-[220px]">
          {renderTooltip(tooltip)}
        </div>
      )}

      {overlay}
    </div>
  );
}

export function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[8px] font-mono text-text-subtle">
      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function LegendSquare({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1 text-[8px] font-mono text-text-subtle">
      <span className="w-2 h-2 inline-block" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
