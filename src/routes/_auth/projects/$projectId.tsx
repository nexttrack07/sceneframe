import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, Film, Loader2, Trash2 } from "lucide-react";
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
import { deleteProject } from "@/features/projects/project-mutations";
import { loadProject } from "@/features/projects/project-queries";
import type { ScenePlanEntry } from "@/features/projects/project-types";
import { projectKeys } from "@/features/projects/query-keys";

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute("/_auth/projects/$projectId")({
	loader: async ({ params, context: { queryClient } }) => {
		return queryClient.ensureQueryData({
			queryKey: projectKeys.project(params.projectId),
			queryFn: () => loadProject({ data: params.projectId }),
		});
	},
	validateSearch: (search: Record<string, unknown>) => ({
		shot: typeof search.shot === "string" ? search.shot : undefined,
		from: typeof search.from === "string" ? search.from : undefined,
		to: typeof search.to === "string" ? search.to : undefined,
	}),
	component: ProjectPage,
	pendingComponent: ProjectPending,
	errorComponent: ProjectError,
});

// ---------------------------------------------------------------------------
// Page — switches between Workshop and Storyboard
// ---------------------------------------------------------------------------

function ProjectPage() {
	const { projectId } = Route.useParams();
	const { data } = useQuery({
		queryKey: projectKeys.project(projectId),
		queryFn: () => loadProject({ data: projectId }),
	});
	// data is always defined since loader seeded it
	// biome-ignore lint/style/noNonNullAssertion: loader always seeds this value before component renders
	const {
		project,
		scenes: projectScenes,
		shots: projectShots,
		messages: projectMessages,
		assets: projectAssets,
		transitionVideos: projectTransitionVideos,
	} = data!;
	const { shot, from, to } = Route.useSearch();
	const scenePlan: ScenePlanEntry[] = (() => {
		if (!project.scriptRaw) return [];
		try {
			return JSON.parse(project.scriptRaw) as ScenePlanEntry[];
		} catch {
			return [];
		}
	})();

	const isWorkshopPhase = project.scriptStatus !== "done";
	const navigate = useNavigate();

	return (
		<div className="flex flex-col h-[calc(100vh-3.5rem)]">
			<ProjectHeader>
				<div className="flex items-start justify-between gap-4">
					<div>
						<h1 className="text-xl font-bold text-foreground">
							{project.name}
						</h1>
						{!isWorkshopPhase && projectScenes.length > 0 && (
							<p className="text-sm text-muted-foreground mt-0.5">
								{projectShots.length > 0
									? `${projectShots.length} shots across ${projectScenes.length} scenes`
									: `${projectScenes.length} scene${projectScenes.length !== 1 ? "s" : ""}`}
							</p>
						)}
					</div>
					<div className="flex items-center gap-2 shrink-0">
						{isWorkshopPhase ? (
							<Badge
								variant="outline"
								className="gap-1.5 text-primary border-primary/40 bg-primary/10 shrink-0"
							>
								<Film size={11} />
								Script Workshop
							</Badge>
						) : (
							<Badge
								variant="outline"
								className="gap-1.5 text-success border-success/40 bg-success/10 shrink-0"
							>
								<Check size={11} />
								Script approved
							</Badge>
						)}
						<DeleteProjectDialog
							projectName={project.name}
							onConfirm={async () => {
								await deleteProject({ data: { projectId: project.id } });
								await navigate({ to: "/dashboard" });
							}}
						/>
					</div>
				</div>
			</ProjectHeader>

			{/* Content — key on ScriptWorkshop ensures fresh state if loader re-runs */}
			{isWorkshopPhase ? (
				<ScriptWorkshop
					key={project.id}
					projectId={project.id}
					existingMessages={projectMessages}
					projectSettings={project.settings}
				/>
			) : (
				<Storyboard
					projectId={project.id}
					scenes={projectScenes}
					shots={projectShots}
					assets={projectAssets}
					projectSettings={project.settings}
					scenePlan={scenePlan}
					transitionVideos={projectTransitionVideos}
					initialShotId={shot}
					initialFromShotId={from}
					initialToShotId={to}
				/>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Shared header
// ---------------------------------------------------------------------------

function ProjectHeader({ children }: { children?: React.ReactNode }) {
	return (
		<div className="px-6 py-4 border-b bg-card shrink-0">
			<Link
				to="/dashboard"
				className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors"
			>
				<ArrowLeft size={14} />
				All projects
			</Link>
			{children}
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
				<Button
					variant="ghost"
					size="icon"
					className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
				>
					<Trash2 size={14} />
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
