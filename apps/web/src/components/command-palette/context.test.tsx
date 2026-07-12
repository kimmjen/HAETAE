import { act, render, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandPaletteProvider, useCommandPalette } from "./context";

describe("CommandPaletteProvider / useCommandPalette", () => {
  it("starts closed", () => {
    const { result } = renderHook(() => useCommandPalette(), {
      wrapper: CommandPaletteProvider,
    });
    expect(result.current.open).toBe(false);
  });

  it("openPalette sets open=true", () => {
    const { result } = renderHook(() => useCommandPalette(), {
      wrapper: CommandPaletteProvider,
    });
    act(() => result.current.openPalette());
    expect(result.current.open).toBe(true);
  });

  it("closePalette sets open=false", () => {
    const { result } = renderHook(() => useCommandPalette(), {
      wrapper: CommandPaletteProvider,
    });
    act(() => result.current.openPalette());
    act(() => result.current.closePalette());
    expect(result.current.open).toBe(false);
  });

  it("togglePalette flips state", () => {
    const { result } = renderHook(() => useCommandPalette(), {
      wrapper: CommandPaletteProvider,
    });
    act(() => result.current.togglePalette());
    expect(result.current.open).toBe(true);
    act(() => result.current.togglePalette());
    expect(result.current.open).toBe(false);
  });

  it("throws when used outside the provider", () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    expect(() => render(<Probe />)).toThrow();
    errorSpy.mockRestore();
  });
});

function Probe() {
  useCommandPalette();
  return null;
}
