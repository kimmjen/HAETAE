import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useXtermFocus } from "./useXtermFocus";

function fakeXtermDom(): HTMLTextAreaElement {
  const xterm = document.createElement("div");
  xterm.className = "xterm";
  const helper = document.createElement("textarea");
  helper.className = "xterm-helper-textarea";
  xterm.appendChild(helper);
  document.body.appendChild(xterm);
  return helper;
}

describe("useXtermFocus", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("starts false when nothing inside .xterm has focus", () => {
    const { result } = renderHook(() => useXtermFocus());
    expect(result.current).toBe(false);
  });

  it("flips true when an .xterm descendant gains focus", () => {
    const helper = fakeXtermDom();
    const { result } = renderHook(() => useXtermFocus());
    act(() => {
      helper.focus();
      // jsdom focus() doesn't always emit focusin synchronously — fire it.
      helper.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(result.current).toBe(true);
  });

  it("flips back to false when focus leaves the .xterm subtree", () => {
    const helper = fakeXtermDom();
    const outside = document.createElement("input");
    document.body.appendChild(outside);
    const { result } = renderHook(() => useXtermFocus());
    act(() => {
      helper.focus();
      helper.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(result.current).toBe(true);
    act(() => {
      outside.focus();
      outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    });
    expect(result.current).toBe(false);
  });
});
