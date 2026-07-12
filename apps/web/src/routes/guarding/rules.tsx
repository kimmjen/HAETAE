import { createFileRoute } from "@tanstack/react-router";

/**
 * Sync slice for the per-project Rules aggregation view (ADR 0007).
 * The Monaco-importing component lives in the lazy companion so the
 * route does not pull the editor into the initial bundle.
 */
export const Route = createFileRoute("/guarding/rules")({});
