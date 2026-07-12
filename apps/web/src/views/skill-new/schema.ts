// @hookform/resolvers 5.2 의 zod 통합이 zod v4 API 와 미세하게 안 맞아서
// 위저드 스키마는 zod/v3 (zod 4 패키지에서 함께 제공) 으로 import.
// 다른 곳 (server zod, useSearch 등) 은 zod 기본(v4) 그대로 둠.
import { z } from "zod/v3";

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
