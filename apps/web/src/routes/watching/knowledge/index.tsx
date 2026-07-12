import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeView } from "@/views/KnowledgeView";

export const Route = createFileRoute("/watching/knowledge/")({
  component: KnowledgeView,
});
