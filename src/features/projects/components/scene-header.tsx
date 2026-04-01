import {
	ChevronDown,
	ChevronRight,
	GripVertical,
	Loader2,
	Trash2,
} from "lucide-react";
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
import type { Scene } from "@/db/schema";

export function SceneHeader({
	scene,
	sceneIndex,
	shotCount,
	timeRange,
	isCollapsed,
	isEditSelected = false,
	isRecentlyEdited = false,
	isApplyingEdit = false,
	onToggleCollapse,
	onSelectForEdit,
	onDelete,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
}: {
	scene: Scene;
	sceneIndex: number;
	shotCount: number;
	timeRange: string;
	isCollapsed: boolean;
	isEditSelected?: boolean;
	isRecentlyEdited?: boolean;
	isApplyingEdit?: boolean;
	onToggleCollapse: () => void;
	onSelectForEdit?: () => void;
	onDelete: () => void;
	onDragStart: (e: React.DragEvent) => void;
	onDragOver: (e: React.DragEvent) => void;
	onDrop: (e: React.DragEvent) => void;
	onDragEnd: () => void;
}) {
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: draggable scene row; drag events are native HTML5 DnD on a structural container
		<div
			draggable
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onDragEnd={onDragEnd}
			className={`group flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
				isRecentlyEdited
					? "bg-amber-50 border-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.35)]"
					: "bg-muted/50 border-border/50"
			}`}
		>
			{/* Drag handle */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: onMouseDown stops propagation only; GripVertical is a visual affordance, not an interactive control */}
			<div
				className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
				onMouseDown={(e) => e.stopPropagation()}
			>
				<GripVertical size={14} />
			</div>

			{onSelectForEdit && (
				<input
					type="checkbox"
					checked={isEditSelected}
					onChange={() => onSelectForEdit()}
					onClick={(e) => e.stopPropagation()}
					className="h-3.5 w-3.5 shrink-0 accent-foreground"
					aria-label={`Select ${scene.title || `Scene ${sceneIndex + 1}`} for editing`}
				/>
			)}

			{/* Collapse toggle */}
			<button
				type="button"
				onClick={onToggleCollapse}
				className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground"
			>
				{isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
			</button>

			{/* Scene title */}
			<button
				type="button"
				onClick={onToggleCollapse}
				className="flex items-center gap-2 flex-1 min-w-0 text-left"
			>
				<span className="text-sm font-semibold text-foreground truncate">
					{scene.title || `Scene ${sceneIndex + 1}`}
				</span>
				{isApplyingEdit && (
					<Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-primary text-primary-foreground hover:bg-primary">
						<Loader2 size={10} className="mr-1 animate-spin" />
						Saving
					</Badge>
				)}
				{isRecentlyEdited && (
					<Badge className="text-[10px] px-1.5 py-0 shrink-0 bg-amber-500 text-white hover:bg-amber-500">
						Updated
					</Badge>
				)}
				<Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
					{shotCount} shot{shotCount !== 1 ? "s" : ""}
				</Badge>
				{timeRange && (
					<Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
						{timeRange}
					</Badge>
				)}
			</button>

			{/* Delete scene button */}
			<div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
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
							<AlertDialogTitle>Delete scene?</AlertDialogTitle>
							<AlertDialogDescription>
								This will remove{" "}
								{scene.title ? `"${scene.title}"` : `Scene ${sceneIndex + 1}`}{" "}
								and all its shots and associated assets. This action cannot be
								undone.
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
