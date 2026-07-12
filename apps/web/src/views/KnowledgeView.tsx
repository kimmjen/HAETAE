import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Library } from "lucide-react";
import {
  useKnowledge,
  type BrainIndexProject,
  type BrainIndexNote,
  type BrainIndexConcept,
} from "@/hooks/useKnowledge";
import { useSessionSearch, type SessionSearchHit } from "@/hooks/useSessionSearch";
import { useProjects } from "@/hooks/useProjects";
import { BrainAskPanel } from "@/components/BrainAskPanel";
import dayjs from "@/lib/dayjs";
import { cn } from "@/lib/utils";

type Layer = "projects" | "notes" | "concepts" | "search" | "ask";

const LAYERS: { key: Layer; label: string }[] = [
  { key: "projects", label: "Projects" },
  { key: "notes", label: "Notes" },
  { key: "concepts", label: "Concepts" },
  { key: "search", label: "Search" },
  { key: "ask", label: "Ask" },
];

export function KnowledgeView() {
  const [layer, setLayer] = useState<Layer>("projects");
  const [projectFilter, setProjectFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Debounce so live typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const knowledgeQ = useKnowledge();
  const projectsQ = useProjects();
  const searchQ = useSessionSearch({
    q: debouncedSearch,
    projectPath: projectFilter || undefined,
    enabled: layer === "search",
  });

  const projects = knowledgeQ.data?.data.projects ?? [];
  const notes = knowledgeQ.data?.data.notes ?? [];
  const concepts = knowledgeQ.data?.data.concepts ?? [];

  // path → slug for drill-down links (slug is dedup-assigned server-side, so it
  // only comes from the discovered-projects list, not the catalog itself).
  const slugByPath = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projectsQ.data ?? []) m.set(p.absolutePath, p.slug);
    return m;
  }, [projectsQ.data]);

  const matchesFilter = (path: string) => !projectFilter || path === projectFilter;
  const shownProjects = projects.filter((p) => matchesFilter(p.projectPath));
  const shownNotes = notes.filter((n) => matchesFilter(n.projectPath));
  const shownConcepts = concepts.filter((c) => matchesFilter(c.projectPath));

  const labelOf = (path: string) =>
    projects.find((p) => p.projectPath === path)?.label ?? path.split("/").pop() ?? path;

  return (
    <div className="space-y-3">
      <div className="border border-border-main bg-bg-secondary px-3 py-2 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-text-main">
          <Library size={12} className="text-text-muted" />
          Knowledge
          <span className="text-[10px] font-mono text-text-muted normal-case">
            {projects.length} projects · {notes.length} notes · {concepts.length} concepts
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex border border-border-main">
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

          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            className="bg-bg-primary border border-border-main text-[10px] font-mono text-text-main px-2 py-0.5 focus:outline-none"
          >
            <option value="">All Projects</option>
            {projects.map((p) => (
              <option key={p.projectPath} value={p.projectPath}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {layer === "ask" ? (
        <BrainAskPanel
          projectFilter={projectFilter}
          projectName={projectFilter ? labelOf(projectFilter) : undefined}
          slugByPath={slugByPath}
        />
      ) : layer === "search" ? (
        <SearchPanel
          input={searchInput}
          onInput={setSearchInput}
          query={searchQ}
          labelOf={labelOf}
        />
      ) : knowledgeQ.isPending ? (
        <div className="text-[11px] font-mono text-text-muted px-1">Loading…</div>
      ) : knowledgeQ.isError ? (
        <div className="px-4 py-8 text-[11px] font-mono text-danger">
          Failed to load the knowledge catalog.
        </div>
      ) : projects.length === 0 ? (
        <div className="border border-border-main bg-bg-secondary px-4 py-6 text-center">
          <p className="text-[11px] font-mono text-text-muted">
            No project has a generated wiki yet.
          </p>
          <p className="text-[10px] font-mono text-text-subtle mt-1">
            Generate a wiki from a project page's Wiki tab and it will show up here.
          </p>
        </div>
      ) : layer === "projects" ? (
        <div className="border border-border-main divide-y divide-border-subtle">
          {shownProjects.map((p) => (
            <ProjectRow key={p.projectPath} project={p} slug={slugByPath.get(p.projectPath)} />
          ))}
        </div>
      ) : layer === "notes" ? (
        <div className="border border-border-main divide-y divide-border-subtle">
          {shownNotes.length === 0 ? (
            <EmptyLayer label="notes" />
          ) : (
            shownNotes.map((n) => (
              <NoteRow
                key={`${n.projectPath}:${n.slug}`}
                note={n}
                projectLabel={labelOf(n.projectPath)}
                slug={slugByPath.get(n.projectPath)}
              />
            ))
          )}
        </div>
      ) : (
        <div className="border border-border-main divide-y divide-border-subtle">
          {shownConcepts.length === 0 ? (
            <EmptyLayer label="concepts" />
          ) : (
            shownConcepts.map((c) => (
              <ConceptRow
                key={`${c.projectPath}:${c.id}`}
                concept={c}
                projectLabel={labelOf(c.projectPath)}
                slug={slugByPath.get(c.projectPath)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function EmptyLayer({ label }: { label: string }) {
  return (
    <div className="px-4 py-6 text-center text-[11px] font-mono text-text-subtle">
      No {label} match this filter.
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null)
    return <span className="text-[9px] font-mono text-text-subtle">unrated</span>;
  const tone =
    score >= 70
      ? "border-accent/40 text-accent"
      : score < 40
        ? "border-danger/40 text-danger"
        : "border-border-main text-text-muted";
  return (
    <span className={cn("text-[9px] font-bold uppercase px-1 py-0.5 border", tone)}>
      trust {score}
    </span>
  );
}

function StaleBadge() {
  return (
    <span className="text-[9px] font-bold uppercase px-1 py-0.5 border border-danger/40 text-danger">
      stale
    </span>
  );
}

interface RowShellProps {
  slug?: string;
  children: React.ReactNode;
}

/** Whole-row drill-down to the project page when the slug is known. */
function RowShell({ slug, children }: RowShellProps) {
  const className =
    "block px-3 py-1.5 bg-bg-primary hover:bg-bg-hover transition-colors";
  if (!slug) return <div className={className}>{children}</div>;
  return (
    <Link to="/projects/$slug" params={{ slug }} className={className}>
      {children}
    </Link>
  );
}

function ProjectRow({ project, slug }: { project: BrainIndexProject; slug?: string }) {
  return (
    <RowShell slug={slug}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-text-main truncate max-w-[220px]">
          {project.label}
        </span>
        <ScoreBadge score={project.evalScore} />
        {project.wikiStale && <StaleBadge />}
        <span className="text-[10px] font-mono text-text-muted">
          {project.noteCount} notes · {project.conceptCount} concepts
        </span>
        {project.wikiSummary && (
          <span className="text-[10px] font-mono text-text-subtle truncate max-w-[320px]">
            {project.wikiSummary}
          </span>
        )}
        <span className="ml-auto text-[10px] font-mono text-text-subtle">
          {dayjs(project.wikiGeneratedAt).fromNow()}
        </span>
      </div>
    </RowShell>
  );
}

function NoteRow({
  note,
  projectLabel,
  slug,
}: {
  note: BrainIndexNote;
  projectLabel: string;
  slug?: string;
}) {
  return (
    <RowShell slug={slug}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-text-main truncate max-w-[320px]">
          {note.title}
        </span>
        {note.stale && <StaleBadge />}
        <span className="text-[10px] font-mono text-text-subtle">{projectLabel}</span>
        <span className="ml-auto text-[10px] font-mono text-text-muted" title="wikilink degree">
          deg {note.degree}
        </span>
      </div>
    </RowShell>
  );
}

function ConceptRow({
  concept,
  projectLabel,
  slug,
}: {
  concept: BrainIndexConcept;
  projectLabel: string;
  slug?: string;
}) {
  return (
    <RowShell slug={slug}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[9px] font-bold uppercase px-1 py-0.5 border border-border-main text-text-muted">
          {concept.kind}
        </span>
        <span className="text-[11px] font-bold text-text-main truncate max-w-[320px]">
          {concept.label}
        </span>
        {concept.stale && <StaleBadge />}
        <span className="ml-auto text-[10px] font-mono text-text-subtle">{projectLabel}</span>
      </div>
    </RowShell>
  );
}

function SearchPanel({
  input,
  onInput,
  query,
  labelOf,
}: {
  input: string;
  onInput: (v: string) => void;
  query: ReturnType<typeof useSessionSearch>;
  labelOf: (path: string) => string;
}) {
  const hits = query.data?.data ?? [];
  const trimmed = input.trim();

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={input}
        onChange={(e) => onInput(e.target.value)}
        placeholder="Search conversations across all projects…"
        className="w-full bg-bg-primary border border-border-main text-[11px] font-mono text-text-main px-2 py-1 focus:outline-none focus:border-accent"
      />
      {trimmed.length < 2 ? (
        <div className="px-4 py-6 text-center text-[11px] font-mono text-text-subtle">
          Type 2+ characters to search conversations across every project.
        </div>
      ) : query.isPending ? (
        <div className="text-[11px] font-mono text-text-muted px-1">Searching…</div>
      ) : query.isError ? (
        <div className="px-4 py-8 text-[11px] font-mono text-danger">Search failed.</div>
      ) : hits.length === 0 ? (
        <div className="px-4 py-6 text-center text-[11px] font-mono text-text-subtle">
          No conversations match "{trimmed}".
        </div>
      ) : (
        <div className="border border-border-main divide-y divide-border-subtle">
          {hits.map((h, i) => (
            <SearchHitRow
              key={`${h.sessionId}:${h.ts}:${i}`}
              hit={h}
              projectLabel={labelOf(h.projectPath)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchHitRow({ hit, projectLabel }: { hit: SessionSearchHit; projectLabel: string }) {
  return (
    <Link
      to="/watching/sessions/$sessionId"
      params={{ sessionId: hit.sessionId }}
      className="block px-3 py-1.5 bg-bg-primary hover:bg-bg-hover transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase px-1 py-0.5 border border-border-main text-text-muted">
          {hit.role}
        </span>
        <span className="text-[10px] font-mono text-text-subtle">{projectLabel}</span>
        <span className="ml-auto text-[10px] font-mono text-text-subtle">
          {dayjs(hit.ts).fromNow()}
        </span>
      </div>
      <p className="text-[11px] font-mono text-text-main mt-1 break-words leading-relaxed">
        {hit.snippet}
      </p>
    </Link>
  );
}
