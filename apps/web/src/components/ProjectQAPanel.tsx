import { useState } from "react";
import { Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { Sparkles, RefreshCw, MessageCircleQuestion } from "lucide-react";
import { useAskBrain, type BrainSource } from "@/hooks/useAskBrain";
import dayjs from "@/lib/dayjs";

/**
 * Ask the project's second brain a question. Answers cite their sources
 * ([W] = wiki, [S#] = conversation), each clickable to the session detail —
 * the anti-hallucination guarantee: every claim is verifiable against a source.
 */
export function ProjectQAPanel({ projectPath }: { projectPath: string }) {
  const [question, setQuestion] = useState("");
  const ask = useAskBrain();
  const result = ask.data;

  function submit() {
    const q = question.trim();
    // Sonnet for interactive Q&A — responsiveness matters more than the last
    // bit of quality here (the wiki/ontology batch jobs use Opus).
    if (q && !ask.isPending) ask.mutate({ projectPath, question: q, model: "claude-sonnet-4-6" });
  }

  return (
    <div className="border border-border-main bg-bg-secondary">
      <div className="px-3 py-2 border-b border-border-main flex items-center gap-2">
        <MessageCircleQuestion size={13} className="text-text-muted" />
        <span className="text-[11px] font-bold uppercase text-text-main">Ask</span>
        <span className="text-[9px] font-mono text-text-subtle">Ask this project's knowledge — answers cite their sources</span>
      </div>

      <div className="p-3 flex gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="e.g. Why was the watermark introduced, and how does it work?"
          className="flex-1 bg-bg-primary border border-border-main text-[11px] font-mono text-text-main px-2 py-1.5 focus:outline-none focus:border-accent"
        />
        <button
          type="button"
          disabled={ask.isPending || !question.trim()}
          onClick={submit}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold uppercase border border-accent bg-accent text-text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {ask.isPending ? <RefreshCw size={11} className="animate-spin" /> : <Sparkles size={11} />}
          Ask
        </button>
      </div>

      {ask.isError && (
        <div className="px-3 pb-3 text-[10px] font-mono text-danger">
          {ask.error instanceof Error ? ask.error.message : "Question failed"}
        </div>
      )}

      {ask.isPending && (
        <div className="px-3 pb-3 text-[10px] font-mono text-text-muted">Searching knowledge + generating an answer…</div>
      )}

      {result && !ask.isPending && (
        <div className="px-3 pb-3 space-y-3">
          <div className="border-t border-border-main pt-3">
            <Answer markdown={result.answer} />
          </div>
          {result.sources.length > 0 && (
            <div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-text-muted mb-1">Sources</div>
              <div className="space-y-1">
                {result.sources.map((s) => (
                  <SourceChip key={s.tag} source={s} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SourceChip({ source }: { source: BrainSource }) {
  return (
    <Link
      to="/watching/sessions/$sessionId"
      params={{ sessionId: source.sessionId }}
      className="flex items-start gap-2 text-[9px] font-mono bg-bg-primary border border-border-main px-2 py-1 hover:bg-bg-hover transition-colors"
    >
      <span className="font-bold text-accent shrink-0">[{source.tag}]</span>
      <span className="text-text-subtle shrink-0">{dayjs(source.ts).format("YYYY-MM-DD")}</span>
      <span className="text-text-muted truncate">{source.snippet.slice(0, 90)}</span>
    </Link>
  );
}

function Answer({ markdown }: { markdown: string }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="text-[11px] font-mono text-text-main leading-relaxed mb-2">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
        li: ({ children }) => <li className="text-[11px] font-mono text-text-main leading-relaxed">{children}</li>,
        code: ({ children }) => <code className="bg-bg-primary px-1 text-[10px] font-mono text-text-main">{children}</code>,
        strong: ({ children }) => <strong className="font-bold text-text-main">{children}</strong>,
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}
