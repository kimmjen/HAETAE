import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const DiffSearch = z.object({
  left: z.string().min(1),
  right: z.string().min(1),
  path: z.string().min(1),
});

/**
 * Sync slice — search-param schema only. The Monaco diff editor lives
 * in the lazy companion so this route does not pull it into the main
 * bundle.
 */
export const Route = createFileRoute("/diff")({
  validateSearch: DiffSearch.parse,
});
