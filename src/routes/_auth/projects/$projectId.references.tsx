import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ReferencesWorkspace } from "@/features/projects/components/references-workspace";
import { loadProject } from "@/features/projects/project-queries";
import { projectKeys } from "@/features/projects/query-keys";

export const Route = createFileRoute("/_auth/projects/$projectId/references")({
	loader: async ({ params, context: { queryClient } }) =>
		queryClient.ensureQueryData({
			queryKey: projectKeys.project(params.projectId),
			queryFn: () => loadProject({ data: params.projectId }),
		}),
	component: ProjectReferencesPage,
});

function ProjectReferencesPage() {
	const { projectId } = Route.useParams();
	const { data } = useQuery({
		queryKey: projectKeys.project(projectId),
		queryFn: () => loadProject({ data: projectId }),
	});
	// biome-ignore lint/style/noNonNullAssertion: route loader preloads the query
	const project = data!.project;

	return (
		<ReferencesWorkspace projectId={project.id} projectName={project.name} />
	);
}
