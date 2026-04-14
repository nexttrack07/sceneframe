import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
	Clipboard,
	FileJson,
	FileText,
	Film,
	MapPinned,
	MoreHorizontal,
	RotateCcw,
	Users,
} from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { exportProjectHandoff } from "../project-queries";
import { resetWorkshop } from "../project-mutations";
import { projectKeys } from "../query-keys";

interface ProjectMenuProps {
	projectId: string;
	onError?: (message: string) => void;
}

export function ProjectMenu({ projectId, onError }: ProjectMenuProps) {
	const queryClient = useQueryClient();
	const [resetOpen, setResetOpen] = useState(false);
	const [isResetting, setIsResetting] = useState(false);
	const [isWorking, setIsWorking] = useState(false);

	async function handleExport(format: "markdown" | "json") {
		setIsWorking(true);
		try {
			const result = await exportProjectHandoff({
				data: { projectId, format },
			});
			const blob = new Blob([result.content], { type: result.mimeType });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = result.filename;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			onError?.(err instanceof Error ? err.message : "Failed to export");
		} finally {
			setIsWorking(false);
		}
	}

	async function handleCopyScript() {
		setIsWorking(true);
		try {
			const result = await exportProjectHandoff({
				data: { projectId, format: "markdown" },
			});
			await navigator.clipboard.writeText(result.content);
		} catch (err) {
			onError?.(err instanceof Error ? err.message : "Failed to copy script");
		} finally {
			setIsWorking(false);
		}
	}

	async function handleReset() {
		setIsResetting(true);
		try {
			await resetWorkshop({ data: projectId });
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			setResetOpen(false);
		} catch (err) {
			onError?.(err instanceof Error ? err.message : "Failed to reset workshop");
		} finally {
			setIsResetting(false);
		}
	}

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="glass-ghost"
						size="icon-sm"
						aria-label="Project menu"
						disabled={isWorking}
					>
						<MoreHorizontal />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem onSelect={() => void handleExport("markdown")}>
						<FileText />
						Export as Markdown
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => void handleExport("json")}>
						<FileJson />
						Export as JSON
					</DropdownMenuItem>
					<DropdownMenuItem onSelect={() => void handleCopyScript()}>
						<Clipboard />
						Copy script to clipboard
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem asChild>
						<Link
							to="/projects/$projectId/references"
							params={{ projectId }}
						>
							<Users />
							Characters &amp; locations
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<Link
							to="/projects/$projectId/references"
							params={{ projectId }}
						>
							<MapPinned />
							References workspace
						</Link>
					</DropdownMenuItem>
					<DropdownMenuItem asChild>
						<Link
							to="/projects/$projectId/editor"
							params={{ projectId }}
						>
							<Film />
							Open in editor
						</Link>
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						variant="destructive"
						onSelect={(event) => {
							event.preventDefault();
							setResetOpen(true);
						}}
					>
						<RotateCcw />
						Reset workshop…
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>

			<AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>Reset this workshop?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently deletes the script, all shots, and every image,
							video, audio, and motion graphic asset in the project. Your
							characters and locations are kept. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isResetting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={handleReset}
							disabled={isResetting}
						>
							{isResetting ? "Resetting…" : "Reset workshop"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
