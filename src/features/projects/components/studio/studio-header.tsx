import { ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Scene } from "@/db/schema";
import type { SceneAssetSummary } from "../../project-types";
import { SceneFilmstrip } from "./scene-filmstrip";

export function StudioHeader({
	scene,
	sceneIndex,
	allScenes,
	allAssets,
	onSceneChange,
	onClose,
}: {
	scene: Scene;
	sceneIndex: number;
	allScenes: Scene[];
	allAssets: SceneAssetSummary[];
	onSceneChange: (sceneId: string) => void;
	onClose: () => void;
}) {
	return (
		<div className="border-b bg-card px-4 py-3 flex items-center gap-3 shrink-0">
			{/* Breadcrumb */}
			<div className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
				<button
					type="button"
					onClick={onClose}
					className="hover:text-foreground transition-colors cursor-pointer"
				>
					Storyboard
				</button>
				<ChevronRight size={12} />
				<span className="text-foreground font-medium">
					{scene.title || `Scene ${sceneIndex + 1}`}
				</span>
			</div>

			{/* Filmstrip */}
			<div className="flex-1 min-w-0 mx-4">
				<SceneFilmstrip
					scenes={allScenes}
					allAssets={allAssets}
					currentSceneId={scene.id}
					onSceneChange={onSceneChange}
				/>
			</div>

			{/* Actions */}
			<div className="flex items-center gap-2 shrink-0">
				<Button size="sm" variant="ghost" onClick={onClose}>
					<X size={16} />
				</Button>
			</div>
		</div>
	);
}
