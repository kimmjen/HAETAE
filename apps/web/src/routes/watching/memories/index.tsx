import { createFileRoute } from "@tanstack/react-router";
import { MemoriesView } from "@/views/MemoriesView";

export const Route = createFileRoute("/watching/memories/")({
  component: MemoriesView,
});
