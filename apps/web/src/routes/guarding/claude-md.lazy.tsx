import { createLazyFileRoute } from "@tanstack/react-router";
import { ClaudeMdView } from "@/views/ClaudeMdView";

export const Route = createLazyFileRoute("/guarding/claude-md")({
  component: ClaudeMdView,
});
