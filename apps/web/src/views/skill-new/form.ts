import { createContext, useContext } from "react";
import type { WizardData, FieldErrors } from "./schema";

/** Shared wizard state for the step components (was react-hook-form context). */
export interface WizardForm {
  values: WizardData;
  errors: FieldErrors;
  setField: <K extends keyof WizardData>(key: K, value: WizardData[K]) => void;
  setOption: (key: keyof WizardData["options"], value: boolean) => void;
}

export const WizardFormContext = createContext<WizardForm | null>(null);

export function useWizardForm(): WizardForm {
  const ctx = useContext(WizardFormContext);
  if (!ctx) throw new Error("useWizardForm must be used within the wizard");
  return ctx;
}
