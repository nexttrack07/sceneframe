import { AlertTriangle, Loader2, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import type {
	TransitionVideoSummary,
	TriggerRunSummary,
} from "../../project-types";
import { GeneratingTimer } from "./generating-timer";
import { VideoDetailDrawer } from "./video-detail-drawer";

export function VideoGrid({
	transitionVideos,
	deletingVideoId,
	onDelete,
	onSelect,
	isGenerating = false,
	runStatusesByVideoId = {},
}: {
	transitionVideos: TransitionVideoSummary[];
	deletingVideoId: string | null;
	onDelete: (id: string) => void;
	onSelect: (id: string) => void;
	isGenerating?: boolean;
	runStatusesByVideoId?: Record<string, TriggerRunSummary>;
}) {
	const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);

	// Filter out error records — errors surface as toasts, not grid items
	const sorted = [
		...transitionVideos.filter((tv) => tv.status !== "error"),
	].reverse();
	const expandedVideo = expandedId
		? (sorted.find((tv) => tv.id === expandedId) ?? null)
		: null;

	if (sorted.length === 0 && !isGenerating) {
		return (
			<div className="flex-1 flex items-center justify-center p-6">
				<div className="text-center space-y-2">
					<p className="text-sm text-muted-foreground">
						No transition videos yet
					</p>
					<p className="text-xs text-muted-foreground/70">
						Generate a video from the controls on the left
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="p-4 relative">
			<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3">
				Videos
			</p>
			<div className="grid grid-cols-3 gap-2">
				{/* Optimistic skeleton — only shown before the DB record appears */}
				{isGenerating && !sorted.some((tv) => tv.status === "generating") && (
					<div className="relative rounded-lg overflow-hidden border border-border bg-card aspect-video">
						<div className="absolute inset-0 bg-gradient-to-r from-card via-muted-foreground/15 to-card animate-pulse" />
						<div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
							<div className="w-8 h-8 rounded-full border-2 border-muted-foreground/40 border-t-foreground/60 animate-spin" />
							<GeneratingTimer />
						</div>
					</div>
				)}

				{sorted.map((tv) => (
					<div
						key={tv.id}
						className="relative rounded-lg overflow-hidden bg-muted group aspect-video"
					>
						{tv.status === "done" && tv.url ? (
							<>
								<button
									type="button"
									onClick={() => setLightboxUrl(tv.url)}
									className="w-full h-full relative"
								>
									<video
										src={tv.url}
										preload="metadata"
										className="w-full h-full object-cover pointer-events-none"
									>
										<track kind="captions" />
									</video>
									<div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors opacity-0 group-hover:opacity-100">
										<Play size={20} className="text-white fill-white" />
									</div>
								</button>
								{tv.isSelected && (
									<span className="absolute top-1.5 left-1.5 bg-primary text-primary-foreground text-[10px] font-medium px-1.5 py-0.5 rounded">
										Selected
									</span>
								)}
								{tv.stale && (
									<span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-amber-500/90 text-white text-[10px] px-1.5 py-0.5 rounded">
										<AlertTriangle size={9} />
									</span>
								)}
								<div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
									{!tv.isSelected && (
										<button
											type="button"
											onClick={() => onSelect(tv.id)}
											className="bg-white/90 text-black text-[10px] font-medium px-2 py-0.5 rounded hover:bg-white transition-colors"
										>
											Select
										</button>
									)}
									<button
										type="button"
										onClick={() => setExpandedId(tv.id)}
										className="bg-white/90 text-black text-[10px] font-medium px-2 py-0.5 rounded hover:bg-white transition-colors"
									>
										Info
									</button>
									<button
										type="button"
										onClick={() => onDelete(tv.id)}
										disabled={deletingVideoId === tv.id}
										className="bg-white/90 text-red-600 p-1 rounded hover:bg-white transition-colors disabled:opacity-50"
									>
										{deletingVideoId === tv.id ? (
											<Loader2 size={11} className="animate-spin" />
										) : (
											<Trash2 size={11} />
										)}
									</button>
								</div>
							</>
						) : tv.status === "generating" ? (
							<div className="absolute inset-0 border border-border bg-card overflow-hidden">
								<div className="absolute inset-0 bg-gradient-to-r from-card via-muted-foreground/15 to-card animate-pulse" />
								<div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
									<div className="w-8 h-8 rounded-full border-2 border-muted-foreground/40 border-t-foreground/60 animate-spin" />
									<div className="flex flex-col items-center gap-1">
										<span className="rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-foreground/70">
											{(() => {
												const runStatus = runStatusesByVideoId[tv.id];
												if (runStatus?.status === "completed")
													return "Finalizing";
												if (
													runStatus?.status === "failed" ||
													runStatus?.status === "canceled"
												)
													return "Failed";
												if (runStatus?.status === "retrying") return "Retrying";
												if (runStatus?.status === "running")
													return "Generating";
												if (runStatus?.status === "queued") return "Queued";
												return "Generating";
											})()}
										</span>
										<GeneratingTimer createdAt={tv.createdAt} />
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
