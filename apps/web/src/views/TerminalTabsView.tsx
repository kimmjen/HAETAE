import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Terminal, type TerminalHandle } from "@/components/Terminal";
import {
  TerminalTabBar,
  type TerminalTabDescriptor,
} from "@/components/TerminalTabBar";
import {
  TerminalContextMenu,
  clampMenuPosition,
  type TerminalMenuAction,
} from "@/components/TerminalContextMenu";
import { TerminalSearchBar } from "@/components/TerminalSearchBar";
import { useHotkey } from "@/hooks/useHotkey";
import { useXtermFocus } from "@/hooks/useXtermFocus";
import type { TerminalSocketStatus } from "@/hooks/useTerminalSocket";

interface TabState {
  id: string;
  cwd?: string;
  /** Auto-typed command for this tab (P3.5). Cleared after the Terminal
      consumes it on socket open. */
  autoCommand?: string;
  label: string;
  status: TerminalSocketStatus;
}

interface PendingSpawn {
  cwd?: string;
  autoCommand?: string;
  /** Increments per request — same (cwd, autoCommand) pair re-fires when
   *  this number changes. */
  nonce: number;
}

interface TerminalTabsViewProps {
  /** Optional spawn signal driven by the dock provider. The very first
   *  request also seeds the initial tab; subsequent requests open new
   *  tabs. Component is OK with `undefined` (renders an empty terminal
   *  list and waits). */
  pendingSpawn?: PendingSpawn | null;
  /** Backwards-compat: legacy direct-mount usage seeded the first tab via
   *  these props. New code should drive everything through `pendingSpawn`. */
  initialCwd?: string;
  initialAutoCommand?: string;
}

interface MenuState {
  tabId: string;
  x: number;
  y: number;
}

let nextTabSeq = 0;
function newTabId(): string {
  nextTabSeq += 1;
  return `tab-${Date.now()}-${nextTabSeq}`;
}

function labelFromCwd(cwd: string | undefined, fallbackIndex: number): string {
  if (!cwd) return `Terminal ${fallbackIndex}`;
  const parts = cwd.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? `Terminal ${fallbackIndex}`;
}

/**
 * Multi-tab terminal page (P3.3 + P3.4).
 *
 * Lays out a TerminalTabBar above one Terminal per tab. Inactive tabs
 * are kept mounted (CSS `display: none`) so their PTY/WebSocket state
 * persists when the user switches away — switching back resumes the
 * scrollback the shell wrote in the meantime.
 *
 * Right-click on a tab opens a context menu (Close / Close others /
 * Close all). Closing the last tab leaves the page empty rather than
 * auto-spawning, so the user has explicit control.
 *
 * VS Code 호환 단축키 (P3.4):
 *   Cmd/Ctrl+T          새 탭
 *   Cmd/Ctrl+W          현재 탭 닫기
 *   Cmd/Ctrl+1..9       N번째 탭으로 이동
 *   Cmd/Ctrl+Shift+]    다음 탭
 *   Cmd/Ctrl+Shift+[    이전 탭
 *   Cmd/Ctrl+F          터미널 내 검색
 *   Cmd/Ctrl+K          xterm 포커스 시 clear, 아니면 명령 팔레트 (전역에서 처리)
 */
