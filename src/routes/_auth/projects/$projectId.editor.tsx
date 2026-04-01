import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { loadProject } from "@/features/projects/project-queries";
import { projectKeys } from "@/features/projects/query-keys";

const EditorView = lazy(() =>
	import("@/features/editor/editor-view").then((m) => ({
		default: m.EditorView,
	})),
);

export const Route = createFileRoute("/_auth/projects/$projectId/editor")({
	loader: async ({ params, context: { queryClient } }) => {
		return queryClient.ensureQueryData({
			queryKey: projectKeys.project(params.projectId),
			queryFn: () => loadProject({ data: params.projectId }),
		});
	},
	component: EditorPage,
	pendingComponent: EditorPending,
});

function EditorPage() {
	const { projectId } = Route.useParams();
	const { data } = useQuery({
		queryKey: projectKeys.project(projectId),
		queryFn: () => loadProject({ data: projectId }),
	});
	// biome-ignore lint/style/noNonNullAssertion: loader always seeds this value before component renders
	const data_ = data!;

	return (
		<div className="h-screen flex flex-col bg-zinc-950">
			{/* Header */}
			<div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-900">
				<Link
					to="/projects/$projectId"
					params={{ projectId }}
					search={{
						scene: undefined,
						shot: undefined,
						from: undefined,
						to: undefined,
						mediaTab: undefined,
					}}
					className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
				>
					<ArrowLeft size={14} />
					Back to project
				</Link>
				<div className="h-4 w-px bg-zinc-700" />
				<h1 className="text-sm font-medium text-zinc-200 truncate">
					{data_.project.name || "Untitled"} — Editor
				</h1>
			</div>

			{/* Editor */}
			<div className="flex-1 min-h-0">
				<Suspense
					fallback={
						<div className="flex items-center justify-center h-full">
							<Loader2 className="animate-spin text-zinc-500" size={24} />
						</div>
					}
				>
					<EditorView
						scenes={data_.scenes}
						shots={data_.shots}
						assets={data_.assets}
						shotVideoAssets={data_.shotVideoAssets}
						transitionVideos={data_.transitionVideos}
						voiceovers={data_.voiceovers}
						backgroundMusic={data_.backgroundMusic}
						projectId={projectId}
						savedEditorState={data_.project.editorState}
					/>
				</Suspense>
			</div>
		</div>
	);
}

function EditorPending() {
	return (
		<div className="h-screen flex items-center justify-center bg-zinc-950">
			<Loader2 className="animate-spin text-zinc-500" size={24} />
		</div>
	);
}
