import { DiffEditor } from "@monaco-editor/react";
import { useTheme } from "@/lib/theme";
import "@/lib/monaco-loader";

interface MarkdownDiffEditorProps {
  original: string;
  modified: string;
}

export function MarkdownDiffEditor({ original, modified }: MarkdownDiffEditorProps) {
  const { theme } = useTheme();
  const editorTheme = theme === "dark" ? "vs-dark" : "vs";

  return (
    <DiffEditor
      original={original}
      modified={modified}
      language="markdown"
      theme={editorTheme}
      options={{
        readOnly: true,
        renderSideBySide: true,
        minimap: { enabled: false },
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
        fontSize: 13,
        lineHeight: 1.6,
        wordWrap: "on",
        scrollBeyondLastLine: false,
        renderLineHighlight: "all",
        smoothScrolling: true,
        padding: { top: 16, bottom: 16 },
      }}
      loading={
        <div className="p-6 text-[11px] font-mono text-text-muted">Loading diff…</div>
      }
    />
  );
}
