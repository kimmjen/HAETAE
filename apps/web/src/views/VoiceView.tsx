import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Fingerprint, RefreshCw, FileCode, AlertTriangle } from "lucide-react";
import { useVoice, useGenerateVoice, useInjectVoice } from "@/hooks/useVoice";
import { MODELS, shortModel } from "@/lib/models";
import dayjs from "@/lib/dayjs";

/**
 * The personal "voice/taste" layer — a cross-project profile of the user
 * synthesized from their own messages. Optionally injected into the global
 * ~/.claude/CLAUDE.md so every Claude Code session adopts their voice.
 */
export function VoiceView() {
  const voiceQ = useVoice();
  const generate = useGenerateVoice();
  const inject = useInjectVoice();
  const [model, setModel] = useState("claude-opus-4-7");

  const profile = voiceQ.data?.profile ?? null;

  return (
    <div className="space-y-3">
      <div className="border border-border-main bg-bg-secondary px-3 py-2 flex flex-wrap items-center gap-2">
        <Fingerprint size={14} className="text-text-muted" />
        <span className="text-[12px] font-bold uppercase text-text-main">Voice</span>
        <span className="text-[10px] font-mono text-text-muted">
          Voice/taste/work-preference extracted from my own conversations — personal context so the AI works the way I do
        </span>
        {profile && (
          <span className="text-[9px] font-mono text-text-subtle">
            {profile.messagesCovered} msgs · {dayjs(profile.generatedAt).fromNow()} ·{" "}
            {shortModel(profile.model)}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={generate.isPending}
            className="bg-bg-primary border border-border-main text-[9px] font-mono text-text-main px-1.5 py-0.5 focus:outline-none disabled:opacity-50"
          >
            {MODELS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={generate.isPending}
            onClick={() => generate.mutate({ model })}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-bold uppercase border border-accent bg-accent text-text-on-accent hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            <RefreshCw size={10} className={generate.isPending ? "animate-spin" : ""} />
            {profile ? "Refresh" : "Generate"}
          </button>
        </div>
      </div>

      {generate.isError && (
        <div className="border border-border-main bg-bg-secondary px-3 py-2 text-[10px] font-mono text-danger">
          {generate.error instanceof Error ? generate.error.message : "Generation failed"}
        </div>
      )}
      {generate.isPending && (
        <div className="border border-border-main bg-bg-secondary px-3 py-6 text-center text-[10px] font-mono text-text-muted">
          <RefreshCw size={14} className="inline mr-2 animate-spin" />Extracting voice from my messages…
        </div>
      )}

      {!generate.isPending && !profile && (
        <div className="border border-border-main bg-bg-secondary px-3 py-8 flex flex-col items-center gap-3 text-center">
          <Fingerprint size={24} className="text-text-subtle" />
          <div className="text-[11px] font-bold text-text-main">No profile yet</div>
          <div className="text-[10px] font-mono text-text-muted max-w-md leading-relaxed">
            Extracts communication style, work preferences, and judgment patterns from my messages across every project.
            In an era of model commoditization, personal context is the differentiator.
          </div>
        </div>
      )}

      {!generate.isPending && profile && (
        <>
          <div className="border border-border-main bg-bg-secondary p-4 overflow-auto max-h-[60vh]">
            <ProfileMarkdown content={profile.content} />
          </div>

          <div className="border border-border-main bg-bg-secondary px-3 py-2 flex items-center gap-2 flex-wrap">
            <AlertTriangle size={12} className="text-warning shrink-0" />
            <span className="text-[10px] font-mono text-text-muted">
              Injecting into the global <code>~/.claude/CLAUDE.md</code> makes every Claude Code session across every project start with this context.
            </span>
            <button
              type="button"
              disabled={inject.isPending}
              onClick={() => inject.mutate()}
              className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors disabled:opacity-50"
            >
              <FileCode size={11} />
              Inject into global CLAUDE.md
            </button>
          </div>
          {inject.isError && (
            <div className="px-3 text-[10px] font-mono text-danger">
              {inject.error instanceof Error ? inject.error.message : "Injection failed"}
            </div>
          )}
          {inject.data && (
            <div className="px-3 text-[10px] font-mono text-success">
              {inject.data.action === "created" ? "created" : "updated"} — {inject.data.path}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ProfileMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h1 className="text-[14px] font-black uppercase tracking-tight text-text-main mb-3 pb-1 border-b border-border-main">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-[12px] font-bold uppercase tracking-wide text-text-main mt-4 mb-2">{children}</h2>
        ),
        p: ({ children }) => <p className="text-[11px] font-mono text-text-main leading-relaxed mb-2">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
        li: ({ children }) => <li className="text-[11px] font-mono text-text-main leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-bold text-text-main">{children}</strong>,
        code: ({ children }) => <code className="bg-bg-primary px-1 text-[10px] font-mono text-text-main">{children}</code>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
