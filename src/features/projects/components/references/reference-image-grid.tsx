import { Check, Loader2, Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectReferenceImageInfo } from "../../project-types";
import { GeneratingTimer } from "../studio/generating-timer";

export interface PendingReferenceImage {
	id: string;
	createdAt: string;
	label?: string;
}

interface ReferenceImageGridProps {
	images: ProjectReferenceImageInfo[];
	pendingImages?: PendingReferenceImage[];
	entityName?: string;
	primaryImageId?: string | null;
	editingImageId?: string | null;
	settingPrimaryImageId?: string | null;
	onToggleEditing: (imageId: string) => void;
	onSetPrimary: (imageId: string) => void;
	onDelete: (imageId: string, label: string) => void;
}

export function ReferenceImageGrid({
	images,
	pendingImages = [],
	entityName,
	primaryImageId,
	editingImageId,
	settingPrimaryImageId,
	onToggleEditing,
	onSetPrimary,
	onDelete,
}: ReferenceImageGridProps) {
	if (images.length === 0 && pendingImages.length === 0) {
		return (
			<div className="flex h-40 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
				No images yet.
			</div>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-4 xl:grid-cols-3 2xl:grid-cols-4">
			{pendingImages.map((image) => (
				<div
					key={image.id}
					className="relative overflow-hidden rounded-xl bg-muted"
				>
					<div className="aspect-square relative overflow-hidden rounded-md border border-border bg-card">
						<div className="absolute inset-0 animate-pulse bg-gradient-to-r from-card via-muted-foreground/15 to-card" />
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
							<div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-foreground/60" />
							<div className="flex flex-col items-center gap-1">
								<span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground/70">
									Generating
								</span>
								<GeneratingTimer createdAt={image.createdAt} />
							</div>
						</div>
					</div>
					<div className="absolute inset-x-0 bottom-0 p-3">
						<p className="truncate text-sm font-medium text-white">
							{image.label ?? "Generating reference image"}
						</p>
					</div>
				</div>
			))}

			{images.map((image) => {
				const isPrimary = primaryImageId === image.id;
				const isEditing = editingImageId === image.id;
				return (
					<div
						key={image.id}
						className={`group relative overflow-hidden rounded-xl bg-muted ${
							isPrimary
								? "ring-2 ring-primary ring-offset-2 ring-offset-background"
								: ""
						}`}
					>
						<div className="aspect-square overflow-hidden bg-muted">
							<img
								src={image.url}
								alt={image.label ?? entityName ?? "Reference"}
								className="h-full w-full object-cover"
							/>
						</div>
						<div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-80 transition-opacity group-hover:opacity-100" />
						<div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
							{isPrimary ? (
								<span className="inline-flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-[10px] font-medium text-primary shadow-sm">
									<Check size={10} />
									Primary
								</span>
							) : null}
							{isEditing ? (
								<span className="inline-flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-[10px] font-medium text-foreground shadow-sm">
									<Pencil size={10} />
									Editing
								</span>
							) : null}
						</div>
						<div className="absolute inset-x-0 bottom-0 p-3">
							<div className="mb-2 min-w-0">
								<p className="truncate text-sm font-medium text-white">
									{image.label ?? "Reference image"}
								</p>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									type="button"
									size="sm"
									variant={isEditing ? "secondary" : "outline"}
									className="h-8 gap-1.5 border-white/30 bg-background/85 text-xs text-foreground shadow-sm hover:bg-background"
									onClick={() => onToggleEditing(image.id)}
								>
									<Pencil size={12} />
									{isEditing ? "Editing" : "Edit"}
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8 gap-1.5 border-white/30 bg-background/85 text-xs text-foreground shadow-sm hover:bg-background"
									onClick={() => onSetPrimary(image.id)}
									disabled={isPrimary || settingPrimaryImageId === image.id}
								>
									{settingPrimaryImageId === image.id ? (
										<Loader2 size={12} className="animate-spin" />
									) : (
										<Star size={12} />
									)}
									Primary
								</Button>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-8 gap-1.5 border-white/30 bg-background/85 text-xs text-destructive shadow-sm hover:bg-background hover:text-destructive"
									onClick={() =>
										onDelete(image.id, image.label ?? "this image")
									}
								>
									<Trash2 size={12} />
									Delete
								</Button>
							</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
