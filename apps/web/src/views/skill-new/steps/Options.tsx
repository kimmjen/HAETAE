import { Controller, useFormContext } from "react-hook-form";
import type { WizardData } from "../schema";

const TOGGLES: Array<{
  key: keyof WizardData["options"];
  label: string;
  description: string;
}> = [
  {
    key: "disableModelInvocation",
    label: "disable-model-invocation",
    description: "Restricts the model from invoking this skill on its own.",
  },
  {
    key: "userInvocable",
    label: "user-invocable",
    description: "Lets the user invoke it directly as a slash command.",
  },
];

export function OptionsStep() {
  const { control } = useFormContext<WizardData>();
  return (
    <div className="space-y-3 p-6">
      <p className="text-[11px] font-mono text-text-muted">
        Options added to the frontmatter. Turn on only what you need.
      </p>
      {TOGGLES.map((toggle) => (
        <Controller
          key={toggle.key}
          name={`options.${toggle.key}`}
          control={control}
          render={({ field }) => (
            <label className="flex items-start gap-3 px-3 py-3 border border-border-subtle bg-bg-secondary cursor-pointer hover:bg-bg-hover transition-colors">
              <input
                type="checkbox"
                checked={field.value}
                onChange={(e) => field.onChange(e.target.checked)}
                className="mt-0.5 w-3.5 h-3.5 accent-accent"
              />
              <span className="flex-1 min-w-0">
                <span className="block text-[11px] font-mono font-bold text-text-main">
                  {toggle.label}
                </span>
                <span className="block text-[10px] font-mono text-text-muted mt-1">
                  {toggle.description}
                </span>
              </span>
            </label>
          )}
        />
      ))}
    </div>
  );
}
