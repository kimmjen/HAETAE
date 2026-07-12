import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import {
  BarChart3,
  Command as CommandIcon,
  FileCode,
  FileText,
  Layers,
  LayoutDashboard,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Terminal,
  User,
  Zap,
} from "lucide-react";
import type { ReactNode } from "react";
import { useTheme } from "@/lib/theme";
import { useHotkey } from "@/hooks/useHotkey";
import { useXtermFocus } from "@/hooks/useXtermFocus";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { MIN_QUERY_LEN, useSearch } from "@/hooks/useSearch";
import { useCommandPalette } from "./context";

interface ActionItem {
  id: string;
  label: string;
  hint?: string;
  icon: ReactNode;
  run?: () => void;
  disabled?: boolean;
}

export function CommandPalette() {
  const { open, openPalette, closePalette } = useCommandPalette();
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const searchResults = useSearch(debouncedSearch);
  const showSearchGroup =
    debouncedSearch.trim().length >= MIN_QUERY_LEN && (searchResults.data ?? []).length > 0;

  // Cmd+K opens the palette globally — except while xterm has focus,
  // where the same combo clears the terminal (see TerminalTabsView).
  const xtermFocused = useXtermFocus();
  useHotkey("mod+k", openPalette, { enabled: !xtermFocused });

  const exec = (run?: () => void) => {
    closePalette();
    setSearch("");
    run?.();
  };

  const navigateActions: ActionItem[] = [
    { id: "nav.overview", label: "Watching / Overview", hint: "1", icon: <LayoutDashboard size={14} />, run: () => navigate({ to: "/watching/overview" }) },
    { id: "nav.local", label: "Watching / Local Usage", hint: "2", icon: <BarChart3 size={14} />, run: () => navigate({ to: "/watching/local" }) },
    { id: "nav.api", label: "Watching / API Cost", hint: "3", icon: <Zap size={14} />, run: () => navigate({ to: "/watching/api" }) },
    { id: "nav.unified", label: "Watching / Unified (Local vs API)", hint: "4", icon: <Layers size={14} />, run: () => navigate({ to: "/watching/unified" }) },
    { id: "nav.rules", label: "Guarding / Rules", icon: <ShieldCheck size={14} />, run: () => navigate({ to: "/guarding/rules" }) },
    { id: "nav.global-rules", label: "Guarding / Global Rules", icon: <FileCode size={14} />, run: () => navigate({ to: "/guarding/global-rules" }) },
    { id: "nav.skills", label: "Guarding / Skills", icon: <CommandIcon size={14} />, run: () => navigate({ to: "/guarding/skills" }) },
    { id: "nav.terminal", label: "Working / Terminal", icon: <Terminal size={14} />, run: () => navigate({ to: "/working/terminal" }) },
    { id: "nav.profile", label: "Operator / Profile", icon: <User size={14} />, run: () => navigate({ to: "/profile" }) },
    { id: "nav.settings", label: "System Settings", icon: <Settings size={14} />, run: () => navigate({ to: "/settings" }) },
  ];

  const themeActions: ActionItem[] = [
    {
      id: "theme.toggle",
      label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
      icon: theme === "dark" ? <Sun size={14} /> : <Moon size={14} />,
      run: toggleTheme,
    },
  ];

  const createActions: ActionItem[] = [
    {
      id: "create.skill",
      label: "Create new rule / skill…",
      icon: <FileCode size={14} />,
      run: () => navigate({ to: "/guarding/skills/new" }),
    },
  ];

  const comingSoonActions: ActionItem[] = [
    { id: "soon.sync", label: "Sync token data", hint: "Phase 4", icon: <Zap size={14} />, disabled: true },
  ];

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => (next ? openPalette() : closePalette())}
      label="Haetae command palette"
      shouldFilter
      overlayClassName="fixed inset-0 z-50 bg-bg-overlay backdrop-blur-sm"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[560px] max-w-[92vw] -translate-x-1/2 bg-bg-elevated border border-border-main shadow-lg"
    >
      {/* Radix Dialog 접근성 — cmdk 가 자체 Title/Description 을 렌더하지 않아
          screen reader 에 보이지 않게 직접 넣어준다. label prop 만으로는 부족함. */}
      <Dialog.Title className="sr-only">Command palette</Dialog.Title>
      <Dialog.Description className="sr-only">
        Type a command, navigate to a page, or search across files.
      </Dialog.Description>
      <div className="flex items-center gap-2 border-b border-border-main px-3 py-2 bg-bg-secondary">
        <Search size={14} className="text-text-muted" />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Type a command or search..."
          className="flex-1 bg-transparent text-[13px] font-mono text-text-main outline-none placeholder:text-text-subtle"
        />
        {searchResults.isFetching && debouncedSearch.length >= MIN_QUERY_LEN && (
          <span className="text-[9px] font-mono text-text-subtle uppercase tracking-wider">
            Searching…
          </span>
        )}
        <span className="text-[9px] font-mono text-text-subtle uppercase tracking-wider">
          ESC
        </span>
      </div>

      <Command.List className="max-h-[60vh] overflow-y-auto py-1">
        <Command.Empty className="py-6 text-center text-[11px] font-mono text-text-muted">
          No matching commands.
        </Command.Empty>

        {showSearchGroup && (
          <SearchResultsGroup
            query={debouncedSearch}
            results={searchResults.data ?? []}
            onSelect={(filePath) =>
              exec(() =>
                navigate({
                  to: filePath.startsWith("skills/") ? "/guarding/skills" : "/guarding/global-rules",
                  search: filePath.startsWith("skills/") ? {} : { file: filePath },
                }),
              )
            }
          />
        )}
        <ActionGroup heading="Navigate" actions={navigateActions} onRun={exec} />
        <ActionGroup heading="Create" actions={createActions} onRun={exec} />
        <ActionGroup heading="Theme" actions={themeActions} onRun={exec} />
        {search.trim().length === 0 && (
          <ActionGroup heading="Coming soon" actions={comingSoonActions} onRun={exec} />
        )}
      </Command.List>
    </Command.Dialog>
  );
}

