import { createFileRoute } from "@tanstack/react-router";
import { LocalUsageView } from "@/views/LocalUsageView";

export const Route = createFileRoute("/watching/local")({
  component: LocalUsageView,
});
