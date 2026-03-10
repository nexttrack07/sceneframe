import {
	ChevronDown,
	ChevronUp,
	Image as ImageIcon,
	Loader2,
	Maximize2,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SceneAssetSummary } from "../project-types";
import { ImageLightbox } from "./image-lightbox";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export interface AssetBatch {
	batchId: string;
	createdAt: string;
	prompt: string | null;
	model: string | null;
	assets: SceneAssetSummary[];
}

export function groupIntoBatches(assets: SceneAssetSummary[]): AssetBatch[] {
	const map = new Map<string, SceneAssetSummary[]>();
	for (const asset of assets) {
		const key = asset.batchId ?? asset.createdAt.slice(0, 19);
		const existing = map.get(key) ?? [];
		existing.push(asset);
		map.set(key, existing);
	}
	const batches: AssetBatch[] = [];
	for (const [key, batchAssets] of map) {
		batches.push({
			batchId: key,
			createdAt: batchAssets[0].createdAt,
			prompt: batchAssets[0].prompt,
			model: batchAssets[0].model,
			assets: batchAssets,
		});
	}
	// newest first
	batches.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	return batches;
}

// ---------------------------------------------------------------------------
// AssetThumbnail — individual image tile with lightbox + select
// ---------------------------------------------------------------------------

function AssetThumbnail({
	asset,
	title,
	selectingAssetId,
	onSelect,
	onOpenLightbox,
	compact,
}: {
	asset: SceneAssetSummary;
	title: string;
	selectingAssetId: string | null;
	onSelect: () => void;
	onOpenLightbox?: () => void;
	compact?: boolean;
}) {
	return (
		<div
			className={`relative rounded overflow-hidden bg-muted group ${
				asset.isSelected ? "ring-2 ring-primary ring-offset-1" : ""
			}`}
		>
			{/* Image or placeholder */}
			{asset.url ? (
				<img
					src={asset.url}
					alt={title}
					className={`w-full ${compact ? "aspect-square" : "aspect-video"} object-cover block`}
				/>
			) : (
				<div
					className={`w-full ${compact ? "aspect-square" : "aspect-video"} ${
						asset.status === "error"
							? "bg-destructive/10"
							: "bg-muted animate-pulse"
					}`}
				/>
			)}

			{/* Hover overlay with actions */}
			{asset.status === "done" && asset.url && (
				<div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
					{/* Select button */}
					{!asset.isSelected && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onSelect();
							}}
							disabled={selectingAssetId === asset.id}
							className="bg-white/90 text-black text-[10px] font-medium px-2 py-1 rounded hover:bg-white transition-colors"
						>
							Select
						</button>
					)}
					{/* Expand button */}
					{onOpenLightbox && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onOpenLightbox();
							}}
							className="bg-white/90 text-black p-1 rounded hover:bg-white transition-colors"
						>
							<Maximize2 size={12} />
						</button>
					)}
				</div>
			)}

			{/* Status badges */}
			<div className="absolute top-1 right-1">
				{asset.isSelected ? (
					<span className="bg-primary text-primary-foreground text-[10px] font-medium px-1.5 py-0.5 rounded">
						✓
					</span>
				) : asset.status === "generating" ? (
					<Loader2 size={12} className="text-white drop-shadow animate-spin" />
				) : asset.status === "error" ? (
					<span className="bg-destructive text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
						Error
					</span>
				) : null}
			</div>

			{/* Error message */}
			{asset.status === "error" && asset.errorMessage ? (
				<div className="absolute inset-0 flex items-center justify-center p-1.5">
					<p className="text-[10px] leading-tight text-destructive text-center line-clamp-4 bg-background/80 rounded p-1">
						{asset.errorMessage}
					</p>
				</div>
			) : null}

			{/* Selecting spinner */}
			{selectingAssetId === asset.id ? (
				<div className="absolute inset-0 flex items-center justify-center bg-background/50">
					<Loader2 size={16} className="animate-spin text-primary" />
				</div>
			) : null}
		</div>
	);
}

// ---------------------------------------------------------------------------
// ImageLaneCard — enhanced with lightbox, prompt display, regen, history
// ---------------------------------------------------------------------------

interface ImageLaneCardProps {
	title: string;
	prompt: string;
	onPromptChange: (value: string) => void;
	isGenerating: boolean;
	onGenerate: () => void;
	allLaneAssets: SceneAssetSummary[];
	selectingAssetId: string | null;
	onSelectAsset: (assetId: string) => void;
}

