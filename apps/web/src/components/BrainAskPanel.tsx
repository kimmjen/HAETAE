import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useBrainRecall, type RecalledNote } from "@/hooks/useKnowledge";
import { useAskBrain } from "@/hooks/useAskBrain";
import { NoteText } from "@/components/NoteText";
import dayjs from "@/lib/dayjs";

interface BrainAskPanelProps {
  /** "" = ask the whole brain (cross-project recall); else ask that one project. */
  projectFilter: string;
  projectName?: string;
  slugByPath: Map<string, string>;
}

/**
 * "Ask" surface for the knowledge explorer (P7.4). With the project filter on
 * "전체" it does cross-project meaning recall (recall_global) and lists the
 * relevant notes; with a project selected it asks that project's brain for a
 * grounded answer with citations (reuses /api/wiki/ask). Both are LLM calls,
 * fired on submit (not live).
 */
export function BrainAskPanel({ projectFilter, projectName, slugByPath }: BrainAskPanelProps) {
  const [input, setInput] = useState("");
  const recall = useBrainRecall();
  const ask = useAskBrain();
  const mode: "recall" | "ask" = projectFilter ? "ask" : "recall";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = input.trim();
    if (!q) return;
    if (mode === "recall") recall.mutate(q);
    else ask.mutate({ projectPath: projectFilter, question: q });
  }

  const pending = mode === "recall" ? recall.isPending : ask.isPending;
  const errored = mode === "recall" ? recall.isError : ask.isError;
  const notes: RecalledNote[] = recall.data?.data ?? [];
  const answer = ask.data;

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="space-y-2">
        <div className="text-[10px] font-mono text-text-subtle">
          {mode === "recall"
            ? "Whole-brain recall — search by meaning across every project's notes"
            : `Ask ${projectName ?? "this project"} — grounded answer with citations`}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "recall" ? "e.g. Why not use embeddings?" : "Ask about this project…"}
            className="flex-1 bg-bg-primary border border-border-main text-[11px] font-mono text-text-main px-2 py-1 focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={pending || input.trim().length === 0}
            aria-disabled={pending || input.trim().length === 0}
            className={
              pending || input.trim().length === 0
                ? "text-[10px] font-bold uppercase px-3 py-1 border border-border-subtle text-text-subtle cursor-not-allowed"
                : "text-[10px] font-bold uppercase px-3 py-1 bg-accent text-text-on-accent hover:opacity-90 transition-opacity"
            }
          >
            {pending ? "…" : mode === "recall" ? "Recall" : "Ask"}
          </button>
        </div>
      </form>

      {errored ? (
        <div className="px-4 py-6 text-[11px] font-mono text-danger">
          {mode === "recall" ? "Recall failed." : "Failed to generate an answer."}
        </div>
      ) : pending ? (
        <div className="text-[11px] font-mono text-text-muted px-1">
          {mode === "recall" ? "Recalling across all projects…" : "Generating an answer… (may take a few seconds)"}
        </div>
      ) : mode === "recall" ? (
        recall.isSuccess && notes.length === 0 ? (
          <div className="px-4 py-6 text-center text-[11px] font-mono text-text-subtle">
            No related notes found.
          </div>
        ) : (
          <div className="border border-border-main divide-y divide-border-subtle">
            {notes.map((n) => (
              <RecallCard key={`${n.projectPath}:${n.slug}`} note={n} slug={slugByPath.get(n.projectPath)} />
            ))}
          </div>
        )
      ) : (
        answer && <AnswerCard answer={answer.answer} sources={answer.sources} />
      )}
    </div>
  );
}

function RecallCard({ note, slug }: { note: RecalledNote; slug?: string }) {
  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-text-main truncate max-w-[320px]">{note.title}</span>
        <span className="text-[10px] font-mono text-text-subtle">{note.projectName}</span>
      </div>
      <p className="text-[11px] font-mono text-text-muted mt-1 break-words leading-relaxed line-clamp-3">
        <NoteText content={note.content} />
      </p>
    </>
  );
  const cls = "block px-3 py-2 bg-bg-primary hover:bg-bg-hover transition-colors";
  return slug ? (
    <Link to="/projects/$slug" params={{ slug }} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function AnswerCard({
  answer,
  sources,
}: {
  answer: string;
  sources: { tag: string; sessionId: string; ts: number; snippet: string }[];
}) {
  return (
    <div className="space-y-3">
      <div className="border border-border-main bg-bg-primary px-3 py-2">
        <pre className="text-[11px] font-mono text-text-main whitespace-pre-wrap leading-relaxed break-words">
          {answer}
        </pre>
      </div>
      {sources.length > 0 && (
        <div className="border border-border-main divide-y divide-border-subtle">
          <div className="px-3 py-1 bg-bg-secondary text-[9px] font-bold uppercase tracking-widest text-text-muted">
            Sources
          </div>
          {sources.map((s) => (
            <Link
              key={s.tag}
              to="/watching/sessions/$sessionId"
              params={{ sessionId: s.sessionId }}
              className="block px-3 py-1.5 bg-bg-primary hover:bg-bg-hover transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-bold uppercase px-1 py-0.5 border border-border-main text-text-muted">
                  {s.tag}
                </span>
                <span className="ml-auto text-[10px] font-mono text-text-subtle">
                  {dayjs(s.ts).fromNow()}
                </span>
              </div>
              <p className="text-[11px] font-mono text-text-muted mt-1 break-words line-clamp-2">
                {s.snippet}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
