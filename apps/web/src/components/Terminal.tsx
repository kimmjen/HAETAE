import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { useTheme } from "@/lib/theme";
import { buildTerminalTheme } from "@/lib/terminal-theme";
import { useTerminalSocket, type TerminalSocketStatus } from "@/hooks/useTerminalSocket";
import { TerminalCloseBanner } from "./TerminalCloseBanner";

interface TerminalProps {
  cwd?: string;
  /** Shell line auto-typed once the PTY is ready (P3.5). Newline is
      appended automatically. Fires exactly once per Terminal instance. */
  autoCommand?: string;
  /** Bubbled up so a tab bar / status badge can render the dot without
      re-running the WS hook. Fires on every status transition. */
  onStatusChange?: (status: TerminalSocketStatus) => void;
}

export interface TerminalHandle {
  /** Move keyboard focus into the xterm helper textarea. */
  focus(): void;
  /** Erase the on-screen buffer (xterm `clear()` keeps scrollback). */
  clear(): void;
  /** Find next match for `query`. Returns true if a match was highlighted. */
  searchNext(query: string): boolean;
  /** Find previous match for `query`. Returns true if a match was highlighted. */
  searchPrevious(query: string): boolean;
}

const SCROLLBACK = 1000;

/**
 * xterm.js + WebSocket body. Renders only the terminal surface — no
 * header, no border, no fixed height — so the parent (single-tab page,
 * multi-tab view) can wrap it with whatever chrome is appropriate.
 *
 * The WebSocket hook owns connection state. The PTY's onData drives
 * `term.write`, terminal input is forwarded to the socket, and a
 * ResizeObserver keeps cols/rows in sync with the container.
 *
 * Exposes a `TerminalHandle` via ref so the parent can run imperative
 * actions tied to keyboard shortcuts (clear, search, refocus) without
 * round-tripping through state.
 */