export function ImageLaneCard({
	title,
	prompt,
	onPromptChange,
	isGenerating,
	onGenerate,
	allLaneAssets,
	selectingAssetId,
	onSelectAsset,
}: ImageLaneCardProps) {
	const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
	const [showHistory, setShowHistory] = useState(false);

	const batches = useMemo(
		() => groupIntoBatches(allLaneAssets),
		[allLaneAssets],
	);
	const latestBatch = batches[0];
	const olderBatches = batches.slice(1);
	const doneAssets = allLaneAssets.filter((a) => a.status === "done");
	const hasAnyDone = doneAssets.length > 0;

	// For lightbox, we show all done assets for this lane
	const lightboxAssets = doneAssets;

	return (
		<div className="rounded-lg border p-3 space-y-3">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<ImageIcon size={14} className="text-muted-foreground" />
					<span className="text-sm font-medium text-foreground">{title}</span>
					{doneAssets.length > 0 && (
						<span className="text-[10px] text-muted-foreground">
							{doneAssets.length} image{doneAssets.length !== 1 ? "s" : ""}
						</span>
					)}
				</div>
				<div className="flex items-center gap-1.5">
					{/* Regenerate same prompt */}
					{hasAnyDone && (
						<Tooltip>
							<TooltipTrigger asChild>
								<Button
									size="sm"
									variant="ghost"
									onClick={onGenerate}
									disabled={isGenerating}
									className="h-7 w-7 p-0"
								>
									<RefreshCw
										size={12}
										className={isGenerating ? "animate-spin" : ""}
									/>
								</Button>
							</TooltipTrigger>
							<TooltipContent>
								<p>Regenerate with same prompt</p>
							</TooltipContent>
						</Tooltip>
					)}
					<Button size="sm" onClick={onGenerate} disabled={isGenerating}>
						{isGenerating ? (
							<Loader2 size={12} className="animate-spin mr-1.5" />
						) : null}
						{isGenerating ? "Generating…" : "Generate"}
					</Button>
				</div>
			</div>

			{/* Prompt textarea */}
			<Textarea
				value={prompt}
				onChange={(e) => onPromptChange(e.target.value)}
				rows={3}
				className="text-sm bg-background"
				placeholder="Optional prompt override"
			/>

			{/* Latest batch */}
			{!latestBatch ? (
				<p className="text-xs text-muted-foreground">No candidates yet.</p>
			) : (
				<div className="space-y-2">
					{/* Prompt used for latest batch */}
					{latestBatch.prompt && (
						<div className="rounded bg-muted/50 px-2.5 py-1.5">
							<p className="text-[10px] text-muted-foreground font-medium mb-0.5">
								Prompt used
							</p>
							<p
								className="text-[11px] text-foreground/80 line-clamp-2"
								title={latestBatch.prompt}
							>
								{latestBatch.prompt}
							</p>
						</div>
					)}

					{/* Image grid */}
					<div className="grid grid-cols-2 gap-1.5">
						{latestBatch.assets.map((asset) => {
							const lightboxIdx = lightboxAssets.findIndex(
								(a) => a.id === asset.id,
							);
							return (
								<AssetThumbnail
									key={asset.id}
									asset={asset}
									title={title}
									selectingAssetId={selectingAssetId}
									onSelect={() => onSelectAsset(asset.id)}
									onOpenLightbox={
										lightboxIdx >= 0
											? () => setLightboxIndex(lightboxIdx)
											: undefined
									}
								/>
							);
						})}
					</div>

					{/* Reject all + regenerate */}
					{latestBatch.assets.some(
						(a) => a.status === "done" && !a.isSelected,
					) && (
						<Button
							size="sm"
							variant="ghost"
							onClick={onGenerate}
							disabled={isGenerating}
							className="w-full text-xs text-muted-foreground hover:text-foreground gap-1.5"
						>
							<Trash2 size={11} />
							Reject all & regenerate
						</Button>
					)}
				</div>
			)}

			{/* Generation history toggle */}
			{olderBatches.length > 0 && (
				<div className="space-y-2">
					<button
						type="button"
						onClick={() => setShowHistory((prev) => !prev)}
						className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						{showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
						{olderBatches.length} earlier generation
						{olderBatches.length !== 1 ? "s" : ""}
					</button>

					{showHistory && (
						<div className="space-y-3">
							{olderBatches.map((batch) => (
								<div
									key={batch.batchId}
									className="rounded border bg-muted/20 p-2 space-y-2"
								>
									<div className="flex items-center justify-between">
										<p className="text-[10px] text-muted-foreground">
											{new Date(batch.createdAt).toLocaleString()}
										</p>
										{batch.model && (
											<p className="text-[10px] text-muted-foreground">
												{batch.model.split("/").pop()}
											</p>
										)}
									</div>
									{batch.prompt && (
										<p
											className="text-[10px] text-muted-foreground/70 line-clamp-1"
											title={batch.prompt}
										>
											{batch.prompt}
										</p>
									)}
									<div className="grid grid-cols-3 gap-1">
										{batch.assets.map((asset) => {
											const lightboxIdx = lightboxAssets.findIndex(
												(a) => a.id === asset.id,
											);
											return (
												<AssetThumbnail
													key={asset.id}
													asset={asset}
													title={title}
													selectingAssetId={selectingAssetId}
													onSelect={() => onSelectAsset(asset.id)}
													onOpenLightbox={
														lightboxIdx >= 0
															? () => setLightboxIndex(lightboxIdx)
															: undefined
													}
													compact
												/>
											);
										})}
									</div>
								</div>
							))}
						</div>
					)}
				</div>
			)}

			{/* Lightbox */}
			{lightboxIndex !== null && lightboxAssets.length > 0 && (
				<ImageLightbox
					assets={lightboxAssets}
					initialIndex={lightboxIndex}
					onClose={() => setLightboxIndex(null)}
				/>
			)}
		</div>
	);
}
