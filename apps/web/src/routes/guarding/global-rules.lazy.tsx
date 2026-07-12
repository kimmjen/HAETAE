import { createLazyFileRoute } from "@tanstack/react-router";
import { Route as GlobalRulesRoute } from "./global-rules";
import { RulesView } from "@/views/RulesView";

export const Route = createLazyFileRoute("/guarding/global-rules")({
  component: GlobalRulesPage,
});

function GlobalRulesPage() {
  const { file } = GlobalRulesRoute.useSearch();
  const navigate = GlobalRulesRoute.useNavigate();
  return (
    <RulesView
      selectedPath={file ?? null}
      onSelect={(path) => navigate({ search: { file: path } })}
      scope="global"
      category="rules"
    />
  );
}
