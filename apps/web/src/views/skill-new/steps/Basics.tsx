import { TARGET_DIRS } from "../schema";
import { useWizardForm } from "../form";
import { buildSkillPath } from "@/lib/skill-template";

export function BasicsStep() {
  const { values, errors, setField } = useWizardForm();
  const previewPath =
    values.name && values.name.length > 0
      ? buildSkillPath(values.directory, values.name)
      : `${values.directory}/...`;

  return (
    <div className="space-y-5 p-6">
      <div className="space-y-2">
        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
          Target directory
        </label>
        <div className="flex gap-1">
          {TARGET_DIRS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setField("directory", d)}
              className={`px-3 py-1.5 text-[10px] font-bold uppercase border transition-colors ${
                d === values.directory
                  ? "bg-accent text-text-on-accent border-accent"
                  : "bg-bg-primary text-text-main border-border-main hover:bg-bg-hover"
              }`}
            >
              {d}/
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
          File name
        </label>
        <input
          type="text"
          spellCheck={false}
          placeholder="commit-helper"
          value={values.name}
          onChange={(e) => setField("name", e.target.value)}
          className="w-full bg-bg-secondary text-text-main border border-border-main px-3 py-2 text-[12px] font-mono focus:bg-bg-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-text-subtle"
        />
        <p className="text-[10px] font-mono text-text-subtle">
          Saved to: <span className="text-text-muted">{previewPath}</span>
        </p>
        {errors.name && (
          <p className="text-[10px] font-mono text-danger">{errors.name}</p>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black text-text-muted uppercase tracking-widest">
          Description (one sentence)
        </label>
        <input
          type="text"
          value={values.description}
          onChange={(e) => setField("description", e.target.value)}
          placeholder="What this skill does, in one line."
          className="w-full bg-bg-secondary text-text-main border border-border-main px-3 py-2 text-[12px] font-mono focus:bg-bg-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-text-subtle"
        />
        <p className="text-[10px] font-mono text-text-subtle">
          Good example: <span className="text-text-muted">"Guides writing commit messages in Conventional Commits format."</span>
        </p>
        {errors.description && (
          <p className="text-[10px] font-mono text-danger">{errors.description}</p>
        )}
      </div>
    </div>
  );
}
