import type { ITheme } from "@xterm/xterm";

/**
 * Build an xterm theme from the design tokens. Resolved at call time so
 * a theme toggle (light ↔ dark) can rebuild — currently only `bg/fg/cursor/
 * selection` change between themes; the ANSI 16 are theme-independent
 * (ADR 0008) and stay the same.
 */
export function buildTerminalTheme(root: HTMLElement = document.documentElement): ITheme {
  const get = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();

  return {
    background: get("--color-terminal-bg"),
    foreground: get("--color-terminal-fg"),
    cursor: get("--color-terminal-cursor"),
    cursorAccent: get("--color-terminal-bg"),
    selectionBackground: get("--color-terminal-selection"),

    black:         get("--color-ansi-0"),
    red:           get("--color-ansi-1"),
    green:         get("--color-ansi-2"),
    yellow:        get("--color-ansi-3"),
    blue:          get("--color-ansi-4"),
    magenta:       get("--color-ansi-5"),
    cyan:          get("--color-ansi-6"),
    white:         get("--color-ansi-7"),
    brightBlack:   get("--color-ansi-8"),
    brightRed:     get("--color-ansi-9"),
    brightGreen:   get("--color-ansi-10"),
    brightYellow:  get("--color-ansi-11"),
    brightBlue:    get("--color-ansi-12"),
    brightMagenta: get("--color-ansi-13"),
    brightCyan:    get("--color-ansi-14"),
    brightWhite:   get("--color-ansi-15"),
  };
}
