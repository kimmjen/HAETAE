import { useEffect, useState } from "react";

/**
 * True while focus is inside an xterm instance.
 *
 * xterm.js delegates keyboard input to a hidden helper textarea
 * (`.xterm-helper-textarea`) — that's the element `document.activeElement`
 * resolves to once the user clicks into the terminal. Watching focusin /
 * focusout at document level lets every consumer share the same signal
 * without each terminal having to publish events.
 *
 * Used by Cmd+K wiring: when xterm is focused, the keystroke clears the
 * terminal; otherwise it opens the command palette.
 */
export function useXtermFocus(): boolean {
  const [focused, setFocused] = useState(() => isXtermElement(getActiveElement()));

  useEffect(() => {
    const update = () => setFocused(isXtermElement(getActiveElement()));
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);

  return focused;
}

function getActiveElement(): Element | null {
  if (typeof document === "undefined") return null;
  return document.activeElement;
}

function isXtermElement(el: Element | null): boolean {
  if (!el) return false;
  return el.closest(".xterm") !== null;
}
