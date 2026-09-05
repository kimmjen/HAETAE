import { z } from "zod";

const NAME_PATTERN = /^[a-z0-9_-]+$/;

export const TARGET_DIRS = ["skills", "rules", "agents", "commands"] as const;

export const wizardSchema = z.object({
  directory: z.enum(TARGET_DIRS),
  name: z
    .string()
    .min(1, "Enter a name.")
    .max(80, "80 characters max.")
    .regex(NAME_PATTERN, "Lowercase letters, digits, -, and _ only."),
  description: z
    .string()
    .min(1, "Describe what it does in one sentence.")
    .max(200, "200 characters max."),
  options: z.object({
    disableModelInvocation: z.boolean(),
    userInvocable: z.boolean(),
  }),
  body: z.string().min(1, "Write the body."),
});

export type WizardData = z.infer<typeof wizardSchema>;

export const STEP_FIELDS = {
  basics: ["directory", "name", "description"] as const,
  options: ["options.disableModelInvocation", "options.userInvocable"] as const,
  body: ["body"] as const,
};

/** Field errors keyed by dot-path (e.g. "name", "options.userInvocable"). */
export type FieldErrors = Partial<Record<string, string>>;

/**
 * Validate the whole form (or just `fields` for per-step gating) and return
 * the first message per errored path. Replaces react-hook-form's resolver +
 * trigger — the wizard has 5 fields, so a safeParse pass is all it needed.
 */
export function validate(values: WizardData, fields?: readonly string[]): FieldErrors {
  const result = wizardSchema.safeParse(values);
  if (result.success) return {};
  const errs: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    if (fields && !fields.some((f) => path === f || path.startsWith(`${f}.`))) continue;
    if (!(path in errs)) errs[path] = issue.message;
  }
  return errs;
}
