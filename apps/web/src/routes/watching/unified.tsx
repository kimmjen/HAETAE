import { createFileRoute } from "@tanstack/react-router";
import { UnifiedView } from "@/views/UnifiedView";

export const Route = createFileRoute("/watching/unified")({
  component: UnifiedView,
});
