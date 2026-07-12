import { createFileRoute } from "@tanstack/react-router";
import { SessionsListView } from "@/views/SessionsListView";

export const Route = createFileRoute("/watching/sessions/")({
  component: SessionsListView,
});
