import { createFileRoute } from "@tanstack/react-router";
import { NotebooksView } from "@/views/NotebooksView";

export const Route = createFileRoute("/research/notebooks/")({
  component: NotebooksView,
});
