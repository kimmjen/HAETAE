import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/lib/theme";

interface XTermSpy {
  open: (el: HTMLElement) => void;
  loadAddon: (a: unknown) => void;
  onData: (cb: (s: string) => void) => { dispose: () => void };
  unicode: { activeVersion: string };
  options: { theme?: unknown };
  cols: number;
  rows: number;
  write: (s: string) => void;
  writeln: (s: string) => void;
  focus: () => void;
  clear: () => void;
  dispose: () => void;
  // helpers
  inputCb?: (s: string) => void;
}

let xtermInstance: XTermSpy | null = null;

vi.mock("@xterm/xterm", () => ({
  Terminal: vi.fn(function () {
    const inst: XTermSpy = {
      cols: 80,
      rows: 24,
      open: vi.fn(),
      loadAddon: vi.fn(),
      onData: vi.fn((cb) => {
        inst.inputCb = cb;
        return { dispose: vi.fn() };
      }),
      unicode: { activeVersion: "10" },
      options: {},
      write: vi.fn(),
      writeln: vi.fn(),
      focus: vi.fn(),
      clear: vi.fn(),
      dispose: vi.fn(),
    };
    xtermInstance = inst;
    return inst;
  }),
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: vi.fn(function () {
    return { fit: vi.fn(), activate: vi.fn(), dispose: vi.fn() };
  }),
}));

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: vi.fn(function () {
    return { activate: vi.fn(), dispose: vi.fn() };
  }),
}));

vi.mock("@xterm/addon-unicode11", () => ({
  Unicode11Addon: vi.fn(function () {
    return { activate: vi.fn(), dispose: vi.fn() };
  }),
}));

vi.mock("@xterm/addon-search", () => ({
  SearchAddon: vi.fn(function () {
    return {
      activate: vi.fn(),
      dispose: vi.fn(),
      findNext: vi.fn(() => true),
      findPrevious: vi.fn(() => true),
    };
  }),
}));

vi.mock("@xterm/xterm/css/xterm.css", () => ({}));

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static OPEN = 1;
  OPEN = 1;
  CLOSED = 3;
  url: string;
  readyState = 0;
  sent: string[] = [];
  listeners: Record<string, Array<(e: unknown) => void>> = {};
  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
    this.listeners["close"]?.forEach((cb) => cb({ code: 1000, reason: "" }));
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
}

class StubResizeObserver {
  cb: ResizeObserverCallback;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

import { Terminal } from "./Terminal";

function renderTerminal(cwd?: string) {
  return render(
    <ThemeProvider>
      <Terminal cwd={cwd} />
    </ThemeProvider>,
  );
}

describe("Terminal", () => {
  let originalWs: typeof globalThis.WebSocket;
  let originalRO: typeof globalThis.ResizeObserver;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    xtermInstance = null;
    originalWs = globalThis.WebSocket;
    originalRO = globalThis.ResizeObserver;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { protocol: "http:", host: "localhost:3001" },
    });
  });

  afterEach(() => {
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWs;
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = originalRO;
    vi.restoreAllMocks();
  });

  it("renders just the xterm body (status moves to the parent in P3.3)", () => {
    const { container } = renderTerminal("/x/Alpha");
    // The body is the role=presentation div xterm mounts into.
    const body = container.querySelector("[role='presentation']");
    expect(body).not.toBeNull();
    // No "Terminal" header inside the component anymore.
    expect(screen.queryByText("Terminal")).toBeNull();
  });

  it("opens a WebSocket on mount with cwd query param", () => {
    renderTerminal("/x/Alpha");
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(FakeWebSocket.instances[0]!.url).toContain("cwd=%2Fx%2FAlpha");
  });

  it("mounts xterm into a container element", () => {
    renderTerminal();
    expect(xtermInstance).not.toBeNull();
    expect(xtermInstance!.open).toHaveBeenCalled();
    expect(xtermInstance!.unicode.activeVersion).toBe("11");
  });

  it("pipes server output frames to xterm.write", () => {
    renderTerminal();
    act(() => {
      FakeWebSocket.instances[0]!.fireOpen();
      FakeWebSocket.instances[0]!.fireMessage({ type: "output", data: "hi\r\n" });
    });
    expect(xtermInstance!.write).toHaveBeenCalledWith("hi\r\n");
  });

  it("forwards xterm input back through the socket", () => {
    renderTerminal();
    act(() => FakeWebSocket.instances[0]!.fireOpen());
    xtermInstance!.inputCb?.("ls\n");
    expect(FakeWebSocket.instances[0]!.sent).toContain(
      JSON.stringify({ type: "input", data: "ls\n" }),
    );
  });

  it("disposes xterm on unmount", () => {
    const { unmount } = renderTerminal();
    unmount();
    expect(xtermInstance!.dispose).toHaveBeenCalled();
  });

  it("focuses xterm when the socket opens — guarantees an active cursor once the PTY is ready", () => {
    renderTerminal();
    const focusBefore = (xtermInstance!.focus as ReturnType<typeof vi.fn>).mock.calls.length;
    act(() => {
      FakeWebSocket.instances[0]!.fireOpen();
    });
    const focusAfter = (xtermInstance!.focus as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(focusAfter).toBeGreaterThan(focusBefore);
  });

  it("bubbles status transitions via onStatusChange", () => {
    const onStatus = vi.fn();
    render(
      <ThemeProvider>
        <Terminal cwd="/x/Alpha" onStatusChange={onStatus} />
      </ThemeProvider>,
    );
    // First call is "connecting" right after mount.
    expect(onStatus).toHaveBeenCalledWith("connecting");
    act(() => FakeWebSocket.instances[0]!.fireOpen());
    expect(onStatus).toHaveBeenLastCalledWith("open");
  });

  it("focuses xterm on mousedown anywhere in the terminal area (click-to-focus)", () => {
    const { container } = renderTerminal();
    const before = (xtermInstance!.focus as ReturnType<typeof vi.fn>).mock.calls.length;
    // The container is the second child (header + xterm container) inside the outer wrapper.
    const wrappers = container.querySelectorAll("[role='presentation']");
    expect(wrappers.length).toBeGreaterThan(0);
    wrappers[0]!.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    const after = (xtermInstance!.focus as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(after).toBeGreaterThan(before);
  });

  it("auto-types the autoCommand only after the first output frame (P3.5)", () => {
    render(
      <ThemeProvider>
        <Terminal cwd="/x/Alpha" autoCommand="claude --resume X" />
      </ThemeProvider>,
    );
    // Nothing sent before the socket opens.
    expect(FakeWebSocket.instances[0]!.sent).toEqual([]);
    // Open alone is not enough — the WS is up but the shell may not have
    // drawn its prompt yet. We hold off until real output arrives.
    act(() => FakeWebSocket.instances[0]!.fireOpen());
    expect(FakeWebSocket.instances[0]!.sent).toEqual([]);
    act(() =>
      FakeWebSocket.instances[0]!.fireMessage({ type: "output", data: "$ " }),
    );
    // Leads with \x15 (kill-line) to clear any partial input before typing.
    expect(FakeWebSocket.instances[0]!.sent).toContain(
      JSON.stringify({ type: "input", data: "\x15claude --resume X\n" }),
    );
  });

  it("does not auto-type without an autoCommand", () => {
    renderTerminal();
    act(() => FakeWebSocket.instances[0]!.fireOpen());
    act(() =>
      FakeWebSocket.instances[0]!.fireMessage({ type: "output", data: "$ " }),
    );
    expect(FakeWebSocket.instances[0]!.sent).toEqual([]);
  });
});