export const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal(
  { cwd, autoCommand, onStatusChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const { theme } = useTheme();
  const [closeInfo, setCloseInfo] = useState<{ code: number; reason: string } | null>(null);

  // Initial dimensions guess; the fit addon refines them once mounted.
  const dimsRef = useRef({ cols: 80, rows: 24 });

  // Latches true the first time we see a server output frame — the PTY
  // has actually printed a prompt, so it's safe to inject auto-typed
  // commands. Going off socket.status === 'open' alone is too eager:
  // the WS opens before the shell finishes its rcfiles, and an `ls\n`
  // injected at that moment can race with the prompt/output ordering.
  const [ptyReady, setPtyReady] = useState(false);

  const socket = useTerminalSocket({
    cwd,
    cols: dimsRef.current.cols,
    rows: dimsRef.current.rows,
    onOutput: (data) => {
      termRef.current?.write(data);
      if (!ptyReady) setPtyReady(true);
    },
    onExit: (code) => {
      termRef.current?.writeln(`\r\n\x1b[2m[process exited ${code}]\x1b[0m`);
    },
    onClose: (code, reason) => {
      // 4400 invalid cwd / 4403 forbidden cwd / 4500 internal — surface
      // these to the user. 1000 (normal) and 1006 (abnormal close) are
      // common during navigation/HMR; we don't shout about them.
      if (code >= 4000) {
        setCloseInfo({ code, reason: reason || `connection closed (code ${code})` });
      }
    },
  });

  // Bubble socket status to the parent on every transition. The callback
  // identity is held in a ref so callers can pass an inline arrow without
  // re-firing this effect each render (which would loop with parents that
  // setState in onStatusChange).
  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
  });
  useEffect(() => {
    onStatusChangeRef.current?.(socket.status);
  }, [socket.status]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => termRef.current?.focus(),
      clear: () => termRef.current?.clear(),
      searchNext: (q) => searchRef.current?.findNext(q) ?? false,
      searchPrevious: (q) => searchRef.current?.findPrevious(q) ?? false,
    }),
    [],
  );

  // Mount xterm exactly once. Theme/dim updates happen via separate effects.
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      // Nerd Font stack first so shell-prompt powerline/icon glyphs (p10k,
      // starship) render instead of tofu (□). Falls through common Nerd Fonts,
      // then a glyph-only Symbols Nerd Font for per-glyph fallback, then plain
      // JetBrains Mono / system monospace for text. Whichever the user has
      // installed wins; if none, only the icons degrade (text is unaffected).
      fontFamily:
        "'MesloLGS NF', 'JetBrainsMono Nerd Font', 'Hack Nerd Font', 'FiraCode Nerd Font', 'Symbols Nerd Font Mono', 'JetBrains Mono', ui-monospace, monospace",
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: SCROLLBACK,
      allowProposedApi: true,
      theme: buildTerminalTheme(),
    });
    termRef.current = term;

    const fit = new FitAddon();
    fitRef.current = fit;
    const search = new SearchAddon();
    searchRef.current = search;
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.loadAddon(new Unicode11Addon());
    term.loadAddon(search);
    term.unicode.activeVersion = "11";

    term.open(containerRef.current);
    fit.fit();
    dimsRef.current = { cols: term.cols, rows: term.rows };

    const inputDisposable = term.onData((data) => socket.send(data));

    const ro = new ResizeObserver(() => {
      try {
        fit.fit();
        dimsRef.current = { cols: term.cols, rows: term.rows };
        socket.resize(term.cols, term.rows);
      } catch {
        // fit can throw if the container is detached — ignore.
      }
    });
    ro.observe(containerRef.current);

    // Deferred focus: synchronous focus during mount sometimes loses out to
    // whatever held focus before navigation completed. A microtask later
    // the xterm helper-textarea is reliably focusable.
    const focusTimer = setTimeout(() => term.focus(), 0);

    return () => {
      clearTimeout(focusTimer);
      inputDisposable.dispose();
      ro.disconnect();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
    };
    // socket.send/resize identities change every render but we only need
    // the socket once at mount; the hook keeps a stable inner ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild theme on light/dark toggle.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = buildTerminalTheme();
  }, [theme]);

  // Re-focus once the socket opens — the first prompt arrives shortly
  // after, and we want the cursor active for the user immediately.
  useEffect(() => {
    if (socket.status === "open") {
      termRef.current?.focus();
    }
  }, [socket.status]);

  // Auto-type the requested command exactly once per Terminal instance,
  // the first time the PTY actually prints output (= shell prompt is
  // ready). Held in a ref so re-renders don't resend; the sent flag is
  // tracked separately from props so a parent tab swap doesn't fire it
  // again. Sending only after `socket.send` is captured via ref keeps
  // this effect off the per-render socket-object identity.
  const autoCommandRef = useRef(autoCommand);
  useEffect(() => {
    autoCommandRef.current = autoCommand;
  });
  const sendRef = useRef(socket.send);
  useEffect(() => {
    sendRef.current = socket.send;
  });
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (!ptyReady) return;
    if (autoSentRef.current) return;
    const cmd = autoCommandRef.current;
    if (!cmd) return;
    autoSentRef.current = true;
    // Lead with \x15 (kill-line) so a not-yet-settled shell or any leftover
    // keystrokes on the line can't fuse with the command and run a mangled
    // fragment (e.g. a long absolute-path command losing its prefix). No-op on
    // an empty prompt. Newline then triggers execution.
    sendRef.current(`\x15${cmd}\n`);
  }, [ptyReady]);

  const focusTerminal = () => {
    termRef.current?.focus();
  };

  if (closeInfo) {
    return <TerminalCloseBanner code={closeInfo.code} reason={closeInfo.reason} />;
  }

  // Outer wrapper carries the left gutter so the cursor/text never sits
  // flush against the border. xterm itself mounts into the inner div —
  // padding directly on the mount element would confuse the fit addon.
  return (
    <div
      onMouseDown={focusTerminal}
      onClick={focusTerminal}
      role="presentation"
      className="h-full bg-terminal-bg overflow-hidden p-2"
    >
      <div ref={containerRef} className="h-full" />
    </div>
  );
});
