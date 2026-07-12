import { useEffect, useRef, useState } from "react";

export type TerminalSocketStatus =
  | "connecting"
  | "open"
  | "closed"
  | "error";

interface UseTerminalSocketArgs {
  cwd?: string;
  cols: number;
  rows: number;
  /** Called for every \"output\" frame from the server. */
  onOutput: (data: string) => void;
  /** Called once when the PTY exits (the WS will close right after). */
  onExit?: (exitCode: number) => void;
  /** Called when the WS closes for any reason — code + reason for surfacing
      validation rejections (4400 / 4403) to the user. */
  onClose?: (code: number, reason: string) => void;
}

export interface TerminalSocketHandle {
  status: TerminalSocketStatus;
  send: (data: string) => void;
  resize: (cols: number, rows: number) => void;
}

interface ServerOutputMsg {
  type: "output";
  data: string;
}
interface ServerExitMsg {
  type: "exit";
  exitCode: number;
}
type ServerMsg = ServerOutputMsg | ServerExitMsg;

/**
 * Owns the lifecycle of one WebSocket → /ws/terminal connection.
 *
 * The hook is mounted once per <Terminal> instance: it opens on mount,
 * pipes server frames into the supplied `onOutput`/`onExit` callbacks,
 * and closes on unmount. `send` and `resize` are stable functions tied
 * to the live socket; calling them before `status === \"open\"` is
 * tolerated (sends are dropped quietly until the socket is ready).
 *
 * Server URL is derived from the page's origin so dev (vite proxy) and
 * prod (single-origin Fastify) both work without configuration.
 */
export function useTerminalSocket(args: UseTerminalSocketArgs): TerminalSocketHandle {
  const { cwd, cols, rows, onOutput, onExit, onClose } = args;
  const [status, setStatus] = useState<TerminalSocketStatus>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const callbacksRef = useRef({ onOutput, onExit, onClose });

  // Stash the latest callbacks without re-mounting the socket on every
  // render — the WebSocket lives across the component lifetime.
  callbacksRef.current = { onOutput, onExit, onClose };

  // Open exactly once per mount. cwd/cols/rows are read on first connect;
  // resize is handled separately via the imperative `resize` returned below.
  //
  // The `cancelled` flag handles React StrictMode's mount → unmount → re-mount
  // double-invoke: when cleanup fires while the WS is still in CONNECTING,
  // calling ws.close() emits a noisy "WebSocket is closed before the connection
  // is established" warning in DevTools. We instead defer the close until the
  // socket actually opens (and then close it from the open handler), which
  // keeps the console quiet without changing real-world behavior.
  useEffect(() => {
    let cancelled = false;
    const url = buildSocketUrl({ cwd, cols, rows });
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.addEventListener("open", () => {
      if (cancelled) {
        // Parent already unmounted; close cleanly now that the handshake
        // finished. This is the StrictMode double-invoke path.
        try {
          ws.close(1000);
        } catch {
          // already closed
        }
        return;
      }
      setStatus("open");
    });
    ws.addEventListener("error", () => {
      if (!cancelled) setStatus("error");
    });
    ws.addEventListener("message", (e) => {
      if (cancelled) return;
      let parsed: ServerMsg | null;
      try {
        parsed = JSON.parse(typeof e.data === "string" ? e.data : "") as ServerMsg;
      } catch {
        return;
      }
      if (!parsed || typeof parsed !== "object" || !("type" in parsed)) return;
      if (parsed.type === "output") {
        callbacksRef.current.onOutput(parsed.data);
      } else if (parsed.type === "exit") {
        callbacksRef.current.onExit?.(parsed.exitCode);
      }
    });
    ws.addEventListener("close", (e) => {
      if (cancelled) return;
      setStatus("closed");
      callbacksRef.current.onClose?.(e.code, e.reason);
    });

    return () => {
      cancelled = true;
      // If the socket already opened, close it normally. If it's still in
      // CONNECTING, the open handler above will close it once the handshake
      // completes — calling ws.close() here would just emit the warning.
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.close(1000);
        } catch {
          // already closed
        }
      }
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = (data: string) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "input", data }));
  };

  const resize = (nextCols: number, nextRows: number) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: "resize", cols: nextCols, rows: nextRows }));
  };

  return { status, send, resize };
}

interface BuildArgs {
  cwd?: string;
  cols: number;
  rows: number;
}

function buildSocketUrl({ cwd, cols, rows }: BuildArgs): string {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const params = new URLSearchParams();
  if (cwd && cwd.length > 0) params.set("cwd", cwd);
  params.set("cols", String(cols));
  params.set("rows", String(rows));
  return `${proto}://${window.location.host}/ws/terminal?${params.toString()}`;
}
