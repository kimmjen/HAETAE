import Editor, { type OnMount } from "@monaco-editor/react";
import { useTheme } from "@/lib/theme";
import "@/lib/monaco-loader";

interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  onSave?: () => void;
  readOnly?: boolean;
}

export function MarkdownEditor({ value, onChange, onSave, readOnly }: MarkdownEditorProps) {
  const { theme } = useTheme();
  const editorTheme = theme === "dark" ? "vs-dark" : "vs";

  const handleMount: OnMount = (editor, monacoApi) => {
    if (onSave) {
      editor.addCommand(monacoApi.KeyMod.CtrlCmd | monacoApi.KeyCode.KeyS, onSave);
    }
  };

  return (
    <Editor
      value={value}
      defaultLanguage="markdown"
      theme={editorTheme}
      onChange={(next) => onChange(next ?? "")}
      onMount={handleMount}
      options={{
        readOnly,
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
        <div className="p-6 text-[11px] font-mono text-text-muted">Loading editor…</div>
      }
    />
  );
}
