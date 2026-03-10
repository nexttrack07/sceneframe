import { auth } from "@clerk/tanstack-react-start/server";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db } from "@/db/index";
import { projects } from "@/db/schema";

const createProject = createServerFn({ method: "POST" })
	.inputValidator((data: { name: string }) => data)
	.handler(async ({ data }) => {
		const { userId } = await auth();
		if (!userId) throw new Error("Unauthenticated");

		const { name } = data;
		if (!name.trim()) throw new Error("Project name is required");

		const [project] = await db
			.insert(projects)
			.values({
				userId,
				name: name.trim(),
				directorPrompt: "",
				scriptStatus: "idle",
			})
			.returning({ id: projects.id });

		if (!project) throw new Error("Failed to create project");

		return { projectId: project.id };
	});

export const Route = createFileRoute("/_auth/projects/new")({
	component: NewProjectPage,
});

function NewProjectPage() {
	const navigate = useNavigate();
	const nameId = useId();
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, setIsPending] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setIsPending(true);
		try {
			const { projectId } = await createProject({ data: { name } });
			navigate({
				to: "/projects/$projectId",
				params: { projectId },
				search: { shot: undefined, from: undefined, to: undefined },
			});
		} catch (err: unknown) {
			if (err instanceof Error) setError(err.message);
		} finally {
			setIsPending(false);
		}
	}

	return (
		<div className="max-w-lg mx-auto px-6 py-8">
			<Link
				to="/dashboard"
				className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
			>
				<ArrowLeft size={15} />
				Back to projects
			</Link>

			<div className="mb-8">
				<h1 className="text-2xl font-bold text-foreground">New Project</h1>
				<p className="text-sm text-muted-foreground mt-1">
					Give your project a name. You&apos;ll build a Creative Brief, then
					refine scenes in Script Chat.
				</p>
			</div>

			<form onSubmit={handleSubmit} className="space-y-6">
				<div className="space-y-2">
					<Label htmlFor={nameId}>Project name</Label>
					<Input
						id={nameId}
						placeholder="e.g. Tokyo Night Drive"
						value={name}
						onChange={(e) => setName(e.target.value)}
						required
						autoFocus
					/>
				</div>

				{error && <p className="text-sm text-destructive">{error}</p>}

				<div className="flex items-center gap-3 pt-2">
					<Button type="submit" disabled={isPending}>
						{isPending ? "Creating…" : "Create project"}
					</Button>
					<Button type="button" variant="ghost" asChild>
						<Link to="/dashboard">Cancel</Link>
					</Button>
				</div>
			</form>
		</div>
	);
}
