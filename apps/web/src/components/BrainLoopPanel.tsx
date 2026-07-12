import { RefreshCw } from "lucide-react";
import { useAutoWikiStatus } from "@/hooks/useProjectWiki";
import dayjs from "@/lib/dayjs";

/**
 * Self-improving loop status — surfaces the otherwise-invisible (env-gated)
 * auto-wiki scheduler: armed or not, cadence, and which projects are queued for
 * an auto-update (or, when off, which are stale and would be folded if armed).
 */
export function BrainLoopPanel() {
  const { data } = useAutoWikiStatus();
  if (!data) return null;
  const { config, candidates } = data;

  return (
    <div className="border border-border-main bg-bg-primary">
      <div className="bg-bg-secondary border-b border-border-main px-3 py-1.5 flex items-center gap-2">
        <RefreshCw size={11} className="text-text-muted" />
        <span className="text-[11px] font-bold uppercase text-text-main">Self-improving Loop</span>
        <span className="ml-auto text-[10px] font-mono">
          {config.enabled ? (
            <span className="text-success">On · every {Math.round(config.intervalMs / 60000)}min</span>
          ) : (
            <span className="text-text-subtle">Off · enable with HAETAE_WIKI_AUTO=true</span>
          )}
        </span>
      </div>
      <div className="p-2 space-y-px">
        <div className="px-1 py-0.5 text-[10px] font-mono text-text-muted">
          {candidates.length === 0
            ? config.enabled
              ? "Nothing queued — every wiki is current"
              : "No candidates"
            : `${config.enabled ? "Queued" : "Stale (would refresh if enabled)"} · ${candidates.length}`}
        </div>
        {candidates.slice(0, 6).map((c) => {
          const name = c.projectPath.split("/").filter(Boolean).pop() ?? c.projectPath;
          return (
            <div
              key={c.projectPath}
              className="flex justify-between items-center px-1 py-0.5 text-[10px] font-mono"
              title={`${c.projectPath} — last synthesized ${dayjs(c.generatedAt).fromNow()}`}
            >
              <span className="uppercase text-text-main truncate">{name}</span>
              <span className="text-warning shrink-0">{c.pendingMessages} pending</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
