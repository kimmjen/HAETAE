import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const FileSearch = z.object({
  file: z.string().optional(),
});

/**
 * Sync slice for /projects/$slug. Search-param schema only — the
 * Monaco-importing component lives in the lazy sibling so the project
 * route does not pull the editor into the initial bundle.
 */
export const Route = createFileRoute("/projects/$slug")({
  validateSearch: FileSearch.parse,
});
