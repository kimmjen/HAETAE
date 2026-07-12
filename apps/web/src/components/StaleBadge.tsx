import { RefreshCw } from "lucide-react";

/**
 * Shown on a derived layer (notes / ontology / eval) when the wiki it was built
 * from has since been regenerated — clicking re-runs the derivation.
 */
export function StaleBadge({ onRegenerate, pending }: { onRegenerate: () => void; pending?: boolean }) {
  return (
    <button
      type="button"
      onClick={onRegenerate}
      disabled={pending}
      title="The wiki was refreshed, so this result is stale — regenerate"
      className="flex items-center gap-1 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider border border-warning text-warning hover:bg-warning hover:text-text-on-accent transition-colors disabled:cursor-wait"
    >
      <RefreshCw size={9} className={pending ? "animate-spin" : ""} />
      Wiki updated · regenerate
    </button>
  );
}
