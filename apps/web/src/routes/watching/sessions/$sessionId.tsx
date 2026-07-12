import { createFileRoute } from "@tanstack/react-router";
import { SessionDetailView } from "@/views/SessionDetailView";

export const Route = createFileRoute("/watching/sessions/$sessionId")({
  component: SessionRoute,
});

function SessionRoute() {
  const { sessionId } = Route.useParams();
  return <SessionDetailView sessionId={sessionId} />;
}
