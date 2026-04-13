import { AlertTriangle, Check, Loader2, MapPinned, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listCharacters } from "../../character-actions";
import { listLocations } from "../../location-actions";
import type {
	CharacterWithImages,
	LocationWithImages,
	ProjectReferenceImageInfo,
} from "../../project-types";

type EntityWithImages = CharacterWithImages | LocationWithImages;

const MAX_REFERENCE_IMAGES = 4;

function getPrimaryImage(
	entity: EntityWithImages,
): ProjectReferenceImageInfo | null {
	const images = entity.images ?? [];
	if (images.length === 0) return null;
	return (
		images.find((image) => image.id === entity.primaryImageId) ??
		images[0] ??
		null
	);
}

export function ProjectVisualReferenceSelector({
	projectId,
	kind,
	selectedIds,
	onSelectedIdsChange,
	totalSelectedCount = 0,
}: {
	projectId: string;
	kind: "characters" | "locations";
	selectedIds: string[];
	onSelectedIdsChange: (ids: string[]) => void;
	/** Total count of selected references across all categories (characters + locations) */
	totalSelectedCount?: number;
}) {
	const [items, setItems] = useState<EntityWithImages[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			try {
				const result =
					kind === "characters"
						? await listCharacters({ data: { projectId } })
						: await listLocations({ data: { projectId } });
				if (!cancelled) {
					setItems(result);
				}
			} catch {
				if (!cancelled) {
					setItems([]);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		void load();

		return () => {
			cancelled = true;
		};
	}, [kind, projectId]);

	const sortedItems = useMemo(
		() => [...items].sort((a, b) => a.name.localeCompare(b.name)),
		[items],
	);

	if (loading) {
		return (
			<div className="rounded-lg border border-border/50 bg-muted/20 p-3 text-xs text-muted-foreground">
				<div className="flex items-center gap-2">
					<Loader2 size={12} className="animate-spin" />
					Loading {kind}...
				</div>
			</div>
		);
	}

	if (sortedItems.length === 0) {
		return null;
	}

	const isOverLimit = totalSelectedCount > MAX_REFERENCE_IMAGES;
	const selectedWithImages = sortedItems.filter(
		(item) => selectedIds.includes(item.id) && getPrimaryImage(item)?.url,
	).length;

	return (
		<div className="space-y-2">
			<div className="flex items-center justify-between">
				<p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
					{kind === "characters" ? "Characters" : "Locations"}
				</p>
				{selectedWithImages > 0 && (
					<span
						className={`text-[10px] font-medium ${
							isOverLimit ? "text-warning" : "text-muted-foreground"
						}`}
					>
						{selectedWithImages} selected
					</span>
				)}
			</div>
			{isOverLimit && kind === "characters" && (
				<div className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-[10px] text-warning">
					<AlertTriangle size={12} className="flex-shrink-0" />
					<span>
						Only {MAX_REFERENCE_IMAGES} reference images will be used (first{" "}
						{MAX_REFERENCE_IMAGES} selected)
					</span>
				</div>
			)}
			<div className="space-y-2">
				{sortedItems.map((item) => {
					const primaryImage = getPrimaryImage(item);
					const checked = selectedIds.includes(item.id);
					return (
						<button
							key={item.id}
							type="button"
							onClick={() =>
								onSelectedIdsChange(
									checked
										? selectedIds.filter((id) => id !== item.id)
										: [...selectedIds, item.id],
								)
							}
							className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-all ${
								checked
									? "border-primary/40 bg-primary/5"
									: "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40"
							}`}
						>
							<div
								className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
									checked
										? "border-primary bg-primary"
										: "border-muted-foreground/40"
								}`}
							>
								{checked ? (
									<Check size={10} className="text-primary-foreground" />
								) : null}
							</div>
							<div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md border border-border bg-background">
								{primaryImage?.url ? (
									<img
										src={primaryImage.url}
										alt={item.name}
										className="h-full w-full object-cover"
									/>
								) : (
									<div className="flex h-full w-full items-center justify-center text-muted-foreground">
										{kind === "characters" ? (
											<User size={14} />
										) : (
											<MapPinned size={14} />
										)}
									</div>
								)}
							</div>
							<div className="min-w-0">
								<p
									className={`truncate text-xs font-medium ${
										checked ? "text-foreground" : "text-muted-foreground"
									}`}
								>
									{item.name}
								</p>
								<p className="mt-0.5 text-[10px] text-muted-foreground/70">
									{primaryImage?.url
										? "Primary image as reference"
										: "No reference image"}
								</p>
							</div>
						</button>
					);
				})}
			</div>
		</div>
	);
}
