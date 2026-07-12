import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useHotkey } from "./useHotkey";

function dispatchKeydown(init: KeyboardEventInit) {
  window.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
}

describe("useHotkey", () => {
  it("fires when the combo matches (mod+k)", () => {
    const handler = vi.fn();
    renderHook(() => useHotkey("mod+k", handler));
    dispatchKeydown({ key: "k", metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("matches Ctrl too on non-mac (mod accepts either)", () => {
    const handler = vi.fn();
    renderHook(() => useHotkey("mod+k", handler));
    dispatchKeydown({ key: "k", ctrlKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not fire when the modifier is missing", () => {
    const handler = vi.fn();
    renderHook(() => useHotkey("mod+k", handler));
    dispatchKeydown({ key: "k" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not fire on a different key", () => {
    const handler = vi.fn();
    renderHook(() => useHotkey("mod+k", handler));
    dispatchKeydown({ key: "j", metaKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("respects shift in the combo", () => {
    const handler = vi.fn();
    renderHook(() => useHotkey("mod+shift+p", handler));
    dispatchKeydown({ key: "p", metaKey: true });
    expect(handler).not.toHaveBeenCalled();
    dispatchKeydown({ key: "p", metaKey: true, shiftKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("matches a non-modified key like Escape", () => {
    const handler = vi.fn();
    renderHook(() => useHotkey("escape", handler));
    dispatchKeydown({ key: "Escape" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes on unmount", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useHotkey("mod+k", handler));
    unmount();
    dispatchKeydown({ key: "k", metaKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not subscribe when enabled is false", () => {
    const handler = vi.fn();
    renderHook(() => useHotkey("mod+k", handler, { enabled: false }));
    dispatchKeydown({ key: "k", metaKey: true });
    expect(handler).not.toHaveBeenCalled();
  });

  it("re-subscribes when enabled flips true", () => {
    const handler = vi.fn();
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useHotkey("mod+k", handler, { enabled }),
      { initialProps: { enabled: false } },
    );
    dispatchKeydown({ key: "k", metaKey: true });
    expect(handler).not.toHaveBeenCalled();
    rerender({ enabled: true });
    dispatchKeydown({ key: "k", metaKey: true });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
