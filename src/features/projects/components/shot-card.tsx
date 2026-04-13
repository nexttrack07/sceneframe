import { GripVertical, Image as ImageIcon, Loader2, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Badge } from "@/components/ui/badge";
import type { Shot } from "@/db/schema";
import type { SceneAssetSummary } from "../project-types";

function formatTimestamp(seconds: number | null): string {
	if (seconds == null) return "--:--";
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function ShotCard({
	shot,
	globalIndex,
	assets,
	isSelected,
	isEditSelected = false,
	isRecentlyEdited = false,
	isApplyingEdit = false,
	onSelect,
	onSelectForEdit,
	onDelete,
}: {
	shot: Shot;
	globalIndex: number;
	assets: SceneAssetSummary[];
	isSelected: boolean;
	isEditSelected?: boolean;
	isRecentlyEdited?: boolean;
	isApplyingEdit?: boolean;
	onSelect: () => void;
	onSelectForEdit?: () => void;
	onDelete: () => void;
}) {
	const selectedAsset = assets.find(
		(a) => a.isSelected && a.status === "done" && a.url,
	);
	const isGenerating = assets.some((a) => a.status === "generating");
	const duration =
		shot.timestampEnd != null && shot.timestampStart != null
			? Math.round(shot.timestampEnd - shot.timestampStart)
			: shot.durationSec;
	const timeRange = `${formatTimestamp(shot.timestampStart)}-${formatTimestamp(shot.timestampEnd)}`;

	return (
		<div className="relative group">
			<button
				type="button"
				onClick={onSelect}
				className={`w-full text-left bg-card rounded-lg border p-3 transition-all duration-200 ${
					isSelected
						? "border-primary shadow-[0_0_0_1px_var(--primary),0_4px_20px_rgba(0,0,0,0.4)] ring-1 ring-primary/30 scale-[1.01]"
						: isGenerating
							? "border-primary/60 generating-glow"
							: isRecentlyEdited
								? "border-warning/60 bg-warning/5 shadow-[0_0_12px_rgba(var(--warning),0.2)]"
								: "border-border shadow-[0_2px_8px_rgba(0,0,0,0.25)] hover:shadow-[0_4px_16px_rgba(0,0,0,0.35)] hover:border-muted-foreground/30 hover:scale-[1.005]"
				}`}
			>
				<div className="flex items-start gap-3">
					{/* Drag handle */}
					<div className="flex items-center self-stretch -ml-1 mr-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
						<GripVertical size={14} className="text-muted-foreground/50" />
					</div>
					{onSelectForEdit && (
						<input
							type="checkbox"
							checked={isEditSelected}
							onChange={() => onSelectForEdit()}
							onClick={(e) => e.stopPropagation()}
							className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-foreground"
							aria-label={`Select shot ${globalIndex} for editing`}
						/>
					)}
					{/* Thumbnail */}
					<div className="w-16 h-12 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden group/thumb shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] ring-1 ring-white/5">
						{selectedAsset?.url ? (
							<img
								src={selectedAsset.url}
								alt={`Shot ${globalIndex}`}
								className="w-full h-full object-cover transition-transform duration-200 group-hover/thumb:scale-110"
							/>
						) : (
							<ImageIcon size={16} className="text-muted-foreground/40" />
						)}
					</div>

					{/* Content */}
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 mb-1 flex-wrap">
							<span className="text-xs font-bold text-muted-foreground">
								Shot {globalIndex}
							</span>
							{isGenerating && (
								<Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground hover:bg-primary">
									<Loader2 size={10} className="mr-1 animate-spin" />
									Generating
								</Badge>
							)}
							{isApplyingEdit && (
								<Badge className="text-[10px] px-1.5 py-0 bg-primary text-primary-foreground hover:bg-primary">
									<Loader2 size={10} className="mr-1 animate-spin" />
									Saving
								</Badge>
							)}
							{isRecentlyEdited && !isGenerating && (
								<Badge className="text-[10px] px-1.5 py-0 bg-warning text-warning-foreground hover:bg-warning">
									Updated
								</Badge>
							)}
							<Badge
								variant="outline"
								className={`text-[10px] px-1.5 py-0 ${
									shot.shotType === "talking"
										? "text-blue-600 border-blue-600/30 bg-blue-600/10"
										: "text-purple-600 border-purple-600/30 bg-purple-600/10"
								}`}
							>
								{shot.shotType === "talking" ? "TALKING" : "VISUAL"}
							</Badge>
							<Badge variant="outline" className="text-[10px] px-1.5 py-0">
								{duration}s
							</Badge>
							<span className="text-[10px] text-muted-foreground">
								{timeRange}
							</span>
						</div>
						<p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
							{shot.description}
						</p>
					</div>
				</div>
			</button>

			{/* Delete button */}
			<div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
				<AlertDialog>
					<AlertDialogTrigger asChild>
						<button
							type="button"
							onClick={(e) => e.stopPropagation()}
							className="p-1 rounded-md bg-card border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
						>
							<Trash2 size={12} />
						</button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Delete shot?</AlertDialogTitle>
							<AlertDialogDescription>
								This will remove Shot {globalIndex} and all its associated
								assets. This action cannot be undone.
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

export function ShotCardSkeleton() {
	return (
		<div className="w-full bg-card rounded-lg border border-border p-3">
			<div className="flex items-start gap-3">
				{/* Thumbnail skeleton */}
				<Skeleton className="w-16 h-12 rounded shrink-0" />

				{/* Content skeleton */}
				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-2">
						<Skeleton className="h-3 w-12" />
						<Skeleton className="h-4 w-14 rounded-full" />
						<Skeleton className="h-4 w-8 rounded-full" />
					</div>
					<Skeleton className="h-4 w-full mb-1" />
					<Skeleton className="h-4 w-3/4" />
				</div>
			</div>
		</div>
	);
}
