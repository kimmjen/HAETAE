/**
 * Shared chrome for the usage/analytics views (LocalUsage / ApiCost /
 * Unified) — these three grew identical copies of the period toggle, KPI
 * card, and section label (#392). One source, same look.
 */

export const PERIODS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
] as const;

export function PeriodToggle({
  days,
  onChange,
}: {
  days: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="inline-flex border border-border-main">
      {PERIODS.map((p) => {
        const active = p.days === days;
        return (
          <button
            key={p.days}
            type="button"
            onClick={() => onChange(p.days)}
            className={
              active
                ? "px-2 py-1 text-[10px] font-bold uppercase bg-accent text-text-on-accent"
                : "px-2 py-1 text-[10px] font-bold uppercase bg-bg-primary text-text-main hover:bg-bg-hover transition-colors"
            }
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export function Kpi({
  label,
  value,
  accent,
  tone = "neutral",
  precise,
}: {
  label: string;
  value: string;
  accent?: boolean;
  /** "warn" overrides the value color (e.g. cost overrun on Unified). */
  tone?: "neutral" | "warn";
  /** Full-precision value surfaced via `title=` (hover / long-press) so
      the compact card display doesn't hide exact numbers. */
  precise?: string;
}) {
  const valueClass =
    tone === "warn" ? "text-warning" : accent ? "text-accent" : "text-text-main";
  return (
    <div className="border border-border-subtle bg-bg-secondary p-3 min-w-0">
      <div className="text-[9px] font-bold uppercase tracking-widest text-text-muted truncate">
        {label}
      </div>
      <div
        title={precise}
        className={`text-[18px] font-black ${valueClass} mt-1 tabular-nums truncate`}
      >
        {value}
      </div>
    </div>
  );
}

export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2 ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
