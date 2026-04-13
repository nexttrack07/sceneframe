import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Check, Film, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScriptWorkshop } from "@/features/projects/components/script-workshop";
import { Storyboard } from "@/features/projects/components/storyboard";
import type { ShotMediaTab } from "@/features/projects/components/studio/shot-media-tabs";
import { deleteProject } from "@/features/projects/project-mutations";
import { loadProject } from "@/features/projects/project-queries";
import { projectKeys } from "@/features/projects/query-keys";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/_auth/projects/$projectId/")({
	validateSearch: (search: Record<string, unknown>) => {
		const mediaTab =
			search.mediaTab === "images" ||
			search.mediaTab === "video" ||
			search.mediaTab === "graphics"
				? (search.mediaTab as ShotMediaTab)
				: undefined;

		return {
			scene: typeof search.scene === "string" ? search.scene : undefined,
			shot: typeof search.shot === "string" ? search.shot : undefined,
			from: typeof search.from === "string" ? search.from : undefined,
			to: typeof search.to === "string" ? search.to : undefined,
			mediaTab,
		};
	},
	loader: async ({ params, context: { queryClient } }) => {
		return queryClient.ensureQueryData({
			queryKey: projectKeys.project(params.projectId),
			queryFn: () => loadProject({ data: params.projectId }),
		});
	},
	component: ProjectPage,
	pendingComponent: ProjectPending,
	errorComponent: ProjectError,
});

// ---------------------------------------------------------------------------
// Page — switches between Workshop and Storyboard
// ---------------------------------------------------------------------------

