import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";

interface TerminalSearchBarProps {
  /** Find next match for the current query. */
  onNext: (query: string) => void;
  /** Find previous match for the current query. */
  onPrevious: (query: string) => void;
  /** Close the bar (Escape or × button). */
  onClose: () => void;
}

/**
 * Inline search overlay for the terminal. Pinned top-right, keeps focus
 * inside its input. Enter = next, Shift+Enter = previous, Escape closes.
 *
 * The actual matching is delegated to xterm's SearchAddon via the
 * callbacks; this component owns the input state and keystroke routing.
 */
export function TerminalSearchBar({ onNext, onPrevious, onClose }: TerminalSearchBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (query) onNext(query);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "Enter" && e.shiftKey && query) {
      e.preventDefault();
      onPrevious(query);
    }
  };

  return (
    <form
      onSubmit={submit}
      role="search"
      aria-label="Search terminal"
      className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-bg-elevated border border-border-main shadow-md px-2 py-1"
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
        placeholder="Find"
        aria-label="Search query"
        className="w-48 bg-transparent text-[12px] font-mono text-text-main placeholder:text-text-subtle outline-none"
      />
      <button
        type="button"
        onClick={() => query && onPrevious(query)}
        aria-label="Previous match"
        title="Previous (Shift+Enter)"
        className="p-0.5 text-text-muted hover:text-text-main hover:bg-bg-hover transition-colors"
      >
        <ChevronUp size={12} />
      </button>
      <button
        type="submit"
        aria-label="Next match"
        title="Next (Enter)"
        className="p-0.5 text-text-muted hover:text-text-main hover:bg-bg-hover transition-colors"
      >
        <ChevronDown size={12} />
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close search"
        title="Close (Esc)"
        className="p-0.5 text-text-muted hover:text-text-main hover:bg-bg-hover transition-colors"
      >
        <X size={12} />
      </button>
    </form>
  );
}
