/**
 * Standard "no data" placeholder for usage charts. Centralised so every
 * chart shows the same wording / visual weight when its data array is
 * empty — the user shouldn't see "loading" or a blank box, just a clear
 * sentence about what's missing.
 */
interface ChartEmptyStateProps {
  /** Short message — usually one line. */
  message: string;
  /** Optional sub-line (e.g. "run claude in a project to start tracking"). */
  hint?: string;
}

export function ChartEmptyState({ message, hint }: ChartEmptyStateProps) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center text-center px-4 py-8">
      <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
        {message}
      </div>
      {hint && (
        <div className="text-[10px] font-mono text-text-subtle mt-1">{hint}</div>
      )}
    </div>
  );
}
