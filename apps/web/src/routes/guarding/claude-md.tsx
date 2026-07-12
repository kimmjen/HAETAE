import { createFileRoute } from "@tanstack/react-router";

/**
 * Sync slice for the CLAUDE.md management page. Monaco editor lives in
 * the lazy companion so the route does not pull the editor into the
 * initial bundle.
 */
export const Route = createFileRoute("/guarding/claude-md")({});
