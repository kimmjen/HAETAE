import { createLazyFileRoute } from "@tanstack/react-router";
import { Route as ProjectRoute } from "./$slug";
import { ProjectRulesView } from "@/views/ProjectRulesView";

export const Route = createLazyFileRoute("/projects/$slug")({
  component: ProjectPage,
});

function ProjectPage() {
  const { slug } = ProjectRoute.useParams();
  const { file } = ProjectRoute.useSearch();
  const navigate = ProjectRoute.useNavigate();
  return (
    <ProjectRulesView
      slug={slug}
      selectedPath={file ?? null}
      onSelect={(path) => navigate({ search: { file: path } })}
    />
  );
}
