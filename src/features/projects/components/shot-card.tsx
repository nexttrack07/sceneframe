import { Image as ImageIcon, Trash2 } from "lucide-react";
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
	onSelect,
	onDelete,
}: {
	shot: Shot;
	globalIndex: number;
	assets: SceneAssetSummary[];
	isSelected: boolean;
	onSelect: () => void;
	onDelete: () => void;
}) {
	const selectedAsset = assets.find(
		(a) => a.isSelected && a.status === "done" && a.url,
	);
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
				className={`w-full text-left bg-card rounded-lg border p-3 transition-all hover:shadow-md ${
					isSelected
						? "border-primary shadow-md"
						: "border-border hover:border-border/80"
				}`}
			>
				<div className="flex items-start gap-3">
					{/* Thumbnail */}
					<div className="w-16 h-12 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
						{selectedAsset?.url ? (
							<img
								src={selectedAsset.url}
								alt={`Shot ${globalIndex}`}
								className="w-full h-full object-cover"
							/>
						) : (
							<ImageIcon size={16} className="text-muted-foreground/50" />
						)}
					</div>

					{/* Content */}
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2 mb-1 flex-wrap">
							<span className="text-xs font-bold text-muted-foreground">
								Shot {globalIndex}
							</span>
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
