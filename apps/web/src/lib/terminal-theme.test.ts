import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTerminalTheme } from "./terminal-theme";

describe("buildTerminalTheme", () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement("div");
    document.body.appendChild(root);
    // Apply a small subset of tokens for assertion. The real --color-*
    // values resolve through @theme + CSS at runtime; here we set them
    // directly so getComputedStyle returns deterministic strings.
    root.style.setProperty("--color-terminal-bg", "#0a0a0a");
    root.style.setProperty("--color-terminal-fg", "#f5f5f1");
    root.style.setProperty("--color-terminal-cursor", "#2563a8");
    root.style.setProperty("--color-terminal-selection", "#232328");
    root.style.setProperty("--color-ansi-1", "#c83232");
    root.style.setProperty("--color-ansi-2", "#4a8c4a");
    root.style.setProperty("--color-ansi-9", "#e85050");
  });

  afterEach(() => {
    root.remove();
  });

  it("reads bg / fg / cursor / selection from the design tokens", () => {
    const theme = buildTerminalTheme(root);
    expect(theme.background).toBe("#0a0a0a");
    expect(theme.foreground).toBe("#f5f5f1");
    expect(theme.cursor).toBe("#2563a8");
    expect(theme.selectionBackground).toBe("#232328");
  });

  it("maps the 16 ANSI tokens to xterm's named slots", () => {
    const theme = buildTerminalTheme(root);
    expect(theme.red).toBe("#c83232");
    expect(theme.green).toBe("#4a8c4a");
    expect(theme.brightRed).toBe("#e85050");
  });

  it("defaults to document.documentElement when no element is passed", () => {
    // smoke: shouldn't throw, returns an object with the xterm fields
    const theme = buildTerminalTheme();
    expect(theme).toHaveProperty("background");
    expect(theme).toHaveProperty("red");
    expect(theme).toHaveProperty("brightWhite");
  });
});
