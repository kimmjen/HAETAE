import { cn } from "@/lib/utils";

const LABELS = ["Basics", "Options", "Body"] as const;

export function Stepper({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-bg-secondary border-b border-border-main">
      {LABELS.map((label, idx) => {
        const active = idx === current;
        const done = idx < current;
        return (
          <div key={label} className="flex items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 px-2 py-1 text-[10px] font-bold uppercase tracking-widest border",
                active && "bg-accent text-text-on-accent border-accent",
                done && "border-accent text-accent",
                !active && !done && "border-border-subtle text-text-subtle",
              )}
            >
              <span className="font-mono">{idx + 1}/3</span>
              <span>{label}</span>
            </span>
            {idx < LABELS.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "h-px w-6",
                  done ? "bg-accent" : "bg-border-subtle",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
