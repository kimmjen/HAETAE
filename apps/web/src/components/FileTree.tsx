import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RulesEntry } from "@/hooks/useRulesList";

interface FileTreeProps {
  entries: RulesEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  emptyMessage?: string;
  emptyAction?: ReactNode;
}

export function FileTree({
  entries,
  selectedPath,
  onSelect,
  emptyMessage = "No rules registered yet.",
  emptyAction,
}: FileTreeProps) {
  if (entries.length === 0) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-[11px] font-mono text-text-muted leading-relaxed">
          {emptyMessage}
        </p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className="p-1 space-y-px">
      {entries.map((entry) => (
        <TreeNode
          key={entry.path}
          entry={entry}
          depth={0}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

interface TreeNodeProps {
  entry: RulesEntry;
  depth: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

const STEP = 16;

function TreeNode({ entry, depth, selectedPath, onSelect }: TreeNodeProps) {
  const indentPx = depth * STEP + 8;

  if (entry.type === "directory") {
    return (
      <>
        <div
          className="flex items-center gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-text-muted"
          style={{ paddingLeft: indentPx }}
        >
          <ChevronDown size={10} className="text-text-subtle" />
          <span>{entry.name}/</span>
        </div>
        {entry.children?.map((child) => (
          <TreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
      </>
    );
  }

  const active = selectedPath === entry.path;
  return (
    <button
      type="button"
      onClick={() => onSelect(entry.path)}
      style={{ paddingLeft: indentPx }}
      className={cn(
        "w-full text-left pr-2 py-1 text-[11px] font-bold uppercase border border-transparent transition-colors",
        active
          ? "bg-accent text-text-on-accent border-accent"
          : "text-text-main hover:bg-bg-hover",
      )}
    >
      {entry.name}
    </button>
  );
}