export function TerminalTabsView({
  pendingSpawn,
  initialCwd: legacyInitialCwd,
  initialAutoCommand: legacyInitialAutoCommand,
}: TerminalTabsViewProps) {
  const initialCwd = pendingSpawn?.cwd ?? legacyInitialCwd;
  const initialAutoCommand =
    pendingSpawn?.autoCommand ?? legacyInitialAutoCommand;

  // Legacy callers (TerminalTabsView used directly with initialCwd /
  // initialAutoCommand props, esp. existing tests) want \"props change → new
  // tab spawn\". Synthesize a pendingSpawn-shaped value so the same effect
  // path handles both.
  const legacyNonceRef = useRef(0);
  const lastLegacyPairRef = useRef({
    cwd: legacyInitialCwd,
    auto: legacyInitialAutoCommand,
  });
  const effectiveSpawn = useMemo<PendingSpawn | null>(() => {
    if (pendingSpawn) return pendingSpawn;
    const last = lastLegacyPairRef.current;
    if (
      last.cwd !== legacyInitialCwd ||
      last.auto !== legacyInitialAutoCommand
    ) {
      legacyNonceRef.current += 1;
      lastLegacyPairRef.current = {
        cwd: legacyInitialCwd,
        auto: legacyInitialAutoCommand,
      };
    }
    if (legacyInitialCwd === undefined && legacyInitialAutoCommand === undefined) {
      return null;
    }
    return {
      cwd: legacyInitialCwd,
      autoCommand: legacyInitialAutoCommand,
      nonce: legacyNonceRef.current,
    };
  }, [pendingSpawn, legacyInitialCwd, legacyInitialAutoCommand]);
  const [tabs, setTabs] = useState<TabState[]>(() => {
    const tab: TabState = {
      id: newTabId(),
      cwd: initialCwd,
      autoCommand: initialAutoCommand,
      label: labelFromCwd(initialCwd, 1),
      status: "connecting",
    };
    return [tab];
  });
  const [activeId, setActiveId] = useState<string | null>(() => tabs[0]?.id ?? null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Imperative handles per tab so hotkeys can drive the active xterm
  // (clear / search / focus) without reaching through React state.
  const handlesRef = useRef<Map<string, TerminalHandle>>(new Map());
  const setHandle = useCallback((id: string, handle: TerminalHandle | null) => {
    if (handle) handlesRef.current.set(id, handle);
    else handlesRef.current.delete(id);
  }, []);
  const activeHandle = (): TerminalHandle | undefined =>
    activeId ? handlesRef.current.get(activeId) : undefined;

  const xtermFocused = useXtermFocus();

  const spawnTab = useCallback((opts: { cwd?: string; autoCommand?: string }) => {
    const id = newTabId();
    // setActiveId lives outside the setTabs updater on purpose — calling
    // setState inside another setState's updater is a React anti-pattern
    // (StrictMode double-invokes the updater, and the inner setState can
    // be dropped or re-ordered, leaving the new tab inactive).
    setTabs((prev) => [
      ...prev,
      {
        id,
        cwd: opts.cwd,
        autoCommand: opts.autoCommand,
        label: labelFromCwd(opts.cwd, prev.length + 1),
        status: "connecting",
      },
    ]);
    setActiveId(id);
  }, []);

  // Used by the + button, Cmd+T, and EmptyState — all event-handler shaped,
  // so it explicitly takes no args (avoids the MouseEvent being misread as
  // tab options).
  const addBlankTab = useCallback(() => spawnTab({}), [spawnTab]);

  // Honor effectiveSpawn from the dock provider (or synthesized legacy props).
  // The first nonce was used when seeding `tabs` via useState initializer;
  // subsequent nonces open a fresh tab. We dedupe on nonce so React
  // StrictMode double-effects don't double-spawn.
  const lastAppliedNonceRef = useRef(effectiveSpawn?.nonce ?? 0);
  useEffect(() => {
    if (!effectiveSpawn) return;
    if (effectiveSpawn.nonce === lastAppliedNonceRef.current) return;
    lastAppliedNonceRef.current = effectiveSpawn.nonce;
    if (
      effectiveSpawn.cwd === undefined &&
      effectiveSpawn.autoCommand === undefined
    ) {
      return;
    }
    spawnTab({ cwd: effectiveSpawn.cwd, autoCommand: effectiveSpawn.autoCommand });
  }, [effectiveSpawn, spawnTab]);

  // Mirror tabs into a ref so callbacks like closeTab can read the
  // current list synchronously without nesting setState updaters
  // (which StrictMode double-invokes and can drop the inner setState).
  const tabsRef = useRef(tabs);
  useEffect(() => {
    tabsRef.current = tabs;
  });

  const closeTab = useCallback((id: string) => {
    const prev = tabsRef.current;
    const idx = prev.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const next = prev.filter((t) => t.id !== id);
    setTabs(next);
    setActiveId((current) => {
      if (current !== id) return current;
      if (next.length === 0) return null;
      // Pick the neighbour to the right when possible, else left.
      const fallbackIndex = Math.min(idx, next.length - 1);
      return next[fallbackIndex]?.id ?? null;
    });
    handlesRef.current.delete(id);
    setMenu(null);
  }, []);

  const closeOthers = useCallback((keepId: string) => {
    setTabs((prev) => {
      // Drop handles for tabs we're about to unmount.
      for (const t of prev) if (t.id !== keepId) handlesRef.current.delete(t.id);
      return prev.filter((t) => t.id === keepId);
    });
    setActiveId(keepId);
    setMenu(null);
  }, []);

  const closeAll = useCallback(() => {
    handlesRef.current.clear();
    setTabs([]);
    setActiveId(null);
    setMenu(null);
  }, []);

  const onContextMenu = useCallback((tabId: string, x: number, y: number) => {
    const clamped = clampMenuPosition(x, y);
    setMenu({ tabId, x: clamped.x, y: clamped.y });
  }, []);

  const onMenuAction = useCallback(
    (action: TerminalMenuAction) => {
      if (!menu) return;
      if (action === "close") closeTab(menu.tabId);
      else if (action === "close-others") closeOthers(menu.tabId);
      else if (action === "close-all") closeAll();
    },
    [menu, closeTab, closeOthers, closeAll],
  );

  const setStatus = useCallback((id: string, status: TerminalSocketStatus) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
  }, []);

  // Switch to the Nth tab (0-based). No-op when out of range.
  const selectByIndex = useCallback(
    (index: number) => {
      const tab = tabs[index];
      if (tab) setActiveId(tab.id);
    },
    [tabs],
  );

  const cycleTab = useCallback(
    (delta: number) => {
      if (tabs.length === 0) return;
      const idx = activeId ? tabs.findIndex((t) => t.id === activeId) : -1;
      const next = (idx + delta + tabs.length) % tabs.length;
      setActiveId(tabs[next]!.id);
    },
    [tabs, activeId],
  );

  const closeActive = useCallback(() => {
    if (activeId) closeTab(activeId);
  }, [activeId, closeTab]);

  // Re-focus the new active tab after a switch so subsequent input goes
  // to the right shell. Skipping when search is open avoids stealing the
  // user's caret out of the search box.
  useEffect(() => {
    if (searchOpen) return;
    activeHandle()?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Browser reservation note: macOS/Windows browsers grab Cmd/Ctrl+T,
  // Cmd/Ctrl+W, and Cmd/Ctrl+1..9 at the OS chrome level — keydown never
  // reaches JS. We keep those bindings for a future Tauri build where
  // they *will* fire, and add browser-safe aliases for the most common
  // action (new tab) so users always have a working keyboard path.
  useHotkey("mod+t", addBlankTab);
  useHotkey("mod+shift+`", addBlankTab); // browser-safe alias (VS Code 표준)
  useHotkey("mod+w", closeActive);
  useHotkey("mod+shift+]", () => cycleTab(1));
  useHotkey("mod+shift+[", () => cycleTab(-1));
  useHotkey("mod+1", () => selectByIndex(0));
  useHotkey("mod+2", () => selectByIndex(1));
  useHotkey("mod+3", () => selectByIndex(2));
  useHotkey("mod+4", () => selectByIndex(3));
  useHotkey("mod+5", () => selectByIndex(4));
  useHotkey("mod+6", () => selectByIndex(5));
  useHotkey("mod+7", () => selectByIndex(6));
  useHotkey("mod+8", () => selectByIndex(7));
  useHotkey("mod+9", () => selectByIndex(8));
  useHotkey("mod+f", () => setSearchOpen(true));
  // Cmd+K only clears the terminal when xterm has focus — otherwise the
  // global palette hotkey takes the keystroke (it disables itself when
  // xterm is focused, see CommandPalette).
  useHotkey(
    "mod+k",
    () => activeHandle()?.clear(),
    { enabled: xtermFocused },
  );

  const descriptors: TerminalTabDescriptor[] = tabs.map((t) => ({
    id: t.id,
    label: t.label,
    cwd: t.cwd,
    status: t.status,
  }));

  return (
    <div className="h-full w-full flex flex-col border border-border-main bg-bg-primary">
      <TerminalTabBar
        tabs={descriptors}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={closeTab}
        onAdd={addBlankTab}
        onContextMenu={onContextMenu}
      />
      <div className="flex-1 min-h-0 relative">
        {tabs.length === 0 ? (
          <EmptyState onAdd={addBlankTab} />
        ) : (
          tabs.map((tab) => (
            <div
              key={tab.id}
              className={tab.id === activeId ? "h-full" : "hidden"}
              aria-hidden={tab.id !== activeId}
            >
              <Terminal
                ref={(handle) => setHandle(tab.id, handle)}
                cwd={tab.cwd}
                autoCommand={tab.autoCommand}
                onStatusChange={(status) => setStatus(tab.id, status)}
              />
            </div>
          ))
        )}
        {searchOpen && tabs.length > 0 && (
          <TerminalSearchBar
            onNext={(q) => activeHandle()?.searchNext(q)}
            onPrevious={(q) => activeHandle()?.searchPrevious(q)}
            onClose={() => {
              setSearchOpen(false);
              activeHandle()?.focus();
            }}
          />
        )}
      </div>
      {menu && (
        <TerminalContextMenu
          x={menu.x}
          y={menu.y}
          hasSiblings={tabs.length > 1}
          onAction={onMenuAction}
          onDismiss={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="h-full flex items-center justify-center bg-bg-primary">
      <button
        type="button"
        onClick={onAdd}
        className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest border border-border-main bg-bg-secondary text-text-main hover:bg-bg-hover transition-colors"
      >
        Open new terminal
      </button>
    </div>
  );
}
