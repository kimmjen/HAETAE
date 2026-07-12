import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const TerminalSearch = z.object({
  cwd: z.string().optional(),
  /** Shell command auto-typed into the spawned tab once the PTY is ready.
      Pages link with `navigate({ to, search: { cwd, autoCommand: 'claude' }})`
      to drop the user straight into a session. */
  autoCommand: z.string().optional(),
});

/**
 * Sync slice — search-param schema only. xterm.js + addons live in the
 * lazy companion so Phase 3's terminal chunk stays out of the initial
 * bundle (same pattern as guarding/rules → Monaco).
 */
export const Route = createFileRoute("/working/terminal")({
  validateSearch: TerminalSearch.parse,
});
