import { auth } from "@clerk/tanstack-react-start/server";
import {
	createFileRoute,
	Link,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Clock, Film, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { db } from "@/db/index";
import type { Project } from "@/db/schema";
import { users } from "@/db/schema";
import { deleteProject } from "@/features/projects/project-mutations";

const loadDashboard = createServerFn().handler(async () => {
	const { userId } = await auth();
	if (!userId) throw redirect({ to: "/sign-in" });

	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
	});

	if (!user?.onboardingComplete) {
		throw redirect({ to: "/onboarding" });
	}

	const userProjects = await db.query.projects.findMany({
		where: (p) => and(eq(p.userId, userId), isNull(p.deletedAt)),
		orderBy: (p) => desc(p.createdAt),
	});

	return { projects: userProjects };
});

export const Route = createFileRoute("/_auth/dashboard")({
	loader: () => loadDashboard(),
	component: DashboardPage,
});

function DashboardPage() {
	const { projects: userProjects } = Route.useLoaderData();
	const router = useRouter();

	return (
		<div className="max-w-5xl mx-auto px-6 py-8">
			<div className="flex items-center justify-between mb-8">
				<div>
					<h1 className="text-2xl font-bold text-foreground">Projects</h1>
					<p className="text-sm text-muted-foreground mt-0.5">
						Each project is a Director Prompt and its generated scene pipeline.
					</p>
				</div>
				<Button asChild variant="accent">
					<Link to="/projects/new">
						<Plus size={16} className="mr-1.5" />
						New Project
					</Link>
				</Button>
			</div>

			{userProjects.length === 0 ? (
				<EmptyState />
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{userProjects.map((project: Project) => (
						<ProjectCard
							key={project.id}
							project={project}
							onDelete={async () => {
								await deleteProject({ data: { projectId: project.id } });
								await router.invalidate();
							}}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center py-24 text-center">
			<div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
				<Film size={24} className="text-primary" />
			</div>
			<h2 className="text-lg font-semibold text-foreground mb-1">
				No projects yet
			</h2>
			<p className="text-sm text-muted-foreground max-w-xs mb-6">
				Create your first project by writing a Director Prompt — a short concept
				for your video.
			</p>
			<Button asChild variant="accent">
				<Link to="/projects/new">
					<Plus size={16} className="mr-1.5" />
					New Project
				</Link>
			</Button>
		</div>
	);
}

function ProjectCard({
	project,
	onDelete,
}: {
	project: Project;
	onDelete: () => Promise<void>;
}) {
	const [isDeleting, setIsDeleting] = useState(false);

	const created = new Date(project.createdAt).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});

	const statusLabel: Record<string, string> = {
		idle: "Draft",
		generating: "Generating…",
		done: "Ready",
		error: "Error",
	};

	const statusColor: Record<string, string> = {
		idle: "bg-muted text-muted-foreground",
		generating: "bg-warning/15 text-warning",
		done: "bg-success/15 text-success",
		error: "bg-destructive/15 text-destructive",
	};

	return (
		<div className="group bg-card rounded-xl border p-5 hover:border-primary/40 hover:shadow-sm transition-all">
			<div className="flex items-start justify-between gap-2 mb-3">
				<div className="min-w-0 flex-1">
					<Link
						to="/projects/$projectId"
						params={{ projectId: project.id }}
						search={{
							scene: undefined,
							shot: undefined,
							from: undefined,
							to: undefined,
							mediaTab: undefined,
						}}
						className="block"
					>
						<h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
							{project.name}
						</h3>
					</Link>
				</div>
				<div className="flex items-center gap-2 shrink-0">
					<span
						className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[project.scriptStatus] ?? statusColor.idle}`}
					>
						{statusLabel[project.scriptStatus] ?? "Draft"}
					</span>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<button
								type="button"
								aria-label={`Delete ${project.name}`}
								className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 hover:bg-destructive/5 transition-colors"
							>
								<Trash2 size={14} />
							</button>
						</AlertDialogTrigger>
						<AlertDialogContent size="sm">
							<AlertDialogHeader>
								<AlertDialogTitle>Delete project?</AlertDialogTitle>
								<AlertDialogDescription>
									This will permanently remove <strong>{project.name}</strong>{" "}
									and its scenes, shots, assets, and editor state.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel disabled={isDeleting}>
									Cancel
								</AlertDialogCancel>
								<AlertDialogAction
									variant="destructive"
									disabled={isDeleting}
									onClick={async () => {
										setIsDeleting(true);
										try {
											await onDelete();
										} finally {
											setIsDeleting(false);
										}
									}}
								>
									{isDeleting ? "Deleting…" : "Delete"}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>
			<Link
				to="/projects/$projectId"
				params={{ projectId: project.id }}
				search={{
					scene: undefined,
					shot: undefined,
					from: undefined,
					to: undefined,
					mediaTab: undefined,
				}}
				className="block"
			>
				<p className="text-sm text-muted-foreground line-clamp-2 mb-4">
					{project.directorPrompt}
				</p>
				<div className="flex items-center gap-1 text-xs text-muted-foreground/70">
					<Clock size={12} />
					<span>{created}</span>
				</div>
			</Link>
		</div>
	);
}
