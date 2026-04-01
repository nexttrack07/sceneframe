import {
	Download,
	Info,
	Loader2,
	Maximize2,
	Pencil,
	Trash2,
} from "lucide-react";
import { downloadRemoteAsset } from "../../download-client";
import type { SceneAssetSummary, TriggerRunSummary } from "../../project-types";
import { GeneratingTimer } from "./generating-timer";

function getImageAspectRatioLabel(asset: SceneAssetSummary) {
	const raw = asset.modelSettings?.aspect_ratio;
	if (typeof raw === "string" && raw.trim()) return raw;
	return null;
}

export function GalleryImageCard({
	asset,
	runStatus,
	selectingAssetId,
	deletingAssetId,
	onSelect,
	onExpand,
	onLightbox,
	onDelete,
	onEdit,
	onInfo,
}: {
	asset: SceneAssetSummary;
	runStatus?: TriggerRunSummary;
	selectingAssetId: string | null;
	deletingAssetId: string | null;
	onSelect: () => void;
	onExpand: () => void;
	onLightbox: () => void;
	onDelete: () => void;
	onEdit?: () => void;
	onInfo?: () => void;
}) {
	const isDeleting = deletingAssetId === asset.id;
	const isClickable = asset.status === "done" && !!asset.url;
	const aspectRatioLabel = getImageAspectRatioLabel(asset);
	const loadingLabel =
		runStatus?.status === "completed"
			? "Finalizing"
			: runStatus?.status === "failed" || runStatus?.status === "canceled"
				? "Failed"
				: runStatus?.status === "retrying"
					? "Retrying"
					: runStatus?.status === "running"
						? "Generating"
						: runStatus?.status === "queued"
							? "Queued"
							: "Generating";
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: role="button" and onKeyDown are present for keyboard users; interactive card can't easily be a <button> due to nested <button> descendants
		<div
			role={isClickable ? "button" : undefined}
			tabIndex={isClickable ? 0 : undefined}
			className={`relative mb-3 break-inside-avoid overflow-hidden rounded-lg bg-muted group ${
				isClickable ? "cursor-pointer" : "cursor-default"
			} ${asset.isSelected ? "ring-2 ring-primary ring-offset-2" : ""}`}
			onClick={isClickable ? onExpand : undefined}
			onKeyDown={
				isClickable
					? (e) => {
							if (e.key === "Enter" || e.key === " ") onExpand();
						}
					: undefined
			}
		>
			{/* Image or placeholder */}
			{asset.url ? (
				<img src={asset.url} alt="" className="block h-auto w-full" />
			) : asset.status === "error" ? (
				<div className="w-full aspect-video bg-destructive/10" />
			) : (
				<div className="w-full aspect-video relative overflow-hidden rounded-md border border-border bg-card">
					<div className="absolute inset-0 bg-gradient-to-r from-card via-muted-foreground/15 to-card animate-pulse" />
					<div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
						<div className="w-8 h-8 rounded-full border-2 border-muted-foreground/40 border-t-foreground/60 animate-spin" />
						<div className="flex flex-col items-center gap-1">
							<span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground/70">
								{loadingLabel}
							</span>
							<GeneratingTimer
								createdAt={runStatus?.createdAt ?? asset.createdAt}
								startedAt={runStatus?.startedAt}
							/>
						</div>
					</div>
				</div>
			)}

			{/* Hover overlay */}
			{asset.status === "done" && asset.url && (
				<div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
					{!asset.isSelected && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onSelect();
							}}
							disabled={selectingAssetId === asset.id}
							className="bg-white/90 text-black text-xs font-medium px-3 py-1.5 rounded-md hover:bg-white transition-colors"
						>
							Select
						</button>
					)}
					{onEdit && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onEdit();
							}}
							className="bg-white/90 text-black p-1.5 rounded-md hover:bg-white transition-colors"
							title="Edit with reference"
						>
							<Pencil size={14} />
						</button>
					)}
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							if (!asset.url) return;
							void downloadRemoteAsset({
								url: asset.url,
								filenameBase: `image-${asset.id}`,
								fallbackExtension: "jpg",
							});
						}}
						className="bg-white/90 text-black p-1.5 rounded-md hover:bg-white transition-colors"
						title="Download image"
					>
						<Download size={14} />
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onLightbox();
						}}
						className="bg-white/90 text-black p-1.5 rounded-md hover:bg-white transition-colors"
						title="Full screen"
					>
						<Maximize2 size={14} />
					</button>
					{onInfo && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onInfo();
							}}
							className="bg-white/90 text-black p-1.5 rounded-md hover:bg-white transition-colors"
							title="View details"
						>
							<Info size={14} />
						</button>
					)}
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDelete();
						}}
						disabled={isDeleting}
						className="bg-white/90 text-red-600 p-1.5 rounded-md hover:bg-white transition-colors disabled:opacity-50"
					>
						{isDeleting ? (
							<Loader2 size={14} className="animate-spin" />
						) : (
							<Trash2 size={14} />
						)}
					</button>
				</div>
			)}

			{/* Status badges */}
			<div className="absolute top-2 right-2">
				{asset.isSelected ? (
					<span className="bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5 rounded-md">
						Selected
					</span>
				) : asset.status === "error" ? (
					<span className="bg-destructive text-white text-xs font-medium px-2 py-0.5 rounded-md">
						Error
					</span>
				) : null}
			</div>
			{aspectRatioLabel && asset.status === "done" && (
				<div className="absolute top-2 left-2">
					<span className="rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white">
						{aspectRatioLabel}
					</span>
				</div>
			)}

			{/* Error message */}
			{asset.status === "error" && asset.errorMessage && (
				<div className="absolute inset-0 flex items-center justify-center p-3">
					<p className="text-xs leading-tight text-destructive text-center line-clamp-4 bg-background/80 rounded p-2">
						{asset.errorMessage}
					</p>
				</div>
			)}

			{/* Selecting spinner */}
			{selectingAssetId === asset.id && (
				<div className="absolute inset-0 flex items-center justify-center bg-background/50">
					<Loader2 size={20} className="animate-spin text-primary" />
				</div>
			)}
		</div>
	);
}
