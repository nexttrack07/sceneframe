import { Check, Clock, Download, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadRemoteAsset } from "../../download-client";
import type { BaseVideoSummary } from "../../project-types";
import {
	getVideoStatusBadgeClass,
	getVideoStatusLabel,
} from "../../video-status";

function formatSettingLabel(key: string) {
	return key
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

// Type guard for transition videos (which have the stale property)
function hasStaleProperty(
	video: BaseVideoSummary,
): video is BaseVideoSummary & { stale: boolean } {
	return "stale" in video;
}

export function VideoDetailDrawer({
	video,
	deletingVideoId,
	onClose,
	onDelete,
	onSelect,
}: {
	video: BaseVideoSummary | null;
	deletingVideoId: string | null;
	onClose: () => void;
	onDelete: (id: string) => void;
	onSelect: (id: string) => void;
}) {
	if (!video) return null;
	const videoSettings = video.modelSettings
		? Object.entries(video.modelSettings).filter(
				([key, value]) =>
					value !== null && value !== undefined && key !== "prompt",
			)
		: [];

	return (
		<>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop overlay dismisses on click; keyboard dismiss via close button available */}
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: close button provides keyboard accessible dismiss */}
			<div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
			<div className="fixed top-0 right-0 bottom-0 z-50 w-[340px] border-l bg-card flex flex-col overflow-y-auto shadow-xl animate-in slide-in-from-right duration-200">
				<div className="px-4 py-3 border-b flex items-center justify-between">
					<h4 className="text-sm font-semibold">Video Details</h4>
					<Button
						size="sm"
						variant="ghost"
						onClick={onClose}
						className="h-7 w-7 p-0"
					>
						<X size={14} />
					</Button>
				</div>
				<div className="p-4 space-y-4">
					{video.url && (
						<video
							src={video.url}
							controls
							className="w-full rounded-lg border border-border"
						>
							<track kind="captions" />
						</video>
					)}
					<div className="flex items-center gap-2">
						{!video.isSelected && video.status === "done" && (
							<Button
								size="sm"
								onClick={() => {
									onSelect(video.id);
								}}
								className="gap-1.5 flex-1"
							>
								<Check size={12} /> Select
							</Button>
						)}
						{video.status === "done" && video.url && (
							<Button
								size="sm"
								variant="outline"
								onClick={() => {
									if (!video.url) return;
									void downloadRemoteAsset({
										url: video.url,
										filenameBase: `video-${video.id}`,
										fallbackExtension: "mp4",
									});
								}}
								className="gap-1.5 flex-1"
							>
								<Download size={12} /> Download
							</Button>
						)}
						<Button
							size="sm"
							variant="outline"
							onClick={() => {
								onDelete(video.id);
							}}
							disabled={deletingVideoId === video.id}
							className="gap-1.5 text-destructive hover:text-destructive flex-1"
						>
							<Trash2 size={12} /> Delete
						</Button>
					</div>
					<div className="space-y-3 text-xs">
						<MetaRow
							icon={<Clock size={12} />}
							label="Generated"
							value={new Date(video.createdAt).toLocaleString()}
						/>
						{video.model && (
							<MetaRow
								label="Model"
								value={video.model.split("/").pop() ?? video.model}
							/>
						)}
						<MetaRow
							label="Status"
							value={
								<span
									className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${getVideoStatusBadgeClass(
										{
											videoStatus: video.status,
										},
									)}`}
								>
									{getVideoStatusLabel({ videoStatus: video.status })}
								</span>
							}
						/>
						{videoSettings.map(([key, value]) => (
							<MetaRow
								key={key}
								label={formatSettingLabel(key)}
								value={String(value)}
							/>
						))}
						{video.prompt && (
							<div className="space-y-1">
								<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
									Motion prompt
								</p>
								<p className="text-foreground/80 leading-relaxed bg-muted/50 rounded-lg px-3 py-2">
									{video.prompt}
								</p>
							</div>
						)}
						{video.isSelected && <MetaRow label="Selected" value="Yes" />}
						{hasStaleProperty(video) && video.stale && (
							<MetaRow label="Warning" value="Stale — source images changed" />
						)}
					</div>
				</div>
			</div>
		</>
	);
}

function MetaRow({
	icon,
	label,
	value,
}: {
	icon?: React.ReactNode;
	label: string;
	value: React.ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-2">
			<span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
				{icon}
				{label}
			</span>
			<span className="text-foreground text-right max-w-[180px] break-words">
				{value}
			</span>
		</div>
	);
}
