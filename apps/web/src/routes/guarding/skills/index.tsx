import { createFileRoute } from "@tanstack/react-router";

/**
 * Sync slice for the cross-scope Skills aggregation view (ADR 0007).
 * Editor lives in the lazy companion so Monaco stays out of the
 * initial bundle.
 */
export const Route = createFileRoute("/guarding/skills/")({});
