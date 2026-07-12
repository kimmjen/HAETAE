import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiGet, apiPost } from "@/lib/api-client";

export interface GraphNode {
  id: string;
  type: "session" | "topic" | "memory" | "project" | "concept" | "note" | "notebook" | "source";
  label: string;
  size: number;
  color: string;
  ts?: number;
  sessionId?: string;
  tokenCount?: number;
  projectSlug?: string;
  kind?: string;
  /** Owning project path (global-graph overlay nodes) for detail resolution. */
  projectPath?: string;
  /** Source identifier — note slug or concept id. */
  ref?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  weight: number;
  type: "temporal" | "topic" | "related" | "relation" | "wikilink" | "contains" | "shared" | "mentions";
  label?: string;
  color?: string;
}

export interface ProjectGraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function useProjectGraph(projectPath: string | null) {
  return useQuery({
    queryKey: ["project-graph", projectPath],
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams({ projectPath: projectPath! }).toString();
      return apiGet<ProjectGraphData>(`/api/wiki/graph?${qs}`, { signal });
    },
    enabled: !!projectPath,
    staleTime: 60_000,
  });
}

export function useGlobalGraph(include: ("notes" | "concepts")[] = []) {
  const qs = include.length ? `?include=${include.join(",")}` : "";
  return useQuery({
    queryKey: ["global-graph", include.join(",")],
    queryFn: ({ signal }) =>
      apiGet<ProjectGraphData>(`/api/wiki/graph/global${qs}`, { signal }),
    staleTime: 60_000,
  });
}

export function useSessionGraph(sessionId: string | null) {
  return useQuery({
    queryKey: ["session-graph", sessionId],
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams({ sessionId: sessionId! }).toString();
      return apiGet<ProjectGraphData>(`/api/wiki/graph/session?${qs}`, { signal });
    },
    enabled: !!sessionId,
    staleTime: 60_000,
  });
}

export interface OntologyResult {
  projectPath: string;
  graph: ProjectGraphData;
  model: string;
  generatedAt: number;
  wikiGeneratedAt: number | null;
  /** True when the wiki changed after this ontology was extracted. */
  isStale: boolean;
}

export function useOntologyGraph(projectPath: string | null, enabled = true) {
  return useQuery({
    queryKey: ["ontology-graph", projectPath],
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams({ projectPath: projectPath! }).toString();
      return apiGet<OntologyResult>(`/api/wiki/ontology?${qs}`, { signal }).catch((err) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      });
    },
    enabled: !!projectPath && enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useGenerateOntology() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectPath, model }: { projectPath: string; model: string }) =>
      apiPost<OntologyResult>("/api/wiki/ontology/generate", { projectPath, model }),
    onSuccess: (data) => qc.setQueryData(["ontology-graph", data.projectPath], data),
  });
}

export interface AtomicNote {
  slug: string;
  title: string;
  /** Plain prose with inline [[slug]] wikilinks. */
  content: string;
}

export interface NotesResult {
  projectPath: string;
  notes: AtomicNote[];
  graph: ProjectGraphData;
  model: string;
  generatedAt: number;
  wikiGeneratedAt: number | null;
  /** True when the wiki changed after these notes were split. */
  isStale: boolean;
}

export function useNotesGraph(projectPath: string | null, enabled = true) {
  return useQuery({
    queryKey: ["notes-graph", projectPath],
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams({ projectPath: projectPath! }).toString();
      return apiGet<NotesResult>(`/api/wiki/notes?${qs}`, { signal }).catch((err) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      });
    },
    enabled: !!projectPath && enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useGenerateNotes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectPath, model }: { projectPath: string; model: string }) =>
      apiPost<NotesResult>("/api/wiki/notes/generate", { projectPath, model }),
    onSuccess: (data) => qc.setQueryData(["notes-graph", data.projectPath], data),
  });
}

/** Meaning-based note search ("의미로 찾기") — agent picks relevant slugs by meaning. */
export function useNotesSearch() {
  return useMutation({
    mutationFn: ({ projectPath, query }: { projectPath: string; query: string }) =>
      apiPost<{ slugs: string[] }>("/api/wiki/notes/search", { projectPath, query }),
  });
}

export interface NoteConceptLink {
  noteSlug: string;
  conceptId: string;
}

export interface LinksResult {
  projectPath: string;
  links: NoteConceptLink[];
  /** Unified graph: notes + concepts + note→concept mention edges. */
  graph: ProjectGraphData;
  model: string;
  generatedAt: number;
  wikiGeneratedAt: number | null;
  /** True when the wiki changed after these links were built. */
  isStale: boolean;
}

export function useLinksGraph(projectPath: string | null, enabled = true) {
  return useQuery({
    queryKey: ["links-graph", projectPath],
    queryFn: ({ signal }) => {
      const qs = new URLSearchParams({ projectPath: projectPath! }).toString();
      return apiGet<LinksResult>(`/api/wiki/links?${qs}`, { signal }).catch((err) => {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      });
    },
    enabled: !!projectPath && enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useGenerateLinks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectPath, model }: { projectPath: string; model: string }) =>
      apiPost<LinksResult>("/api/wiki/links/generate", { projectPath, model }),
    onSuccess: (data) => qc.setQueryData(["links-graph", data.projectPath], data),
  });
}
