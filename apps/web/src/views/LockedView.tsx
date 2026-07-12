import { ExternalLink } from "lucide-react";

export function LockedView() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center border border-dashed border-border-main bg-bg-primary">
      <ExternalLink size={32} className="text-text-subtle mb-4" />
      <h2 className="text-sm font-black uppercase mb-1 text-text-main">Module Locked</h2>
      <p className="text-[11px] font-mono text-text-muted max-w-xs uppercase">
        Developer credentials required for access to early-alpha features.
      </p>
    </div>
  );
}
