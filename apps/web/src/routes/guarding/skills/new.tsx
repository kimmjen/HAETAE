import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SkillNewView } from "@/views/SkillNewView";

const NewSearch = z.object({
  scope: z.string().optional(),
});

export const Route = createFileRoute("/guarding/skills/new")({
  validateSearch: NewSearch.parse,
  component: SkillNewView,
});
