import { createFileRoute } from "@tanstack/react-router";
import { OverviewView } from "@/views/OverviewView";

export const Route = createFileRoute("/watching/overview")({
  component: OverviewView,
});
