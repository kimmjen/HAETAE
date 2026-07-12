import { Fragment } from "react";

const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;

/** `[[slug]]` → slug, `[[slug|alias]]` → alias. */
function linkLabel(inner: string): string {
  const pipe = inner.indexOf("|");
  return pipe >= 0 ? inner.slice(pipe + 1).trim() : inner.trim();
}

/**
 * Renders note prose with inline `[[slug]]` wikilinks styled (brackets dropped,
 * accent color) instead of shown raw. Not clickable — there's no per-note web
 * route to target — so this is presentation only. Returns a span so it can sit
 * inside a <p> or <pre>.
 */
export function NoteText({ content, className }: { content: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  WIKILINK_RE.lastIndex = 0;
  while ((m = WIKILINK_RE.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    parts.push(
      <span key={m.index} className="text-accent">
        {linkLabel(m[1])}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));

  return (
    <span className={className}>
      {parts.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </span>
  );
}
