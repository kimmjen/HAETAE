import { createLazyFileRoute } from "@tanstack/react-router";
import { AggregatedRulesView } from "@/views/AggregatedRulesView";

export const Route = createLazyFileRoute("/guarding/skills/")({
  component: SkillsPage,
});

function SkillsPage() {
  return (
    <AggregatedRulesView
      title="Skills"
      emptyMessage="No skills/ in any registered scope. Create a new skill above, or add one directly under ~/.claude/skills/."
      category="skills"
      includeGlobal
      newSkillTargetScope="global"
    />
  );
}
