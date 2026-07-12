import { createLazyFileRoute } from "@tanstack/react-router";
import { Route as DiffRoute } from "./diff";
import { DiffView } from "@/views/DiffView";

export const Route = createLazyFileRoute("/diff")({
  component: DiffPage,
});

function DiffPage() {
  const { left, right, path } = DiffRoute.useSearch();
  return <DiffView left={left} right={right} path={path} />;
}
