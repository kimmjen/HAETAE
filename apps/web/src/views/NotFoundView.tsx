import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, FileQuestion } from "lucide-react";

/**
 * Catch-all 404. Shown when the router falls through every registered
 * route (typo in URL, deleted page, copy-paste from external link).
 *
 * Bloomberg-tone — same Section header / monospace body / accent button
 * pattern used everywhere else, so the page doesn't look like a generic
 * web 404.
 */
export function NotFoundView() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="border border-border-main bg-bg-primary">
      <div className="bg-bg-secondary border-b border-border-main px-4 py-2 text-[11px] font-bold uppercase text-text-main">
        Not Found
      </div>
      <div className="p-8 max-w-2xl space-y-4">
        <div className="flex items-start gap-3">
          <FileQuestion size={20} className="text-text-muted shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="text-[14px] font-bold text-text-main">
              Path not found
            </div>
            <div className="text-[11px] font-mono text-text-muted break-all">
              {path}
            </div>
          </div>
        </div>
        <div className="text-[11px] font-mono text-text-subtle leading-relaxed">
          It's either a typo or a page that moved/was removed. Navigate again from the sidebar.
        </div>
        <Link
          to="/watching/overview"
          className="inline-flex items-center gap-1 px-3 py-1 text-[10px] font-bold uppercase tracking-wider border border-border-main bg-accent text-text-on-accent hover:bg-accent-hover transition-colors"
        >
          <ArrowLeft size={12} />
          <span>Back to Overview</span>
        </Link>
      </div>
    </div>
  );
}
