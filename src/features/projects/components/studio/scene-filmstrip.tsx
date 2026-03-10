import { useEffect, useMemo, useRef } from "react";
import type { Scene } from "@/db/schema";
import type { SceneAssetSummary } from "../../project-types";

export function SceneFilmstrip({
	scenes,
	allAssets,
	currentSceneId,
	onSceneChange,
}: {
	scenes: Scene[];
	allAssets: SceneAssetSummary[];
	currentSceneId: string;
	onSceneChange: (sceneId: string) => void;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const currentRef = useRef<HTMLButtonElement>(null);

	const assetsBySceneId = useMemo(() => {
		const map = new Map<string, SceneAssetSummary[]>();
		for (const a of allAssets) {
			const existing = map.get(a.sceneId) ?? [];
			existing.push(a);
			map.set(a.sceneId, existing);
		}
		return map;
	}, [allAssets]);

	// Auto-scroll to keep current scene visible
	// biome-ignore lint/correctness/useExhaustiveDependencies: currentRef is a ref — intentionally not a dependency; only currentSceneId drives the scroll
	useEffect(() => {
		currentRef.current?.scrollIntoView({
			behavior: "smooth",
			block: "nearest",
			inline: "center",
		});
	}, [currentSceneId]);

	function getPreviewUrl(sceneId: string): string | null {
		const sceneAssets = assetsBySceneId.get(sceneId) ?? [];
		const selected = sceneAssets.find((a) => a.isSelected);
		if (selected?.url) return selected.url;
		const anyDone = sceneAssets.find((a) => a.status === "done" && a.url);
		return anyDone?.url ?? null;
	}

	return (
		<div
			ref={scrollRef}
			className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1"
		>
			{scenes.map((scene, i) => {
				const isCurrent = scene.id === currentSceneId;
				const previewUrl = getPreviewUrl(scene.id);
				return (
					<button
						key={scene.id}
						ref={isCurrent ? currentRef : undefined}
						type="button"
						onClick={() => onSceneChange(scene.id)}
						className={`shrink-0 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-all ${
							isCurrent
								? "bg-primary/10 ring-2 ring-primary text-foreground font-medium"
								: "bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
						}`}
					>
						{/* Thumbnail */}
						<div className="w-8 h-6 rounded overflow-hidden bg-muted shrink-0">
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
						</div>
						<span className="max-w-[80px] truncate">
							{scene.title || `Scene ${i + 1}`}
						</span>
					</button>
				);
			})}
		</div>
	);
}
