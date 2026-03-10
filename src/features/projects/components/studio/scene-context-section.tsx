import { useRouter } from "@tanstack/react-router";
import {
	AlertCircle,
	ChevronDown,
	ChevronUp,
	Loader2,
	Sparkles,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Scene } from "@/db/schema";
import { getPracticalityWarnings } from "../../lib/practicality-warnings";
import type { ScenePlanEntry } from "../../project-types";
import { regenerateSceneDescription, updateScene } from "../../scene-actions";
import { SceneRefinePanel } from "../scene-refine-panel";

export function SceneContextSection({
	scene,
	plan,
	onDescriptionSaved,
}: {
	scene: Scene;
	plan?: ScenePlanEntry;
	onDescriptionSaved?: (newDescription: string) => void;
}) {
	const router = useRouter();
	const id = useId();
	const [isOpen, setIsOpen] = useState(true);
	const [title, setTitle] = useState(scene.title ?? "");
	const [description, setDescription] = useState(scene.description);
	const [isDirty, setIsDirty] = useState(false);
	const [isSaving, setIsSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isRefineOpen, setIsRefineOpen] = useState(false);
	const [refineInstructions, setRefineInstructions] = useState("");
	const [isRegenerating, setIsRegenerating] = useState(false);

	const practicalityWarnings = getPracticalityWarnings(description);

	// Reset local state when navigating between scenes
	// biome-ignore lint/correctness/useExhaustiveDependencies: all scene fields are in deps; setters are stable
	useEffect(() => {
		setTitle(scene.title ?? "");
		setDescription(scene.description);
		setIsDirty(false);
		setError(null);
		setIsRefineOpen(false);
		setRefineInstructions("");
	}, [scene.id, scene.title, scene.description]);

	async function handleSave() {
		if (!isDirty) return;
		const trimmedDesc = description.trim();
		if (!trimmedDesc) {
			setError("Description cannot be empty");
			return;
		}
		setIsSaving(true);
		setError(null);
		try {
			await updateScene({
				data: {
					sceneId: scene.id,
					title: title.trim() || null,
					description: trimmedDesc,
				},
			});
			setIsDirty(false);
			onDescriptionSaved?.(trimmedDesc);
			await router.invalidate();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save changes");
		} finally {
			setIsSaving(false);
		}
	}

	async function handleRegenerate() {
		if (!refineInstructions.trim() || isRegenerating) return;
		setIsRegenerating(true);
		setError(null);
		try {
			const result = await regenerateSceneDescription({
				data: {
					sceneId: scene.id,
					instructions: refineInstructions,
					currentDescription: description,
				},
			});
			setDescription(result.description);
			setIsDirty(true);
			setRefineInstructions("");
			setIsRefineOpen(false);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to regenerate description",
			);
		} finally {
			setIsRegenerating(false);
		}
	}

	return (
		<div className="space-y-3">
			{/* Collapsible header */}
			<button
				type="button"
				onClick={() => setIsOpen((prev) => !prev)}
				className="flex items-center gap-2 w-full text-left"
			>
				{isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
				<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
					Scene context
				</span>
			</button>

			{isOpen && (
				<div className="space-y-3">
					{/* Title */}
					<input
						id={`${id}-title`}
						type="text"
						value={title}
						onChange={(e) => {
							setTitle(e.target.value);
							setIsDirty(true);
						}}
						className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
						placeholder="Scene title"
					/>

					{/* Description */}
					<div className="space-y-1.5">
						<div className="flex items-center justify-between">
							<label
								htmlFor={`${id}-desc`}
								className="text-xs font-medium text-muted-foreground"
							>
								Description
							</label>
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="button"
										onClick={() => setIsRefineOpen((prev) => !prev)}
										className={`p-1.5 rounded-md transition-colors ${
											isRefineOpen
												? "bg-foreground text-background"
												: "bg-foreground text-background hover:bg-foreground/80"
										}`}
									>
										<Sparkles size={13} />
									</button>
								</TooltipTrigger>
								<TooltipContent side="left">
									<p>Refine with AI</p>
								</TooltipContent>
							</Tooltip>
						</div>
						<textarea
							id={`${id}-desc`}
							value={description}
							onChange={(e) => {
								setDescription(e.target.value);
								setIsDirty(true);
							}}
							rows={4}
							disabled={isRegenerating}
							className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent leading-relaxed disabled:opacity-50"
							placeholder="Visual description for this scene..."
						/>

						{isRefineOpen && (
							<SceneRefinePanel
								refineInstructions={refineInstructions}
								setRefineInstructions={setRefineInstructions}
								isRegenerating={isRegenerating}
								onRegenerate={handleRegenerate}
								onClose={() => {
									setIsRefineOpen(false);
									setRefineInstructions("");
								}}
							/>
						)}
					</div>

					{/* Scene mapping */}
					{(plan?.beat || plan?.durationSec || plan?.hookRole) && (
						<div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
							<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
								Scene mapping
							</p>
							{plan?.beat && (
								<p className="text-sm text-foreground">Beat: {plan.beat}</p>
							)}
							{plan?.hookRole && (
								<p className="text-sm text-foreground">Role: {plan.hookRole}</p>
							)}
							{plan?.durationSec && (
								<p className="text-sm text-foreground">
									Duration: {plan.durationSec}s
								</p>
							)}
						</div>
					)}

					{/* Practicality warnings */}
					{practicalityWarnings.length > 0 && (
						<div className="rounded-lg border border-warning/40 bg-warning/15 p-3 space-y-2">
							<p className="text-xs font-medium text-warning uppercase tracking-wide">
								Practicality checks
							</p>
							<ul className="space-y-1">
								{practicalityWarnings.map((w) => (
									<li key={w} className="text-xs text-warning">
										&bull; {w}
									</li>
								))}
							</ul>
						</div>
					)}

					{/* Error */}
					{error && (
						<div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
							<AlertCircle size={14} className="shrink-0" />
							<span>{error}</span>
						</div>
					)}

					{/* Save button */}
					{isDirty && (
						<Button
							size="sm"
							onClick={handleSave}
							disabled={isSaving}
							className="w-full"
						>
							{isSaving && (
								<Loader2 size={13} className="animate-spin mr-1.5" />
							)}
							{isSaving ? "Saving..." : "Save changes"}
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
