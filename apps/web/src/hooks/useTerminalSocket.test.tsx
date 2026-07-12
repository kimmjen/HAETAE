import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTerminalSocket } from "./useTerminalSocket";

interface FakeWebSocket {
  url: string;
  readyState: number;
  sent: string[];
  listeners: Record<string, Array<(e: unknown) => void>>;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  addEventListener: (type: string, cb: (e: unknown) => void) => void;
  // helpers
  fireOpen: () => void;
  fireMessage: (data: unknown) => void;
  fireClose: (code: number, reason?: string) => void;
  fireError: () => void;
}

let fakes: FakeWebSocket[] = [];

class FakeWebSocketImpl implements FakeWebSocket {
  url: string;
  readyState: number = 0; // CONNECTING
  sent: string[] = [];
  listeners: Record<string, Array<(e: unknown) => void>> = {};
  static OPEN = 1;
  static CLOSED = 3;
  // instance constants for the readyState comparison in the hook
  OPEN = 1;
  CLOSED = 3;

  constructor(url: string) {
    this.url = url;
    fakes.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code = 1000, reason = "") {
    this.readyState = 3;
    this.fireClose(code, reason);
  }
  addEventListener(type: string, cb: (e: unknown) => void) {
    (this.listeners[type] ??= []).push(cb);
  }
  fireOpen() {
    this.readyState = 1;
    this.listeners["open"]?.forEach((cb) => cb({}));
  }
  fireMessage(payload: unknown) {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    this.listeners["message"]?.forEach((cb) => cb({ data }));
  }
  fireClose(code: number, reason = "") {
    this.listeners["close"]?.forEach((cb) => cb({ code, reason }));
  }
  fireError() {
    this.listeners["error"]?.forEach((cb) => cb({}));
  }
}

describe("useTerminalSocket", () => {
  let originalWs: typeof globalThis.WebSocket;

  beforeEach(() => {
    fakes = [];
    originalWs = globalThis.WebSocket;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocketImpl;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { protocol: "http:", host: "localhost:3001" },
    });
  });

  afterEach(() => {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWs;
  });

  it("opens with a ws:// URL carrying cwd/cols/rows query params", () => {
    renderHook(() =>
      useTerminalSocket({
        cwd: "/x/Alpha",
        cols: 100,
        rows: 30,
        onOutput: () => undefined,
      }),
    );
    expect(fakes).toHaveLength(1);
    const url = fakes[0]!.url;
    expect(url.startsWith("ws://localhost:3001/ws/terminal?")).toBe(true);
    expect(url).toContain("cwd=%2Fx%2FAlpha");
    expect(url).toContain("cols=100");
    expect(url).toContain("rows=30");
  });

  it("transitions to status='open' on the open event", async () => {
    const { result } = renderHook(() =>
      useTerminalSocket({ cols: 80, rows: 24, onOutput: () => undefined }),
    );
    expect(result.current.status).toBe("connecting");
    act(() => fakes[0]!.fireOpen());
    await waitFor(() => expect(result.current.status).toBe("open"));
  });

  it("forwards 'output' frames to onOutput", async () => {
    const onOutput = vi.fn();
    renderHook(() =>
      useTerminalSocket({ cols: 80, rows: 24, onOutput }),
    );
    act(() => {
      fakes[0]!.fireOpen();
      fakes[0]!.fireMessage({ type: "output", data: "hello\r\n" });
    });
    expect(onOutput).toHaveBeenCalledWith("hello\r\n");
  });

  it("forwards 'exit' frames to onExit", async () => {
    const onExit = vi.fn();
    renderHook(() =>
      useTerminalSocket({ cols: 80, rows: 24, onOutput: () => undefined, onExit }),
    );
    act(() => {
      fakes[0]!.fireOpen();
      fakes[0]!.fireMessage({ type: "exit", exitCode: 0 });
    });
    expect(onExit).toHaveBeenCalledWith(0);
  });

  it("send() encodes input frames as JSON envelopes when open", async () => {
    const { result } = renderHook(() =>
      useTerminalSocket({ cols: 80, rows: 24, onOutput: () => undefined }),
    );
    act(() => fakes[0]!.fireOpen());
    act(() => result.current.send("ls\n"));
    expect(fakes[0]!.sent).toEqual([JSON.stringify({ type: "input", data: "ls\n" })]);
  });

  it("send() drops calls when the socket isn't open yet", () => {
    const { result } = renderHook(() =>
      useTerminalSocket({ cols: 80, rows: 24, onOutput: () => undefined }),
    );
    // No fireOpen call — readyState stays at CONNECTING.
    result.current.send("ls\n");
    expect(fakes[0]!.sent).toEqual([]);
  });

  it("resize() encodes a resize envelope", async () => {
    const { result } = renderHook(() =>
      useTerminalSocket({ cols: 80, rows: 24, onOutput: () => undefined }),
    );
    act(() => fakes[0]!.fireOpen());
    act(() => result.current.resize(120, 40));
    expect(fakes[0]!.sent).toContain(JSON.stringify({ type: "resize", cols: 120, rows: 40 }));
  });

  it("calls onClose with code + reason and reports status='closed'", async () => {
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useTerminalSocket({ cols: 80, rows: 24, onOutput: () => undefined, onClose }),
    );
    act(() => fakes[0]!.fireOpen());
    act(() => fakes[0]!.fireClose(4403, "cwd not allowed: /etc"));
    await waitFor(() => expect(result.current.status).toBe("closed"));
    expect(onClose).toHaveBeenCalledWith(4403, "cwd not allowed: /etc");
  });

  it("ignores malformed JSON frames", () => {
    const onOutput = vi.fn();
    renderHook(() =>
      useTerminalSocket({ cols: 80, rows: 24, onOutput }),
    );
    act(() => {
      fakes[0]!.fireOpen();
      fakes[0]!.fireMessage("not-json{{{");
    });
    expect(onOutput).not.toHaveBeenCalled();
  });

  it("closes the socket on unmount once it's open", () => {
    const { unmount } = renderHook(() =>
      useTerminalSocket({ cols: 80, rows: 24, onOutput: () => undefined }),
    );
    expect(fakes[0]!.readyState).toBe(0);
    act(() => fakes[0]!.fireOpen());
    expect(fakes[0]!.readyState).toBe(1);
    unmount();
    expect(fakes[0]!.readyState).toBe(3);
  });

  it("defers close until the WS opens when unmounted while still CONNECTING", () => {
    // Avoids a "WebSocket is closed before the connection is established"
    // warning during React 19 StrictMode's mount → unmount → re-mount cycle.
    const { unmount } = renderHook(() =>
      useTerminalSocket({ cols: 80, rows: 24, onOutput: () => undefined }),
    );
    expect(fakes[0]!.readyState).toBe(0);
    unmount();
    // CONNECTING → cleanup must NOT call ws.close().
    expect(fakes[0]!.readyState).toBe(0);
    // Once the handshake finishes, the open handler observes the cancelled
    // flag and closes itself.
    act(() => fakes[0]!.fireOpen());
    expect(fakes[0]!.readyState).toBe(3);
  });
});
