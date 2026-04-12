import { useEffect, useMemo, useRef } from "react";
import type { Shot } from "@/db/schema";
import type { SceneAssetSummary } from "../../project-types";

export function ShotFilmstrip({
	shots,
	allAssets,
	currentShotId,
	onShotChange,
}: {
	shots: Shot[];
	allAssets: SceneAssetSummary[];
	currentShotId: string;
	onShotChange: (shotId: string) => void;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const currentRef = useRef<HTMLButtonElement>(null);

	const assetsByShotId = useMemo(() => {
		const map = new Map<string, SceneAssetSummary[]>();
		for (const a of allAssets) {
			if (!a.shotId) continue;
			const existing = map.get(a.shotId) ?? [];
			existing.push(a);
			map.set(a.shotId, existing);
		}
		return map;
	}, [allAssets]);

	// Auto-scroll to keep current shot visible
	// biome-ignore lint/correctness/useExhaustiveDependencies: currentRef is a ref — intentionally not a dependency; only currentShotId drives the scroll
	useEffect(() => {
		currentRef.current?.scrollIntoView({
			behavior: "smooth",
			block: "nearest",
			inline: "center",
		});
	}, [currentShotId]);

	function getPreviewUrl(shotId: string): string | null {
		const shotAssets = assetsByShotId.get(shotId) ?? [];
		const selected = shotAssets.find((a) => a.isSelected);
		if (selected?.url) return selected.url;
		const anyDone = shotAssets.find((a) => a.status === "done" && a.url);
		return anyDone?.url ?? null;
	}

	return (
		<div
			ref={scrollRef}
			className="flex items-center gap-1 overflow-x-auto scrollbar-none py-1 px-1"
		>
			{shots.map((shot, i) => {
				const isCurrent = shot.id === currentShotId;
				const previewUrl = getPreviewUrl(shot.id);

				return (
					<div key={shot.id} className="flex items-center shrink-0">
						<button
							ref={isCurrent ? currentRef : undefined}
							type="button"
							onClick={() => onShotChange(shot.id)}
							className={`shrink-0 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-all ${
								isCurrent
									? "bg-primary/10 ring-2 ring-primary text-foreground font-medium"
									: "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
							}`}
						>
							{/* Thumbnail */}
							<div className="w-8 h-6 rounded overflow-hidden bg-muted shrink-0 relative">
								{previewUrl ? (
									<img
										src={previewUrl}
										alt=""
										className="w-full h-full object-cover"
									/>
								) : (
									<div className="w-full h-full flex items-center justify-center text-[9px] text-muted-foreground/50">
										{i + 1}
									</div>
								)}
								{/* Shot type dot */}
								<div
									className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${
										shot.shotType === "talking"
											? "bg-blue-500"
											: "bg-purple-500"
									}`}
								/>
							</div>
							<span className="max-w-[60px] truncate">{i + 1}</span>
						</button>
					</div>
				);
			})}
		</div>
	);
}
