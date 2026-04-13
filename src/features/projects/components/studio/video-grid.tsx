import { AlertTriangle, Download, Loader2, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { downloadRemoteAsset } from "../../download-client";
import type { BaseVideoSummary, TriggerRunSummary } from "../../project-types";
import {
	getVideoStatusBadgeClass,
	getVideoStatusLabel,
	isPendingVideoStatus,
} from "../../video-status";
import { GeneratingTimer } from "./generating-timer";
import { VideoDetailDrawer } from "./video-detail-drawer";

// Type guard for transition videos (which have the stale property)
function hasStaleProperty(
	video: BaseVideoSummary,
): video is BaseVideoSummary & { stale: boolean } {
	return "stale" in video;
}

function getAspectRatioLabel(video: BaseVideoSummary) {
	const raw = video.modelSettings?.aspect_ratio;
	if (typeof raw === "string" && raw.trim()) return raw;
	return null;
}

function getAspectRatioValue(video: BaseVideoSummary) {
	const aspect = getAspectRatioLabel(video);
	switch (aspect) {
		case "1:1":
			return "1 / 1";
		case "9:16":
		case "portrait":
			return "9 / 16";
		case "16:9":
		case "landscape":
			return "16 / 9";
		case "4:3":
			return "4 / 3";
		case "3:4":
			return "3 / 4";
		case "3:2":
			return "3 / 2";
		case "2:3":
			return "2 / 3";
		default:
			return "16 / 9";
	}
}

export function VideoGrid({
	videos,
	deletingVideoId,
	onDelete,
	onSelect,
	isGenerating = false,
	runStatusesByVideoId = {},
	emptyMessage = "No videos yet",
	emptySubMessage = "Generate a video from the controls on the left",
}: {
	videos: BaseVideoSummary[];
	deletingVideoId: string | null;
	onDelete: (id: string) => void;
	onSelect: (id: string) => void;
	isGenerating?: boolean;
	runStatusesByVideoId?: Record<string, TriggerRunSummary>;
	emptyMessage?: string;
	emptySubMessage?: string;
}) {
	const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);

	// Filter out error records and "done" records without URLs (prompt drafts)
	// Errors surface as toasts, prompt drafts are not actual videos
	const sorted = [...videos.filter((v) => v.status !== "error" && !(v.status === "done" && !v.url))].reverse();
	const expandedVideo = expandedId
		? (sorted.find((v) => v.id === expandedId) ?? null)
		: null;

	if (sorted.length === 0 && !isGenerating) {
		return (
			<div className="flex-1 flex items-center justify-center p-6">
				<div className="text-center space-y-2">
					<p className="text-sm text-muted-foreground">{emptyMessage}</p>
					<p className="text-xs text-muted-foreground/70">{emptySubMessage}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="p-4 relative">
			<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3">
				Videos
			</p>
			<div className="columns-2 gap-2 md:columns-3">
				{/* Optimistic skeleton — only shown before the DB record appears */}
				{isGenerating &&
					!sorted.some((v) => isPendingVideoStatus(v.status)) && (
						<div className="relative mb-2 break-inside-avoid overflow-hidden rounded-lg border border-border bg-card aspect-video">
							<div className="absolute inset-0 bg-gradient-to-r from-card via-muted-foreground/15 to-card animate-pulse" />
							<div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
								<div className="w-8 h-8 rounded-full border-2 border-muted-foreground/40 border-t-foreground/60 animate-spin" />
								<GeneratingTimer />
							</div>
						</div>
					)}

				{sorted.map((video) => (
					<div
						key={video.id}
						className={`relative mb-2 break-inside-avoid overflow-hidden rounded-lg bg-muted group transition-all duration-150 hover:scale-[1.02] hover:shadow-lg ${
							video.isSelected ? "ring-2 ring-primary ring-offset-2 scale-[1.01] shadow-lg" : ""
						}`}
						style={{ aspectRatio: getAspectRatioValue(video) }}
					>
						{video.status === "done" && video.url ? (
							<>
								<button
									type="button"
									onClick={() => setLightboxUrl(video.url)}
									className="w-full h-full relative"
								>
									<video
										src={video.url}
										preload="metadata"
										className="block h-full w-full object-cover pointer-events-none"
									>
										<track kind="captions" />
									</video>
									<div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors opacity-0 group-hover:opacity-100">
										<Play size={20} className="text-white fill-white" />
									</div>
								</button>
								{getAspectRatioLabel(video) && (
									<span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
										{getAspectRatioLabel(video)}
									</span>
								)}
								{video.isSelected && (
									<span className="absolute top-1.5 left-[4.75rem] bg-primary text-primary-foreground text-[10px] font-medium px-1.5 py-0.5 rounded">
										Selected
									</span>
								)}
								{hasStaleProperty(video) && video.stale && (
									<span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-warning/90 text-warning-foreground text-[10px] px-1.5 py-0.5 rounded">
										<AlertTriangle size={9} />
									</span>
								)}
								<div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
									{!video.isSelected && (
										<button
											type="button"
											onClick={() => onSelect(video.id)}
											className="bg-white/90 text-black text-[10px] font-medium px-2 py-0.5 rounded hover:bg-white transition-colors"
										>
											Select
										</button>
									)}
									<button
										type="button"
										onClick={() => setExpandedId(video.id)}
										className="bg-white/90 text-black text-[10px] font-medium px-2 py-0.5 rounded hover:bg-white transition-colors"
									>
										Info
									</button>
									<button
										type="button"
										onClick={() =>
											video.url
												? void downloadRemoteAsset({
														url: video.url,
														filenameBase: `video-${video.id}`,
														fallbackExtension: "mp4",
													})
												: undefined
										}
										className="bg-white/90 text-black p-1 rounded hover:bg-white transition-colors"
										title="Download video"
									>
										<Download size={11} />
									</button>
									<button
										type="button"
										onClick={() => onDelete(video.id)}
										disabled={deletingVideoId === video.id}
										className="bg-white/90 text-destructive p-1 rounded hover:bg-white transition-colors disabled:opacity-50"
									>
										{deletingVideoId === video.id ? (
											<Loader2 size={11} className="animate-spin" />
										) : (
											<Trash2 size={11} />
										)}
									</button>
								</div>
							</>
						) : isPendingVideoStatus(video.status) ? (
							<div className="absolute inset-0 border border-border bg-card overflow-hidden">
								<div className="absolute inset-0 bg-gradient-to-r from-card via-muted-foreground/15 to-card animate-pulse" />
								<div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
									<div className="w-8 h-8 rounded-full border-2 border-muted-foreground/40 border-t-foreground/60 animate-spin" />
									<div className="flex flex-col items-center gap-1">
										<span
											className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${getVideoStatusBadgeClass(
												{
													videoStatus: video.status,
													runStatus: runStatusesByVideoId[video.id]?.status,
												},
											)}`}
										>
											{getVideoStatusLabel({
												videoStatus: video.status,
												runStatus: runStatusesByVideoId[video.id]?.status,
											})}
										</span>
										<GeneratingTimer createdAt={video.createdAt} />
									</div>
								</div>
							</div>
						) : null}
					</div>
				))}
			</div>

			{/* Metadata side drawer */}
			<VideoDetailDrawer
				video={expandedVideo}
				deletingVideoId={deletingVideoId}
				onClose={() => setExpandedId(null)}
				onDelete={(id) => {
					onDelete(id);
					setExpandedId(null);
				}}
				onSelect={onSelect}
			/>

			{/* Lightbox */}
			{lightboxUrl && (
				// biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay; close button provides keyboard dismiss
				// biome-ignore lint/a11y/useKeyWithClickEvents: close button provides keyboard dismiss
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
					onClick={() => setLightboxUrl(null)}
				>
					<button
						type="button"
						onClick={() => setLightboxUrl(null)}
						className="absolute top-4 right-4 text-white/70 hover:text-white z-10"
					>
						✕
					</button>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: stops click from bubbling to backdrop */}
					{/* biome-ignore lint/a11y/useKeyWithClickEvents: stopPropagation only */}
					<div
						onClick={(e) => e.stopPropagation()}
						className="max-w-[90vw] max-h-[85vh]"
					>
						<video
							src={lightboxUrl}
							controls
							autoPlay
							className="max-w-full max-h-[80vh] rounded-lg"
						>
							<track kind="captions" />
						</video>
					</div>
				</div>
			)}
		</div>
	);
}
