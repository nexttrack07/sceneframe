import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect } from "react";
import type { SceneAssetSummary } from "../project-types";

export function VideoLightbox({
	asset,
	assets,
	onNavigate,
	onClose,
}: {
	asset: SceneAssetSummary;
	assets: SceneAssetSummary[];
	onNavigate: (assetId: string) => void;
	onClose: () => void;
}) {
	const index = assets.findIndex((a) => a.id === asset.id);

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
			if (e.key === "ArrowLeft" && index > 0) onNavigate(assets[index - 1].id);
			if (e.key === "ArrowRight" && index < assets.length - 1)
				onNavigate(assets[index + 1].id);
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [index, assets, onNavigate, onClose]);

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay dismisses on click; keyboard dismiss is handled via useEffect on window
		// biome-ignore lint/a11y/useKeyWithClickEvents: keyboard handling (Escape/Arrows) is registered on window in useEffect above
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
			onClick={onClose}
		>
			<button
				type="button"
				onClick={onClose}
				className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors z-10"
			>
				<X size={24} />
			</button>

			{assets.length > 1 && (
				<>
					{index > 0 && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onNavigate(assets[index - 1].id);
							}}
							className="absolute left-4 text-white/70 hover:text-white transition-colors z-10"
						>
							<ChevronLeft size={32} />
						</button>
					)}
					{index < assets.length - 1 && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onNavigate(assets[index + 1].id);
							}}
							className="absolute right-4 text-white/70 hover:text-white transition-colors z-10"
						>
							<ChevronRight size={32} />
						</button>
					)}
				</>
			)}

			{/* biome-ignore lint/a11y/noStaticElementInteractions: stops click from bubbling to backdrop; purely structural, not interactive */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only — no interactive intent for keyboard users */}
			<div
				className="max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3"
				onClick={(e) => e.stopPropagation()}
			>
				{asset.url ? (
					<video
						src={asset.url}
						controls
						autoPlay
						className="max-w-full max-h-[75vh] rounded-lg"
					>
						<track kind="captions" />
					</video>
				) : (
					<div className="w-[700px] aspect-video bg-muted/20 rounded-lg flex items-center justify-center">
						<p className="text-white/50 text-sm">No video available</p>
					</div>
				)}

				<div className="flex items-center gap-4 text-xs text-white/60">
					<span>
						{index + 1} / {assets.length}
					</span>
					{asset.model && <span>{asset.model.split("/").pop()}</span>}
					{asset.modelSettings?.duration && (
						<span>{String(asset.modelSettings.duration)}s</span>
					)}
					{asset.modelSettings?.mode && (
						<span>{String(asset.modelSettings.mode)}</span>
					)}
				</div>
			</div>
		</div>
	);
}