interface SearchHit {
  path: string;
  matches: Array<{ line: number; text: string }>;
}

// Mirrors the server's MAX_FILES cap in services/claude-fs/search.ts.
// When the API returns exactly this many results we tell the user to
// narrow their query so they know there might be more.
const SEARCH_RESULTS_CAP = 50;

function SearchResultsGroup({
  query,
  results,
  onSelect,
}: {
  query: string;
  results: SearchHit[];
  onSelect: (path: string) => void;
}) {
  const capped = results.length >= SEARCH_RESULTS_CAP;
  return (
    <Command.Group
      heading={`Search results · "${query}"`}
      className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-text-muted"
    >
      {results.map((hit) => {
        const firstMatch = hit.matches[0];
        return (
          <Command.Item
            key={hit.path}
            value={`search ${hit.path} ${query}`}
            onSelect={() => onSelect(hit.path)}
            className="flex items-start gap-3 px-3 py-2 text-[12px] font-bold text-text-main cursor-pointer aria-selected:bg-accent aria-selected:text-text-on-accent"
          >
            <span className="w-3.5 h-3.5 mt-0.5 shrink-0">
              <FileText size={14} />
            </span>
            <span className="flex flex-col min-w-0 flex-1">
              <span className="truncate">{hit.path}</span>
              {firstMatch && (
                <span className="text-[10px] font-mono text-text-muted truncate normal-case font-normal aria-selected:text-text-on-accent">
                  L{firstMatch.line}: {firstMatch.text}
                </span>
              )}
            </span>
            <span className="text-[9px] font-mono text-text-subtle uppercase tracking-wider shrink-0 mt-0.5 aria-selected:text-text-on-accent">
              {hit.matches.length} match{hit.matches.length === 1 ? "" : "es"}
            </span>
          </Command.Item>
        );
      })}
      {capped && (
        <div className="px-3 py-2 text-[10px] font-mono text-text-subtle italic">
          Results capped at {SEARCH_RESULTS_CAP} — try a narrower search term.
        </div>
      )}
    </Command.Group>
  );
}

function ActionGroup({
  heading,
  actions,
  onRun,
}: {
  heading: string;
  actions: ActionItem[];
  onRun: (run?: () => void) => void;
}) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-text-muted"
    >
      {actions.map((action) => (
        <Command.Item
          key={action.id}
          value={`${heading} ${action.label}`}
          disabled={action.disabled}
          onSelect={() => onRun(action.run)}
          className="flex items-center justify-between gap-3 px-3 py-2 text-[12px] font-bold text-text-main cursor-pointer aria-selected:bg-accent aria-selected:text-text-on-accent data-[disabled=true]:text-text-subtle data-[disabled=true]:cursor-not-allowed data-[disabled=true]:aria-selected:bg-bg-hover data-[disabled=true]:aria-selected:text-text-subtle"
        >
          <span className="flex items-center gap-3">
            <span className="w-3.5 h-3.5">{action.icon}</span>
            <span className="normal-case">{action.label}</span>
          </span>
          {action.hint && (
            <span className="text-[9px] font-mono opacity-60 tracking-wider uppercase">
              {action.hint}
            </span>
          )}
        </Command.Item>
      ))}
    </Command.Group>
  );
}
