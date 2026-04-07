import { createFileRoute } from "@tanstack/react-router";
import { ReferencesWorkspace } from "@/features/projects/components/references-workspace";
import { listCharacters } from "@/features/projects/character-actions";
import { listLocations } from "@/features/projects/location-actions";
import { loadProject } from "@/features/projects/project-queries";
import { projectKeys } from "@/features/projects/query-keys";

export const Route = createFileRoute("/_auth/projects/$projectId/references")({
	loader: async ({ params, context: { queryClient } }) => {
		const projectData = await queryClient.ensureQueryData({
			queryKey: projectKeys.project(params.projectId),
			queryFn: () => loadProject({ data: params.projectId }),
		});

		const [characters, locations] = await Promise.all([
			listCharacters({ data: { projectId: params.projectId } }),
			listLocations({ data: { projectId: params.projectId } }),
		]);

		return {
			...projectData,
			characters,
			locations,
		};
	},
	component: ProjectReferencesPage,
});

function ProjectReferencesPage() {
	const data = Route.useLoaderData();
	const project = data.project;

	return (
		<ReferencesWorkspace
			projectId={project.id}
			projectName={project.name}
			initialCharacters={data.characters}
			initialLocations={data.locations}
		/>
	);
}
