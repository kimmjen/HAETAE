import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import dayjs from "@/lib/dayjs";
import { ArrowLeft, Bot, ChevronRight, FileWarning, GitBranch, User } from "lucide-react";
import {
  useSessionDetail,
  useActiveSessions,
  type SessionDetail,
  type SessionMessage,
  type SessionMessagePart,
} from "@/hooks/useUsageLocal";
import { useSessionGraph, type GraphNode } from "@/hooks/useProjectGraph";
import { GraphCanvas, LegendDot, LegendSquare } from "@/components/GraphCanvas";
import { formatTokens, formatTokensCompact } from "@/lib/format/tokens";
import { useMoney } from "@/lib/currency";

interface Props {
  sessionId: string;
}

/**
 * Drill-down for one Claude Code session. Reads the underlying JSONL
 * via `/api/usage/local/sessions/:id` so we can show actual message
 * content (not just token totals stored in `usage_events`). Server
 * caps payload size — anything past that flips a `truncated` flag.
 */
export function SessionDetailView({ sessionId }: Props) {
  const detail = useSessionDetail(sessionId);
  const activeQ = useActiveSessions();
  const isLive = (activeQ.data?.data.sessionIds ?? []).includes(sessionId);

  if (detail.isPending) {
    return <Shell><Loading /></Shell>;
  }
  if (detail.isError) {
    return (
      <Shell>
        <NotFound message={detail.error?.message ?? "Failed to load the session"} />
      </Shell>
    );
  }
  const data = detail.data?.data;
  if (!data) {
    return <Shell><NotFound message="Session not found" /></Shell>;
  }

  return (
    <Shell>
      <Header data={data} isLive={isLive} />
      <SessionLocalGraph sessionId={sessionId} />
      <Timeline messages={data.messages} />
      {data.truncated && (
        <div className="border-t border-border-subtle bg-bg-secondary px-4 py-2 text-[11px] font-mono text-text-muted flex items-center gap-2">
          <FileWarning size={12} />
          This session is long, so some messages were truncated. Open the jsonl file directly to see everything.
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-border-main bg-bg-primary">
      <Crumb />
      {children}
    </div>
  );
}

function Crumb() {
  return (
    <div className="bg-bg-secondary border-b border-border-main px-4 py-2 flex items-center gap-2 text-[11px] font-bold uppercase">
      <Link
        to="/watching/overview"
        className="inline-flex items-center gap-1 text-text-muted hover:text-text-main transition-colors"
      >
        <ArrowLeft size={12} />
        Overview
      </Link>
      <ChevronRight size={12} className="text-text-subtle" />
      <span className="text-text-main">Session</span>
    </div>
  );
}

/**
 * Local graph around this session — the files it touched and the other sessions
 * that share them. Collapsed by default; the data is only fetched when opened.
 */
function SessionLocalGraph({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const q = useSessionGraph(open ? sessionId : null);
  const data = q.data;
  const sessions = data?.nodes.filter((n) => n.type === "session").length ?? 0;
  const files = data?.nodes.filter((n) => n.type === "topic").length ?? 0;

  return (
    <div className="border-b border-border-main">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase text-text-muted hover:text-text-main transition-colors"
      >
        <GitBranch size={12} />
        Relation Graph {open ? "▾" : "▸"}
        <span className="font-mono normal-case text-text-subtle">— sessions linked by the files this one touched</span>
      </button>
      {open && (
        <div className="h-72 border-t border-border-main">
          <GraphCanvas
            nodes={data?.nodes ?? []}
            edges={data?.edges ?? []}
            isLoading={q.isLoading}
            emptyLabel="No files/sessions to link"
            countsLabel={`${sessions} sessions · ${files} files`}
            clusterColorType="topic"
            legend={
              <>
                <LegendDot color="#7c3aed" label="Opus" />
                <LegendDot color="#2563eb" label="Sonnet" />
                <LegendDot color="#0891b2" label="Haiku" />
                <LegendSquare color="#16a34a" label="File" />
                <span className="text-[8px] font-mono text-text-subtle ml-auto">click another session to jump</span>
              </>
            }
            onNodeClick={(node: GraphNode) => {
              if (node.type === "session" && node.sessionId && node.sessionId !== sessionId) {
                navigate({ to: "/watching/sessions/$sessionId", params: { sessionId: node.sessionId } });
              }
            }}
            renderTooltip={(node: GraphNode) => (
              <>
                <div className="font-bold text-[10px] truncate">{node.label}</div>
                {node.type === "session" && (
                  <div className="text-text-muted mt-0.5">
                    {node.sessionId === sessionId ? "This session" : "Click to jump"}
                  </div>
                )}
                {node.type === "topic" && <div className="text-text-muted mt-0.5">File/module</div>}
              </>
            )}
          />
        </div>
      )}
    </div>
  );
}

function Header({ data, isLive }: { data: SessionDetail; isLive: boolean }) {
  const money = useMoney();
  return (
    <div className="border-b border-border-main bg-bg-primary px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="font-mono text-[12px] font-bold text-text-main truncate">
            {data.sessionId}
          </div>
          {isLive && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-bold uppercase text-green-500 border border-green-500/40 bg-green-500/10 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
        </div>
        <div className="font-mono text-[10px] text-text-muted truncate">
          {data.projectPath}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Stat
          label="Messages"
          value={formatTokensCompact(data.totals.messages)}
          precise={data.totals.messages.toLocaleString("en-US")}
        />
        <Stat
          label="Assistant"
          value={formatTokensCompact(data.totals.assistantMessages)}
          precise={data.totals.assistantMessages.toLocaleString("en-US")}
        />
        <Stat
          label="Input"
          value={formatTokensCompact(data.totals.inputTokens)}
          precise={formatTokens(data.totals.inputTokens)}
        />
        <Stat
          label="Output"
          value={formatTokensCompact(data.totals.outputTokens)}
          precise={formatTokens(data.totals.outputTokens)}
        />
        <Stat
          label="Cost"
          value={money.formatCompact(data.totals.costUsd)}
          precise={money.format(data.totals.costUsd)}
          accent
        />
      </div>
      {data.meta && <MetaPanel meta={data.meta} />}
    </div>
  );
}

function MetaPanel({ meta }: { meta: NonNullable<SessionDetail["meta"]> }) {
  const topTools = Object.entries(meta.toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const totalTools = Object.values(meta.toolCounts).reduce(
    (s, n) => s + n,
    0,
  );
  const flags: Array<{ label: string; on: boolean }> = [
    { label: "task agent", on: meta.usesTaskAgent },
    { label: "mcp", on: meta.usesMcp },
    { label: "web search", on: meta.usesWebSearch },
    { label: "web fetch", on: meta.usesWebFetch },
  ].filter((f) => f.on);

  return (
    <div className="border border-border-subtle bg-bg-secondary p-3 space-y-2">
      <div className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
        Session Meta · per Claude Code
      </div>
      {meta.firstPrompt && (
        <div className="font-mono text-[11px] text-text-main">
          <span className="text-text-muted">first prompt · </span>
          <span className="italic">
            {meta.firstPrompt.length > 160
              ? `${meta.firstPrompt.slice(0, 160)}…`
              : meta.firstPrompt}
          </span>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 font-mono text-[10px]">
        <MetaCell label="Duration" value={`${meta.durationMinutes}m`} />
        <MetaCell
          label="User msgs"
          value={meta.userMessageCount.toLocaleString("en-US")}
        />
        <MetaCell
          label="Tool calls"
          value={totalTools.toLocaleString("en-US")}
        />
        <MetaCell label="Interruptions" value={String(meta.userInterruptions)} />
        <MetaCell label="Git commits" value={String(meta.gitCommits)} />
        <MetaCell label="Git pushes" value={String(meta.gitPushes)} />
        <MetaCell label="Lines +/-" value={`${meta.linesAdded}/-${meta.linesRemoved}`} />
        <MetaCell label="Files mod" value={String(meta.filesModified)} />
      </div>
      {topTools.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
          <span className="text-text-muted uppercase tracking-widest text-[9px]">
            top tools
          </span>
          {topTools.map(([name, count]) => (
            <span
              key={name}
              className="border border-border-subtle bg-bg-primary px-1.5 py-0.5 text-text-main"
            >
              {name} <span className="text-text-muted">×{count}</span>
            </span>
          ))}
        </div>
      )}
      {flags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
          <span className="text-text-muted uppercase tracking-widest text-[9px]">
            features
          </span>
          {flags.map((f) => (
            <span
              key={f.label}
              className="border border-accent bg-accent text-text-on-accent px-1.5 py-0.5 uppercase"
            >
              {f.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border-subtle bg-bg-primary px-2 py-1">
      <div className="text-[9px] font-bold uppercase tracking-widest text-text-muted">
        {label}
      </div>
      <div className="text-[12px] font-bold text-text-main tabular-nums">
        {value}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  precise,
}: {
  label: string;
  value: string;
  accent?: boolean;
  precise?: string;
}) {
  return (
    <div className="border border-border-subtle bg-bg-secondary px-2 py-1.5 min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-widest text-text-muted truncate">
        {label}
      </div>
      <div
        title={precise}
        className={
          accent
            ? "text-[14px] font-black text-accent tabular-nums truncate"
            : "text-[14px] font-black text-text-main tabular-nums truncate"
        }
      >
        {value}
      </div>
    </div>
  );
}

function Timeline({ messages }: { messages: SessionMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="px-4 py-8 text-[11px] font-mono text-text-subtle">
        This session has no messages.
      </div>
    );
  }
  return (
    <div className="divide-y divide-border-subtle">
      {messages.map((m, i) => (
        <MessageRow key={`${m.uuid || "m"}-${i}`} message={m} />
      ))}
    </div>
  );
}

function MessageRow({ message }: { message: SessionMessage }) {
  const money = useMoney();
  const isUser = message.role === "user";
  const stamp = message.ts > 0 ? dayjs(message.ts).format("YYYY-MM-DD HH:mm:ss") : "—";

  return (
    <div className={isUser ? "bg-bg-primary px-4 py-3" : "bg-bg-secondary px-4 py-3"}>
      <div className="flex items-center gap-2 mb-2">
        <div
          className={
            isUser
              ? "w-5 h-5 inline-flex items-center justify-center bg-bg-secondary border border-border-subtle"
              : "w-5 h-5 inline-flex items-center justify-center bg-accent text-text-on-accent"
          }
        >
          {isUser ? <User size={12} /> : <Bot size={12} />}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
          {isUser ? "User" : "Assistant"}
        </span>
        <span className="text-[10px] font-mono text-text-subtle ml-auto">
          {stamp}
        </span>
        {message.usage && (
          <span className="text-[10px] font-mono text-text-muted">
            {message.usage.model.replace(/^claude-/, "")} ·{" "}
            {formatTokensCompact(
              message.usage.inputTokens + message.usage.outputTokens,
            )}{" "}
            · {money.format(message.usage.costUsd)}
          </span>
        )}
      </div>
      <div className="space-y-2">
        {message.parts.length === 0 && (
          <div className="text-[11px] font-mono text-text-subtle">(empty)</div>
        )}
        {message.parts.map((p, i) => (
          <PartView key={i} part={p} />
        ))}
      </div>
    </div>
  );
}

function PartView({ part }: { part: SessionMessagePart }) {
  if (part.kind === "text") {
    return (
      <pre className="whitespace-pre-wrap font-mono text-[11px] text-text-main leading-relaxed">
        {part.text}
        {part.truncated && (
          <span className="text-text-subtle"> [truncated]</span>
        )}
      </pre>
    );
  }
  if (part.kind === "thinking") {
    return (
      <details className="border-l-2 border-border-subtle pl-2">
        <summary className="text-[10px] font-bold uppercase text-text-muted cursor-pointer">
          thinking
        </summary>
        <pre className="whitespace-pre-wrap font-mono text-[11px] text-text-subtle mt-1">
          {part.text}
          {part.truncated && (
            <span className="text-text-subtle"> [truncated]</span>
          )}
        </pre>
      </details>
    );
  }
  if (part.kind === "tool_use") {
    return (
      <details className="border border-border-subtle bg-bg-primary">
        <summary className="px-2 py-1 text-[10px] font-bold uppercase text-accent cursor-pointer">
          tool_use · {part.toolName}
        </summary>
        <pre className="px-2 py-1 whitespace-pre-wrap font-mono text-[10px] text-text-muted overflow-x-auto">
          {part.toolInputPreview}
          {part.truncated && (
            <span className="text-text-subtle"> [truncated]</span>
          )}
        </pre>
      </details>
    );
  }
  // tool_result
  return (
    <details className="border border-border-subtle bg-bg-primary">
      <summary className="px-2 py-1 text-[10px] font-bold uppercase text-text-muted cursor-pointer">
        tool_result
      </summary>
      <pre className="px-2 py-1 whitespace-pre-wrap font-mono text-[10px] text-text-subtle overflow-x-auto">
        {part.text}
        {part.truncated && (
          <span className="text-text-subtle"> [truncated]</span>
        )}
      </pre>
    </details>
  );
}

function Loading() {
  return (
    <div className="px-4 py-8 text-[11px] font-mono text-text-muted">
      Reading the session jsonl…
    </div>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <div className="px-4 py-8 text-[11px] font-mono text-danger">
      {message}
    </div>
  );
}
