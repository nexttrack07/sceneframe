import { createFileRoute, Outlet } from "@tanstack/react-router";
import { loadProject } from "@/features/projects/project-queries";
import { projectKeys } from "@/features/projects/query-keys";

// ---------------------------------------------------------------------------
// Layout route — parent for all /projects/$projectId/* routes.
// Runs the loader so data is seeded for every child (index, editor, etc.).
// Renders <Outlet /> so child routes paint their own UI.
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/_auth/projects/$projectId")({
	loader: async ({ params, context: { queryClient } }) => {
		return queryClient.ensureQueryData({
			queryKey: projectKeys.project(params.projectId),
			queryFn: () => loadProject({ data: params.projectId }),
		});
	},
	component: () => <Outlet />,
});
