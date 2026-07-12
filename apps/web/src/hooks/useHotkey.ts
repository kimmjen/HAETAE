import { useEffect } from "react";

interface UseHotkeyOptions {
  /** When false, the listener is not subscribed at all. Defaults to true. */
  enabled?: boolean;
}

/**
 * Subscribe a global keyboard shortcut.
 *
 * `combo` is a "+"-separated list. Modifier "mod" maps to Cmd on macOS and
 * Ctrl elsewhere. The handler runs even when focus is inside a text input,
 * because shortcuts like Cmd+K are expected to work everywhere — callers
 * that want a more conservative scope should compose this with their own
 * focus check or pass `{ enabled: false }`.
 *
 * Examples:
 *   useHotkey("mod+k", openPalette);
 *   useHotkey("escape", closePalette);
 *   useHotkey("mod+k", clearTerminal, { enabled: xtermFocused });
 */
export function useHotkey(
  combo: string,
  handler: (event: KeyboardEvent) => void,
  options: UseHotkeyOptions = {},
): void {
  const enabled = options.enabled ?? true;
  useEffect(() => {
    if (!enabled) return;
    const parsed = parseCombo(combo);
    const listener = (event: KeyboardEvent) => {
      if (!matchesCombo(event, parsed)) return;
      event.preventDefault();
      handler(event);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [combo, handler, enabled]);
}

interface ParsedCombo {
  key: string;
  needMod: boolean;
  needShift: boolean;
  needAlt: boolean;
}

function parseCombo(combo: string): ParsedCombo {
  const parts = combo.toLowerCase().split("+").map((p) => p.trim());
  const keyPart = parts.pop();
  if (!keyPart) {
    throw new Error(`Invalid hotkey combo: ${combo}`);
  }
  return {
    key: keyPart,
    needMod: parts.some((p) => p === "mod" || p === "cmd" || p === "ctrl"),
    needShift: parts.includes("shift"),
    needAlt: parts.includes("alt") || parts.includes("option"),
  };
}

function matchesCombo(event: KeyboardEvent, combo: ParsedCombo): boolean {
  const pressedMod = event.metaKey || event.ctrlKey;
  if (combo.needMod !== pressedMod) return false;
  if (combo.needShift !== event.shiftKey) return false;
  if (combo.needAlt !== event.altKey) return false;
  return event.key.toLowerCase() === combo.key;
}
