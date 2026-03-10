import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { SceneAssetSummary } from "../project-types";

export function ImageLightbox({
	assets,
	initialIndex,
	onClose,
}: {
	assets: SceneAssetSummary[];
	initialIndex: number;
	onClose: () => void;
}) {
	const [index, setIndex] = useState(initialIndex);
	const asset = assets[index];

	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") onClose();
			if (e.key === "ArrowLeft")
				setIndex((i) => (i > 0 ? i - 1 : assets.length - 1));
			if (e.key === "ArrowRight")
				setIndex((i) => (i < assets.length - 1 ? i + 1 : 0));
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [assets.length, onClose]);

	if (!asset) return null;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
			onClick={onClose}
		>
			{/* Close button */}
			<button
				type="button"
				onClick={onClose}
				className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors z-10"
			>
				<X size={24} />
			</button>

			{/* Navigation arrows */}
			{assets.length > 1 && (
				<>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							setIndex((i) => (i > 0 ? i - 1 : assets.length - 1));
						}}
						className="absolute left-4 text-white/70 hover:text-white transition-colors z-10"
					>
						<ChevronLeft size={32} />
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							setIndex((i) => (i < assets.length - 1 ? i + 1 : 0));
						}}
						className="absolute right-4 text-white/70 hover:text-white transition-colors z-10"
					>
						<ChevronRight size={32} />
					</button>
				</>
			)}

			{/* Image */}
			<div
				className="max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3"
				onClick={(e) => e.stopPropagation()}
			>
				{asset.url ? (
					<img
						src={asset.url}
						alt="Full resolution preview"
						className="max-w-full max-h-[75vh] object-contain rounded-lg"
					/>
				) : (
					<div className="w-[600px] aspect-video bg-muted/20 rounded-lg flex items-center justify-center">
						<p className="text-white/50 text-sm">No image available</p>
					</div>
				)}

				{/* Info bar */}
				<div className="flex items-center gap-4 text-xs text-white/60">
					<span>
						{index + 1} / {assets.length}
					</span>
					{asset.isSelected && (
						<span className="text-emerald-400 font-medium">Selected</span>
					)}
					{asset.model && <span>Model: {asset.model.split("/").pop()}</span>}
					{asset.prompt && (
						<span className="max-w-md truncate" title={asset.prompt}>
							Prompt: {asset.prompt}
						</span>
					)}
				</div>
			</div>
		</div>
	);
}
