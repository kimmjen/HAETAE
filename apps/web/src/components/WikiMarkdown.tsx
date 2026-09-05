import { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";

export interface TocEntry {
  level: number;
  text: string;
  id: string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function extractToc(markdown: string): TocEntry[] {
  return markdown
    .split("\n")
    .map((line) => {
      const m = line.match(/^(#{1,3})\s+(.+)/);
      if (!m) return null;
      const text = m[2].trim();
      return { level: m[1].length, text, id: slugify(text) };
    })
    .filter((e): e is TocEntry => e !== null);
}

/** Shared markdown renderer for wiki + topic pages — design-token styled,
 *  emits data-heading-id anchors so a TOC can scroll to headings. */
export function WikiMarkdown({ content }: { content: string }) {
  const idCounters = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    idCounters.current.clear();
  }, [content]);

  function makeId(text: string): string {
    const base = slugify(text);
    const count = (idCounters.current.get(base) ?? 0) + 1;
    idCounters.current.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  }

  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => {
          const id = makeId(String(children));
          return (
            <h1
              data-heading-id={id}
              className="text-[14px] font-black uppercase tracking-tight text-text-main mb-3 pb-1 border-b border-border-main scroll-mt-4"
            >
              {children}
            </h1>
          );
        },
        h2: ({ children }) => {
          const id = makeId(String(children));
          return (
            <h2
              data-heading-id={id}
              className="text-[12px] font-bold uppercase tracking-wide text-text-main mt-5 mb-2 scroll-mt-4"
            >
              {children}
            </h2>
          );
        },
        h3: ({ children }) => {
          const id = makeId(String(children));
          return (
            <h3
              data-heading-id={id}
              className="text-[11px] font-bold text-text-main mt-3 mb-1 scroll-mt-4"
            >
              {children}
            </h3>
          );
        },
        p: ({ children }) => (
          <p className="text-[11px] font-mono text-text-main leading-relaxed mb-2">{children}</p>
        ),
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => (
          <li className="text-[11px] font-mono text-text-main leading-relaxed">{children}</li>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            return (
              <pre className="bg-bg-primary border border-border-main p-2 text-[10px] font-mono text-text-main overflow-x-auto mb-2">
                <code>{children}</code>
              </pre>
            );
          }
          return (
            <code className="bg-bg-primary px-1 text-[10px] font-mono text-text-main">
              {children}
            </code>
          );
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-border-main pl-3 text-text-muted mb-2">
            {children}
          </blockquote>
        ),
        hr: () => <hr className="border-border-main my-3" />,
        strong: ({ children }) => <strong className="font-bold text-text-main">{children}</strong>,
        em: ({ children }) => <em className="italic text-text-muted">{children}</em>,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
