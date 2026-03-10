import { Check, Maximize2, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { SceneAssetSummary } from "../../project-types";
import { ImageLightbox } from "../image-lightbox";

export function ImageExpandView({
	asset,
	allLaneAssets,
	onSelect,
	onRegenerate,
	onClose,
	onLightboxChange,
}: {
	asset: SceneAssetSummary;
	allLaneAssets: SceneAssetSummary[];
	onSelect: () => void;
	onRegenerate: () => void;
	onClose: () => void;
	onLightboxChange?: (open: boolean) => void;
}) {
	const [showLightbox, setShowLightbox] = useState(false);

	function openLightbox() {
		setShowLightbox(true);
		onLightboxChange?.(true);
	}

	function closeLightbox() {
		setShowLightbox(false);
		onLightboxChange?.(false);
	}
	const doneAssets = allLaneAssets.filter((a) => a.status === "done");
	const lightboxIndex = doneAssets.findIndex((a) => a.id === asset.id);

	return (
		<div className="rounded-xl border-2 border-primary/20 bg-card p-4 space-y-3">
			<div className="flex items-start justify-between">
				<div className="text-xs text-muted-foreground space-y-0.5">
					{asset.model && <p>Model: {asset.model.split("/").pop()}</p>}
					<p>{new Date(asset.createdAt).toLocaleString()}</p>
				</div>
				<Button
					size="sm"
					variant="ghost"
					onClick={onClose}
					className="h-7 w-7 p-0"
				>
					<X size={14} />
				</Button>
			</div>

			{/* Full-size image */}
			{asset.url && (
				<img
					src={asset.url}
					alt="Expanded view"
					className="w-full rounded-lg object-contain max-h-[50vh]"
				/>
			)}

			{/* Prompt used */}
			{asset.prompt && (
				<div className="rounded bg-muted/50 px-3 py-2">
					<p className="text-[10px] text-muted-foreground font-medium mb-0.5">
						Prompt used
					</p>
					<p className="text-xs text-foreground/80 leading-relaxed">
						{asset.prompt}
					</p>
				</div>
			)}

			{/* Actions */}
			<div className="flex items-center gap-2">
				{!asset.isSelected && (
					<Button size="sm" onClick={onSelect} className="gap-1.5">
						<Check size={12} />
						Select
					</Button>
				)}
				<Button
					size="sm"
					variant="outline"
					onClick={onRegenerate}
					className="gap-1.5"
				>
					<RefreshCw size={12} />
					Regenerate
				</Button>
				{lightboxIndex >= 0 && (
					<Button
						size="sm"
						variant="outline"
						onClick={openLightbox}
						className="gap-1.5"
					>
						<Maximize2 size={12} />
						Lightbox
					</Button>
				)}
			</div>

			{showLightbox && lightboxIndex >= 0 && (
				<ImageLightbox
					assets={doneAssets}
					initialIndex={lightboxIndex}
					onClose={closeLightbox}
				/>
			)}
		</div>
	);
}