function ProjectPage() {
	const { projectId } = Route.useParams();
	const loaderData = Route.useLoaderData();
	const { data } = useQuery({
		queryKey: projectKeys.project(projectId),
		queryFn: () => loadProject({ data: projectId }),
		initialData: loaderData,
	});
	const data_ = data ?? loaderData;
	const {
		project,
		shots: projectShots,
		messages: projectMessages,
		assets: projectAssets,
		transitionVideos: projectTransitionVideos,
		shotVideoAssets: projectShotVideoAssets,
		motionGraphics: projectMotionGraphics,
		voiceovers: projectVoiceovers,
		backgroundMusic: projectBackgroundMusic,
	} = data_;
	const { shot: shotParam, from, to, mediaTab } = Route.useSearch();
	const navigate = useNavigate();

	// Workshop selection lives at the route level so the header can read
	// it for the "Open shot detail" affordance. ChatWorkshop receives it
	// as a controlled prop pair.
	const [workshopSelectedItemId, setWorkshopSelectedItemId] = useState<
		string | null
	>(null);

	// Resolve "first" to the actual first shot ID
	const shot =
		shotParam === "first" && projectShots.length > 0
			? projectShots[0].id
			: shotParam;

	// If "first" was used but we now have a real ID, update the URL cleanly
	if (shotParam === "first" && shot !== "first") {
		navigate({
			to: "/projects/$projectId",
			params: { projectId },
			search: { scene: undefined, shot, from: undefined, to: undefined, mediaTab: undefined },
			replace: true,
		});
	}

	const isDetailView = Boolean(shot || (from && to));

	// Resolve the workshop selection to a real DB shot ID, if applicable.
	// Selections of the form "shot-N" or "prompt-N" point at projectShots[N].
	// Outline selections have no corresponding shot, so the button hides.
	const selectedShotForDetail = (() => {
		if (!workshopSelectedItemId) return null;
		const match = workshopSelectedItemId.match(/^(shot|prompt)-(\d+)$/);
		if (!match) return null;
		const index = Number.parseInt(match[2], 10);
		if (Number.isNaN(index)) return null;
		return projectShots[index] ?? null;
	})();

	return (
		<div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
			<ProjectHeader
				projectId={project.id}
				isDetailView={isDetailView}
				showEditorLink={isDetailView}
				onBackToWorkshop={() => {
					navigate({
						to: "/projects/$projectId",
						params: { projectId: project.id },
						search: {
							scene: undefined,
							shot: undefined,
							from: undefined,
							to: undefined,
							mediaTab: undefined,
						},
					});
				}}
			>
				<div className="flex items-center justify-between gap-3 flex-1 min-w-0">
					{/* Left side: project name + status badge */}
					<div className="flex items-center gap-3 min-w-0">
						<h1 className="text-sm font-semibold text-foreground truncate">
							{project.name}
						</h1>
						{projectShots.length > 0 && (
							<span className="text-xs text-muted-foreground shrink-0">
								{projectShots.length} shot{projectShots.length !== 1 ? "s" : ""}
							</span>
						)}
						{isDetailView ? (
							<Badge
								variant="outline"
								className="gap-1 text-[10px] py-0.5 px-1.5 text-success border-success/40 bg-success/10"
							>
								<Check size={10} />
								Shot Detail
							</Badge>
						) : (
							<Badge
								variant="outline"
								className="gap-1 text-[10px] py-0.5 px-1.5 text-primary border-primary/40 bg-primary/10"
							>
								<Film size={10} />
								Workshop
							</Badge>
						)}
					</div>

					{/* Right side: actions */}
					<div className="flex items-center gap-2 shrink-0">
						{!isDetailView && selectedShotForDetail && (
							<Button
								variant="accent"
								size="xs"
								className="gap-1"
								onClick={() => {
									navigate({
										to: "/projects/$projectId",
										params: { projectId: project.id },
										search: {
											scene: undefined,
											shot: selectedShotForDetail.id,
											from: undefined,
											to: undefined,
											mediaTab: undefined,
										},
									});
								}}
							>
								Open shot detail
								<ArrowRight size={12} />
							</Button>
						)}
						{!isDetailView && (
							<DeleteProjectDialog
								projectName={project.name}
								onConfirm={async () => {
									await deleteProject({ data: { projectId: project.id } });
									await navigate({ to: "/dashboard" });
								}}
							/>
						)}
					</div>
				</div>
			</ProjectHeader>

			{/* Content */}
			{isDetailView ? (
				<Storyboard
					projectId={project.id}
					shots={projectShots}
					assets={projectAssets}
					projectSettings={project.settings}
					transitionVideos={projectTransitionVideos}
					shotVideoAssets={projectShotVideoAssets}
					motionGraphics={projectMotionGraphics}
					voiceovers={projectVoiceovers}
					backgroundMusic={projectBackgroundMusic}
					initialShotId={shot}
					initialFromShotId={from}
					initialToShotId={to}
					initialMediaTab={mediaTab}
				/>
			) : (
				<ScriptWorkshop
					key={`${project.id}-workshop`}
					projectId={project.id}
					existingMessages={projectMessages}
					projectSettings={project.settings}
					scriptDraft={project.scriptDraft}
					selectedItemId={workshopSelectedItemId}
					onSelectedItemIdChange={setWorkshopSelectedItemId}
				/>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Shared header
// ---------------------------------------------------------------------------

function ProjectHeader({
	children,
	projectId,
	isDetailView = false,
	showEditorLink = false,
	onBackToWorkshop,
}: {
	children?: React.ReactNode;
	projectId?: string;
	isDetailView?: boolean;
	showEditorLink?: boolean;
	onBackToWorkshop?: () => void;
}) {
	return (
		<div className="px-4 py-2 border-b bg-card shrink-0 flex items-center gap-3">
			{isDetailView && (
				<>
					<button
						type="button"
						onClick={onBackToWorkshop}
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
					>
						<ArrowLeft size={12} />
						Back to Workshop
					</button>
					<div className="h-4 w-px bg-border" />
				</>
			)}
			{children}
			{showEditorLink && projectId && (
				<>
					<div className="h-4 w-px bg-border ml-auto" />
					<Link
						to="/projects/$projectId/editor"
						params={{ projectId }}
						className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
					>
						<Film size={12} />
						Editor
					</Link>
				</>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Pending / Error states
// ---------------------------------------------------------------------------

function ProjectPending() {
	return (
		<div className="flex flex-col h-[calc(100vh-3.5rem)]">
			<ProjectHeader>
				<div className="h-6 w-48 bg-muted rounded animate-pulse mt-1" />
			</ProjectHeader>
			<div className="flex-1 flex items-center justify-center">
				<Loader2 size={24} className="animate-spin text-muted-foreground" />
			</div>
		</div>
	);
}

function ProjectError({ error, reset }: { error: Error; reset: () => void }) {
	return (
		<div className="flex flex-col h-[calc(100vh-3.5rem)]">
			<ProjectHeader />
			<div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
				<p className="text-sm text-destructive text-center max-w-md">
					{error.message || "Something went wrong loading this project."}
				</p>
				<div className="flex items-center gap-3">
					<Button variant="outline" size="sm" onClick={reset}>
						Try again
					</Button>
					<Button variant="outline" size="sm" asChild>
						<Link to="/dashboard">Back to dashboard</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Delete project dialog
// ---------------------------------------------------------------------------

function DeleteProjectDialog({
	projectName,
	onConfirm,
}: {
	projectName: string;
	onConfirm: () => Promise<void>;
}) {
	const [open, setOpen] = useState(false);
	const [inputValue, setInputValue] = useState("");
	const [isDeleting, setIsDeleting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const canConfirm = inputValue === projectName;

	async function handleConfirm() {
		if (!canConfirm || isDeleting) return;
		setIsDeleting(true);
		setError(null);
		try {
			await onConfirm();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete project");
			setIsDeleting(false);
		}
	}

	return (
		<AlertDialog
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (!v) {
					setInputValue("");
					setError(null);
				}
			}}
		>
			<AlertDialogTrigger asChild>
				<Button variant="destructive" size="sm" className="gap-1.5">
					<Trash2 size={14} />
					Delete project
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>Delete project</AlertDialogTitle>
					<AlertDialogDescription asChild>
						<div className="space-y-3">
							<p>
								This will permanently delete <strong>{projectName}</strong> and
								all its scenes, shots, and generated images.{" "}
								<span className="text-destructive font-medium">
									This action is irreversible.
								</span>
							</p>
							<p className="text-sm">
								Type <strong>{projectName}</strong> to confirm:
							</p>
							<Input
								value={inputValue}
								onChange={(e) => setInputValue(e.target.value)}
								placeholder={projectName}
								autoFocus
								onKeyDown={(e) => {
									if (e.key === "Enter") handleConfirm();
								}}
							/>
							{error && <p className="text-xs text-destructive">{error}</p>}
						</div>
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<Button
						variant="outline"
						onClick={() => setOpen(false)}
						disabled={isDeleting}
					>
						Cancel
					</Button>
					<Button
						variant="destructive"
						onClick={handleConfirm}
						disabled={!canConfirm || isDeleting}
					>
						{isDeleting ? (
							<>
								<Loader2 size={13} className="animate-spin mr-1.5" />
								Deleting…
							</>
						) : (
							"Delete project"
						)}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
