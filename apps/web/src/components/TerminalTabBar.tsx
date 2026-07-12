import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TerminalSocketStatus } from "@/hooks/useTerminalSocket";

export interface TerminalTabDescriptor {
  id: string;
  /** Display label — basename of cwd or generated. */
  label: string;
  /** Full cwd, surfaced in tooltip + below the active tab so the user can
   *  tell apart tabs whose basenames collide (e.g. two \"src\"). */
  cwd?: string;
  /** WS state for the dot color. */
  status: TerminalSocketStatus;
}

interface TerminalTabBarProps {
  tabs: TerminalTabDescriptor[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onAdd: () => void;
  onContextMenu: (id: string, x: number, y: number) => void;
}

export function TerminalTabBar({
  tabs,
  activeId,
  onSelect,
  onClose,
  onAdd,
  onContextMenu,
}: TerminalTabBarProps) {
  return (
    <div
      role="tablist"
      aria-label="Terminal tabs"
      className="flex items-stretch bg-bg-secondary border-b border-border-main min-h-8"
    >
      <div className="flex-1 flex items-stretch overflow-x-auto">
        {tabs.map((tab) => (
          <Tab
            key={tab.id}
            tab={tab}
            active={tab.id === activeId}
            onSelect={() => onSelect(tab.id)}
            onClose={() => onClose(tab.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              onContextMenu(tab.id, e.clientX, e.clientY);
            }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        aria-label="New terminal tab"
        title="New tab"
        className="px-3 flex items-center justify-center text-text-muted hover:text-text-main hover:bg-bg-hover border-l border-border-main transition-colors"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

interface TabProps {
  tab: TerminalTabDescriptor;
  active: boolean;
  onSelect: () => void;
  onClose: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function Tab({ tab, active, onSelect, onClose, onContextMenu }: TabProps) {
  return (
    <div
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      onContextMenu={onContextMenu}
      title={tab.cwd ? `${tab.label} · ${tab.cwd}` : tab.label}
      className={cn(
        "group flex items-center gap-2 pl-3 pr-1.5 border-r border-border-main cursor-pointer transition-colors",
        active
          ? "bg-bg-primary text-text-main"
          : "text-text-muted hover:bg-bg-hover hover:text-text-main",
      )}
    >
      <StatusDot status={tab.status} />
      <div className="flex flex-col min-w-0">
        <span className="text-[11px] font-bold uppercase tracking-wider truncate max-w-[200px]">
          {tab.label}
        </span>
        {active && tab.cwd && (
          <span className="text-[9px] font-mono text-text-subtle truncate max-w-[200px] -mt-0.5">
            {tab.cwd}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label={`Close ${tab.label}`}
        className="ml-1 p-0.5 text-text-subtle hover:text-text-main hover:bg-bg-hover transition-colors opacity-60 group-hover:opacity-100"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function StatusDot({ status }: { status: TerminalSocketStatus }) {
  const map: Record<TerminalSocketStatus, { className: string; label: string }> = {
    connecting: { className: "bg-warning", label: "Connecting" },
    open: { className: "bg-success", label: "Connected" },
    closed: { className: "bg-text-subtle", label: "Closed" },
    error: { className: "bg-danger", label: "Error" },
  };
  const { className, label } = map[status];
  return (
    <span
      className={`w-2 h-2 rounded-full shrink-0 ${className}`}
      aria-label={label}
      title={label}
    />
  );
}
