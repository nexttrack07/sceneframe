import { ChevronRight, GripVertical, Trash2 } from "lucide-react";
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
import type { Scene } from "@/db/schema";
import { PIPELINE_STAGES } from "../project-constants";
import type { SceneAssetSummary, ScenePlanEntry } from "../project-types";

export function StoryboardCard({
	scene,
	index,
	plan,
	imageAssets,
	isSelected,
	isDragging,
	onSelect,
	onDelete,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
}: {
	scene: Scene;
	index: number;
	plan?: ScenePlanEntry;
	imageAssets: SceneAssetSummary[];
	isSelected: boolean;
	isDragging: boolean;
	onSelect: () => void;
	onDelete: () => void;
	onDragStart: (e: React.DragEvent) => void;
	onDragOver: (e: React.DragEvent) => void;
	onDrop: (e: React.DragEvent) => void;
	onDragEnd: () => void;
}) {
	const currentStageIndex = PIPELINE_STAGES.findIndex(
		(s) => s.key === scene.stage,
	);
	const hasSelected = imageAssets.some(
		(asset) => asset.isSelected && asset.status === "done",
	);
	const hasGenerating = imageAssets.some(
		(asset) => asset.status === "generating",
	);
	const imageStatusLabel = hasGenerating
		? "Generating..."
		: hasSelected
			? "Ready for video"
			: imageAssets.length > 0
				? "Has candidates"
				: "Needs images";
	const imageStatusTone = hasSelected
		? "text-success"
		: "text-muted-foreground";

	return (
		<div
			draggable
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onDragEnd={onDragEnd}
			className={`relative group transition-opacity ${isDragging ? "opacity-40" : "opacity-100"}`}
		>
			<button
				type="button"
				onClick={onSelect}
				className={`w-full text-left bg-card rounded-xl border-2 p-4 transition-all hover:shadow-md ${
					isSelected
						? "border-primary shadow-md"
						: "border-border hover:border-border/80"
				}`}
			>
				<div className="flex items-start gap-4">
					{/* Drag handle + Scene number */}
					<div className="flex flex-col items-center gap-1 shrink-0">
						<div
							className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground transition-colors"
							onMouseDown={(e) => e.stopPropagation()}
						>
							<GripVertical size={14} />
						</div>
						<div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
							<span className="text-sm font-bold text-muted-foreground">
								{index + 1}
							</span>
						</div>
					</div>

					{/* Content */}
					<div className="flex-1 min-w-0">
						{scene.title && (
							<p className="font-semibold text-foreground text-sm mb-0.5">
								{scene.title}
							</p>
						)}
						{plan?.beat && (
							<p className="text-[11px] text-primary font-medium mb-0.5">
								Beat: {plan.beat}
							</p>
						)}
						<p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
							{scene.description}
						</p>
						{plan?.durationSec ? (
							<p className="text-xs text-muted-foreground mt-1">
								Estimated: {plan.durationSec}s
							</p>
						) : null}
						<p className={`text-xs mt-1 ${imageStatusTone}`}>
							Images: {imageStatusLabel}
						</p>
						{/* Pipeline progress */}
						<div className="flex items-center gap-3 mt-3">
							{PIPELINE_STAGES.map((stage, i) => {
								const isDone = i <= currentStageIndex;
								const Icon = stage.icon;
								return (
									<div key={stage.key} className="flex items-center gap-1">
										<Icon
											size={12}
											className={
												isDone ? "text-primary" : "text-muted-foreground/50"
											}
										/>
										<span
											className={`text-xs ${isDone ? "text-primary font-medium" : "text-muted-foreground/70"}`}
										>
											{stage.label}
										</span>
										{i < PIPELINE_STAGES.length - 1 && (
											<ChevronRight
												size={10}
												className="text-muted-foreground/50 ml-1"
											/>
										)}
									</div>
								);
							})}
						</div>
					</div>
				</div>
			</button>

			{/* Delete button */}
			<div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<button
							type="button"
							onClick={(e) => e.stopPropagation()}
							className="p-1.5 rounded-md bg-card border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
						>
							<Trash2 size={13} />
						</button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete scene?</AlertDialogTitle>
							<AlertDialogDescription>
								This will remove{" "}
								{scene.title ? `"${scene.title}"` : `Scene ${index + 1}`} and
								all its associated assets. This action cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								onClick={onDelete}
								className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
							>
								Delete
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</div>
	);
}
