import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Film, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import type {
	ScenePlanEntry,
	ScriptEditDraft,
	ScriptEditSelection,
} from "@/features/projects/project-types";
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
		scenes: projectScenes,
		shots: projectShots,
		messages: projectMessages,
		assets: projectAssets,
		transitionVideos: projectTransitionVideos,
		shotVideoAssets: projectShotVideoAssets,
		motionGraphics: projectMotionGraphics,
		voiceovers: projectVoiceovers,
		backgroundMusic: projectBackgroundMusic,
	} = data_;
	const { scene, shot, from, to, mediaTab } = Route.useSearch();
	const scenePlan: ScenePlanEntry[] = (() => {
		if (!project.scriptRaw) return [];
		try {
			return JSON.parse(project.scriptRaw) as ScenePlanEntry[];
		} catch {
			return [];
		}
	})();

	const hasPersistedProposal = scenePlan.length > 0;
	const hasActiveScenes = projectScenes.length > 0;
	const isWorkshopPhase =
		project.scriptStatus !== "done" ||
		(hasPersistedProposal && !hasActiveScenes);
	const navigate = useNavigate();
	const isDetailView = Boolean(shot || (from && to));
	const [editSelection, setEditSelection] = useState<ScriptEditSelection>({
		project: false,
		sceneIds: [],
		shotIds: [],
	});
	const [editDraft, setEditDraft] = useState<ScriptEditDraft | null>(null);
	const [approvedEditHighlight, setApprovedEditHighlight] = useState<{
		sceneIds: string[];
		shotIds: string[];
	} | null>(null);
	const [pendingEditApply, setPendingEditApply] = useState<{
		sceneIds: string[];
		shotIds: string[];
	} | null>(null);
	const [committedEditDraft, setCommittedEditDraft] =
		useState<ScriptEditDraft | null>(null);

	function handleEditSelectionChange(nextSelection: ScriptEditSelection) {
		setEditSelection(nextSelection);
		setEditDraft(null);
	}

	useEffect(() => {
		if (!committedEditDraft) return;
		const scenesApplied = committedEditDraft.sceneUpdates.every((update) => {
			const scene = projectScenes.find((entry: any) => entry.id === update.sceneId);
			return scene?.description === update.description;
		});
		const shotsApplied = committedEditDraft.shotUpdates.every((update) => {
			const shot = projectShots.find((entry: any) => entry.id === update.shotId);
			return shot?.description === update.description;
		});
		if (scenesApplied && shotsApplied) {
			setCommittedEditDraft(null);
		}
	}, [committedEditDraft, projectScenes, projectShots]);

	return (
		<div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">
			<ProjectHeader
				projectId={project.id}
				isDetailView={isDetailView}
				showEditorLink={!isWorkshopPhase}
				onBackToStoryboard={() => {
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
				<div className="flex items-center gap-3 min-w-0">
					<div className="flex items-center gap-3 min-w-0">
						<h1 className="text-sm font-semibold text-foreground truncate">
							{project.name}
						</h1>
						{!isWorkshopPhase && projectScenes.length > 0 && (
							<span className="text-xs text-muted-foreground shrink-0">
								{projectShots.length > 0
									? `${projectShots.length} shots · ${projectScenes.length} scenes`
									: `${projectScenes.length} scene${projectScenes.length !== 1 ? "s" : ""}`}
							</span>
						)}
					</div>
					<div className="flex items-center gap-2 shrink-0">
						{isWorkshopPhase ? (
							<Badge
								variant="outline"
								className="gap-1 text-[10px] py-0.5 px-1.5 text-primary border-primary/40 bg-primary/10"
							>
								<Film size={10} />
								Workshop
							</Badge>
						) : (
							<Badge
								variant="outline"
								className="gap-1 text-[10px] py-0.5 px-1.5 text-success border-success/40 bg-success/10"
							>
								<Check size={10} />
								Approved
							</Badge>
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
			{isWorkshopPhase ? (
				<ScriptWorkshop
					key={`${project.id}-workshop`}
					projectId={project.id}
					existingMessages={projectMessages}
					projectSettings={project.settings}
					fallbackProposal={hasPersistedProposal ? scenePlan : null}
					mode="hook"
				/>
			) : isDetailView ? (
				<Storyboard
					projectId={project.id}
					scenes={projectScenes}
					shots={projectShots}
					assets={projectAssets}
					projectSettings={project.settings}
					scenePlan={scenePlan}
					transitionVideos={projectTransitionVideos}
					shotVideoAssets={projectShotVideoAssets}
					motionGraphics={projectMotionGraphics}
					voiceovers={projectVoiceovers}
					backgroundMusic={projectBackgroundMusic}
					initialSceneId={scene}
					initialShotId={shot}
					initialFromShotId={from}
					initialToShotId={to}
					initialMediaTab={mediaTab}
				/>
			) : (
				<ScriptWorkshop
					key={`${project.id}-storyboard`}
					projectId={project.id}
					existingMessages={projectMessages}
					projectSettings={project.settings}
					fallbackProposal={hasPersistedProposal ? scenePlan : null}
					mode="copilot"
					editSelection={editSelection}
					draft={editDraft}
					onDraftChange={setEditDraft}
					onDraftApproved={({ sceneIds, shotIds, draft }) => {
						setApprovedEditHighlight({ sceneIds, shotIds });
						setCommittedEditDraft(draft);
					}}
					onDraftApplyStateChange={setPendingEditApply}
					scenes={projectScenes.map((scene: any) => ({
						id: scene.id,
						title: scene.title,
						order: scene.order,
					}))}
					shots={projectShots.map((shot: any) => ({
						id: shot.id,
						sceneId: shot.sceneId,
						order: shot.order,
					}))}
					rightPanel={
						<Storyboard
							projectId={project.id}
							scenes={projectScenes}
							shots={projectShots}
							assets={projectAssets}
							projectSettings={project.settings}
							scenePlan={scenePlan}
							transitionVideos={projectTransitionVideos}
							shotVideoAssets={projectShotVideoAssets}
							motionGraphics={projectMotionGraphics}
							voiceovers={projectVoiceovers}
							backgroundMusic={projectBackgroundMusic}
							initialSceneId={scene}
							initialShotId={shot}
							initialFromShotId={from}
							initialToShotId={to}
							initialMediaTab={mediaTab}
							editSelection={editSelection}
							onEditSelectionChange={handleEditSelectionChange}
							stagedEditDraft={editDraft}
							committedEditDraft={committedEditDraft}
							approvedEditHighlight={approvedEditHighlight}
							pendingEditApply={pendingEditApply}
						/>
					}
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
	onBackToStoryboard,
}: {
	children?: React.ReactNode;
	projectId?: string;
	isDetailView?: boolean;
	showEditorLink?: boolean;
	onBackToStoryboard?: () => void;
}) {
	return (
		<div className="px-4 py-2 border-b bg-card shrink-0 flex items-center gap-3">
			{isDetailView && (
				<>
					<button
						type="button"
						onClick={onBackToStoryboard}
						className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0"
					>
						<ArrowLeft size={12} />
						Back to Storyboard
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
