import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { assembleFile, buildSkillPath } from "@/lib/skill-template";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FileExistsError, useCreateFile } from "@/hooks/useCreateFile";
import { Route as NewSkillRoute } from "@/routes/guarding/skills/new";
import { STEP_FIELDS, wizardSchema, type WizardData } from "./schema";
import { Stepper } from "./Stepper";
import { BasicsStep } from "./steps/Basics";
import { OptionsStep } from "./steps/Options";
import { BodyStep } from "./steps/Body";

const STEP_ORDER = ["basics", "options", "body"] as const;
type StepId = (typeof STEP_ORDER)[number];

const DEFAULTS: WizardData = {
  directory: "skills",
  name: "",
  description: "",
  options: {
    disableModelInvocation: false,
    userInvocable: false,
  },
  body: "# Untitled\n\nWrite the body here.\n",
};

export function SkillWizard() {
  const navigate = useNavigate();
  const { scope } = NewSkillRoute.useSearch();
  const create = useCreateFile(scope ?? "global");
  const form = useForm<WizardData>({
    resolver: zodResolver(wizardSchema),
    defaultValues: DEFAULTS,
    mode: "onTouched",
  });

  const [stepIndex, setStepIndex] = useState(0);
  const [cancelOpen, setCancelOpen] = useState(false);
  const stepId: StepId = STEP_ORDER[stepIndex]!;

  const goNext = async () => {
    const ok = await form.trigger(STEP_FIELDS[stepId]);
    if (ok) setStepIndex((i) => Math.min(i + 1, STEP_ORDER.length - 1));
  };

  const goBack = () => setStepIndex((i) => Math.max(0, i - 1));

  const navigateBackToRules = (file?: string) => {
    if (scope && scope !== "global") {
      navigate({
        to: "/projects/$slug",
        params: { slug: scope },
        search: file ? { file } : {},
      });
      return;
    }
    // ADR 0007: global rules and skills live on different routes.
    // Cancel (file undefined) defaults to global-rules; on success the
    // file path determines which view shows the new entry.
    if (file && file.startsWith("skills/")) {
      navigate({ to: "/guarding/skills", search: {} });
      return;
    }
    navigate({
      to: "/guarding/global-rules",
      search: file ? { file } : {},
    });
  };

  const onSubmit = form.handleSubmit((data) => {
    const path = buildSkillPath(data.directory, data.name);
    const content = assembleFile(data);
    create.mutate(
      { path, content },
      {
        onSuccess: (created) => {
          toast.success(`Created ${created.path}`);
          navigateBackToRules(created.path);
        },
        onError: (err) => {
          if (err instanceof FileExistsError) {
            toast.error(`Already exists: ${err.path}`, {
              description: "Choose a different name, or edit the existing file.",
            });
            return;
          }
          if (err instanceof ApiError) {
            toast.error(`Create failed (HTTP ${err.status})`);
            return;
          }
          toast.error("Create failed", { description: err.message });
        },
      },
    );
  });

  const isLast = stepIndex === STEP_ORDER.length - 1;
  const submitting = create.isPending;
  const { isDirty } = form.formState;

  const handleCancel = () => {
    if (submitting) return;
    if (isDirty) {
      setCancelOpen(true);
      return;
    }
    navigateBackToRules();
  };

  const confirmCancel = () => {
    navigateBackToRules();
  };

  return (
    <FormProvider {...form}>
      <form
        onSubmit={onSubmit}
        className="max-w-4xl border border-border-main bg-bg-primary"
      >
        <div className="bg-bg-secondary border-b border-border-main px-4 py-2 text-[11px] font-bold uppercase text-text-main">
          New rule / skill
          {scope && scope !== "global" && (
            <span className="ml-2 text-text-muted font-mono normal-case">
              · target: {scope}
            </span>
          )}
        </div>

        <Stepper current={stepIndex} />

        {stepId === "basics" && <BasicsStep />}
        {stepId === "options" && <OptionsStep />}
        {stepId === "body" && <BodyStep />}

        <div className="flex justify-between items-center gap-2 px-6 py-4 border-t border-border-subtle bg-bg-secondary">
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="px-4 py-2 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors disabled:cursor-not-allowed"
          >
            Cancel
          </button>

          <div className="flex gap-2">
            {stepIndex > 0 && (
              <button
                type="button"
                onClick={goBack}
                disabled={submitting}
                className="px-4 py-2 text-[10px] font-bold uppercase border border-border-main bg-bg-primary text-text-main hover:bg-bg-hover transition-colors disabled:cursor-not-allowed"
              >
                ← Back
              </button>
            )}
            {!isLast && (
              <button
                type="button"
                onClick={goNext}
                className="px-4 py-2 text-[10px] font-bold uppercase bg-accent text-text-on-accent hover:bg-accent-hover transition-colors"
              >
                Next →
              </button>
            )}
            {isLast && (
              <button
                type="submit"
                disabled={submitting}
                className={`px-4 py-2 text-[10px] font-bold uppercase transition-colors ${
                  submitting
                    ? "bg-bg-secondary text-text-subtle border border-border-subtle cursor-not-allowed"
                    : "bg-accent text-text-on-accent hover:bg-accent-hover"
                }`}
              >
                {submitting ? "Creating…" : "Create"}
              </button>
            )}
          </div>
        </div>
      </form>
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Discard changes?"
        description="Your in-progress content will be lost. Discard it?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="danger"
        onConfirm={confirmCancel}
      />
    </FormProvider>
  );
}
