import { createFileRoute } from "@tanstack/react-router";
import { GraphView } from "@/views/GraphView";

export const Route = createFileRoute("/watching/graph/")({
  component: GraphView,
});
