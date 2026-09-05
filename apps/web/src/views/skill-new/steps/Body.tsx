import { assembleFile } from "@/lib/skill-template";
import { useWizardForm } from "../form";

export function BodyStep() {
  const { values, errors, setField } = useWizardForm();

  const preview = assembleFile({
    name: values.name || "untitled",
    description: values.description || "",
    options: values.options,
    body: values.body || "",
  });

  return (
    <div className="grid grid-cols-2 gap-0 border-t border-border-subtle">
      <div className="p-6 space-y-2 border-r border-border-subtle">
        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
          Body (markdown)
        </label>
        <textarea
          value={values.body}
          onChange={(e) => setField("body", e.target.value)}
          rows={18}
          spellCheck={false}
          placeholder="# Heading&#10;&#10;Write the body in markdown."
          className="w-full bg-bg-secondary text-text-main border border-border-main px-3 py-2 text-[12px] font-mono leading-relaxed focus:bg-bg-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-text-subtle resize-y"
        />
        {errors.body && (
          <p className="text-[10px] font-mono text-danger">{errors.body}</p>
        )}
      </div>
      <div className="p-6 space-y-2 bg-bg-elevated">
        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
          Preview (final file)
        </label>
        <pre className="text-[11px] font-mono leading-relaxed text-text-main whitespace-pre-wrap break-words bg-bg-primary border border-border-subtle p-3 max-h-[400px] overflow-y-auto">
          {preview}
        </pre>
      </div>
    </div>
  );
}
