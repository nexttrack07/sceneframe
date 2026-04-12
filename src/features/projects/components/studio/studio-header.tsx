import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SceneAssetSummary } from "../../project-types";
import { ShotFilmstrip } from "./shot-filmstrip";
import type { Shot } from "@/db/schema";

export function StudioHeader({
	shot,
	allShots,
	allAssets,
	onShotChange,
	onClose,
}: {
	shot: Shot;
	allShots: Shot[];
	allAssets: SceneAssetSummary[];
	onShotChange: (shotId: string) => void;
	onClose: () => void;
}) {
	return (
		<div className="border-b bg-card px-4 py-3 flex items-center gap-3 shrink-0">
			{/* Filmstrip */}
			<div className="flex-1 min-w-0 mx-4">
				<ShotFilmstrip
					shots={allShots}
					allAssets={allAssets}
					currentShotId={shot.id}
					onShotChange={onShotChange}
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
