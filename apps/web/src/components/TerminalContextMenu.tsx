import { useEffect, useRef } from "react";

export type TerminalMenuAction = "close" | "close-others" | "close-all";

interface TerminalContextMenuProps {
  x: number;
  y: number;
  /** Whether at least one *other* tab exists — disables Close others. */
  hasSiblings: boolean;
  onAction: (action: TerminalMenuAction) => void;
  onDismiss: () => void;
}

/**
 * Right-click popover for a tab. Closes on outside-click or Escape.
 * Position is fixed (in viewport), clamped to stay on-screen by the
 * caller before construction (see `clampMenuPosition`).
 */
export function TerminalContextMenu({
  x,
  y,
  hasSiblings,
  onAction,
  onDismiss,
}: TerminalContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onDismiss]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ position: "fixed", left: x, top: y, zIndex: 50 }}
      className="min-w-[160px] bg-bg-elevated border border-border-main shadow-lg py-1"
    >
      <Item label="Close tab" onClick={() => onAction("close")} />
      <Item
        label="Close others"
        onClick={() => onAction("close-others")}
        disabled={!hasSiblings}
      />
      <Item label="Close all" onClick={() => onAction("close-all")} />
    </div>
  );
}

function Item({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="w-full text-left px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-text-main hover:bg-bg-hover transition-colors disabled:text-text-subtle disabled:cursor-not-allowed disabled:hover:bg-transparent"
    >
      {label}
    </button>
  );
}

/**
 * Clamp a desired (x, y) so the menu stays in the viewport. Caller can
 * hand any pointer coordinates; this nudges them inward if needed.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  width: number = 180,
  height: number = 96,
): { x: number; y: number } {
  if (typeof window === "undefined") return { x, y };
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    x: Math.max(0, Math.min(x, w - width - 4)),
    y: Math.max(0, Math.min(y, h - height - 4)),
  };
}
