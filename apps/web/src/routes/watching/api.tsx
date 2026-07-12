import { createFileRoute } from "@tanstack/react-router";
import { ApiCostView } from "@/views/ApiCostView";

export const Route = createFileRoute("/watching/api")({
  component: ApiCostView,
});
