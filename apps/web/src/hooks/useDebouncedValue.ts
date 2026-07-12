import { useEffect, useState } from "react";

/**
 * Returns `value` after `delayMs` of stability. Useful for tying expensive
 * effects (network calls, heavy filtering) to user input without firing on
 * every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}
