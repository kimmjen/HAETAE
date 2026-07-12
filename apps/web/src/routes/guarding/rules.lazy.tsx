import { createLazyFileRoute } from "@tanstack/react-router";
import { AggregatedRulesView } from "@/views/AggregatedRulesView";

export const Route = createLazyFileRoute("/guarding/rules")({
  component: RulesPage,
});

function RulesPage() {
  return (
    <AggregatedRulesView
      title="Rules"
      emptyMessage="No .claude/CLAUDE.md or rules/ found in any registered project."
      category="rules"
      includeGlobal={false}
      newSkillTargetScope="first-project"
    />
  );
}
