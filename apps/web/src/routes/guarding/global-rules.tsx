import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const FileSearch = z.object({
  file: z.string().optional(),
});

/**
 * Sync slice for the user-global ~/.claude/ rules view (ADR 0007 →
 * "Global Rules" nav). Editor lives in the lazy companion.
 */
export const Route = createFileRoute("/guarding/global-rules")({
  validateSearch: FileSearch.parse,
});
