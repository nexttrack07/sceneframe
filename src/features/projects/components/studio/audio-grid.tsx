import { useQueryClient } from "@tanstack/react-query";
import {
	Check,
	Download,
	Loader2,
	Mic,
	Music,
	Play,
	Square,
	Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { downloadRemoteAsset } from "../../download-client";
import type {
	BackgroundMusicAssetSummary,
	VoiceoverAssetSummary,
} from "../../project-types";
import { projectKeys } from "../../query-keys";
import { deleteVoiceoverAsset, selectVoiceover } from "../../audio-actions";

type AudioAsset = VoiceoverAssetSummary | BackgroundMusicAssetSummary;

function formatDuration(durationMs: number | null) {
	if (!durationMs) return null;
	return `${(durationMs / 1000).toFixed(1)}s`;
}

function sectionTitle(assetType: AudioAsset["type"]) {
	return assetType === "voiceover" ? "Voiceovers" : "Music / SFX";
}

function assetTitle(asset: AudioAsset) {
	if (asset.type === "voiceover") {
		return asset.prompt
			? `"${asset.prompt.slice(0, 56)}${asset.prompt.length > 56 ? "\u2026" : ""}"`
			: "Voiceover";
	}

	if (asset.model === "elevenlabs-sfx") return "Sound Effect";
	if (asset.model === "musicgen") return "Background Music";
	return asset.model ?? "Audio";
}

export function AudioGrid({
	projectId,
	voiceovers,
	backgroundMusic,
}: {
	projectId: string;
	voiceovers: VoiceoverAssetSummary[];
	backgroundMusic: BackgroundMusicAssetSummary[];
}) {
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [playingId, setPlayingId] = useState<string | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [selectingId, setSelectingId] = useState<string | null>(null);

	useEffect(() => {
		return () => {
			audioRef.current?.pause();
			audioRef.current = null;
		};
	}, []);

	const sections = useMemo(
		() =>
			[
				{
					key: "voiceovers",
					title: sectionTitle("voiceover"),
					assets: [...voiceovers].reverse(),
				},
				{
					key: "background",
					title: sectionTitle("background_music"),
					assets: [...backgroundMusic].reverse(),
				},
			].filter((section) => section.assets.length > 0),
		[backgroundMusic, voiceovers],
	);

	async function invalidate() {
		await queryClient.invalidateQueries({
			queryKey: projectKeys.project(projectId),
		});
	}

	function togglePlay(asset: AudioAsset) {
		if (!asset.url || asset.status !== "done") return;
		if (playingId === asset.id) {
			audioRef.current?.pause();
			setPlayingId(null);
			return;
		}
		audioRef.current?.pause();
		const audio = new Audio(asset.url);
		audioRef.current = audio;
		setPlayingId(asset.id);
		audio.addEventListener("ended", () => setPlayingId(null));
		audio.play().catch(() => setPlayingId(null));
	}

	async function handleDelete(assetId: string) {
		setDeletingId(assetId);
		try {
			await deleteVoiceoverAsset({ data: { assetId } });
			await invalidate();
		} catch (error) {
			toast(
				error instanceof Error ? error.message : "Failed to delete audio",
				"error",
			);
		} finally {
			setDeletingId(null);
		}
	}

	async function handleSelect(assetId: string) {
		setSelectingId(assetId);
		try {
			await selectVoiceover({ data: { assetId } });
			await invalidate();
		} catch (error) {
			toast(
				error instanceof Error ? error.message : "Failed to select audio",
				"error",
			);
		} finally {
			setSelectingId(null);
		}
	}

	if (sections.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center p-6">
				<div className="text-center space-y-2">
					<p className="text-sm text-muted-foreground">
						No audio generated yet
					</p>
					<p className="text-xs text-muted-foreground/70">
						Generate voiceover or music from the controls on the left
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto p-4 space-y-5">
			{sections.map((section) => (
				<div key={section.key} className="space-y-3">
					<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
						{section.title}
					</p>
					<div className="grid grid-cols-2 gap-3">
						{section.assets.map((asset) => (
							<div
								key={asset.id}
								className={`rounded-lg border p-3 space-y-3 ${
									asset.status === "error"
										? "border-destructive/30 bg-destructive/5"
										: asset.isSelected
											? "border-primary/30 bg-primary/5"
											: "border-border bg-card"
								}`}
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0 space-y-1">
										<p className="text-xs font-medium text-foreground truncate">
											{assetTitle(asset)}
										</p>
										<p className="text-[10px] text-muted-foreground/70 truncate">
											{asset.status === "done"
												? (formatDuration(asset.durationMs) ?? "Audio ready")
												: asset.status === "generating"
													? "Generating"
													: (asset.errorMessage ?? "Failed")}
										</p>
									</div>
									<div className="shrink-0 text-muted-foreground">
										{asset.type === "voiceover" ? (
											<Mic size={14} />
										) : (
											<Music size={14} />
										)}
									</div>
								</div>

								{asset.prompt && (
									<p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
										{asset.prompt}
									</p>
								)}

								<div className="flex items-center gap-1">
									<button
										type="button"
										onClick={() => togglePlay(asset)}
										disabled={asset.status !== "done" || !asset.url}
										className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground disabled:opacity-40"
										title="Play audio"
									>
										{asset.status === "generating" ? (
											<Loader2 size={13} className="animate-spin" />
										) : playingId === asset.id ? (
											<Square size={13} className="fill-current" />
										) : (
											<Play size={13} className="fill-current ml-0.5" />
										)}
									</button>
									<button
										type="button"
										onClick={() =>
											asset.url
												? void downloadRemoteAsset({
														url: asset.url,
														filenameBase: `audio-${asset.id}`,
														fallbackExtension: "mp3",
													})
												: undefined
										}
										disabled={asset.status !== "done" || !asset.url}
										className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-foreground disabled:opacity-40"
										title="Download audio"
									>
										<Download size={13} />
									</button>
									{asset.status === "done" && !asset.isSelected ? (
										<button
											type="button"
											onClick={() => handleSelect(asset.id)}
											disabled={selectingId === asset.id}
											className="flex h-8 flex-1 items-center justify-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground disabled:opacity-40"
										>
											{selectingId === asset.id ? (
												<Loader2 size={12} className="animate-spin" />
											) : (
												<Check size={12} />
											)}
											Select
										</button>
									) : asset.isSelected ? (
										<div className="flex h-8 flex-1 items-center justify-center gap-1 rounded-md bg-primary px-2 text-[11px] font-medium text-primary-foreground">
											<Check size={12} />
											Selected
										</div>
									) : (
										<div className="flex-1" />
									)}
									<button
										type="button"
										onClick={() => handleDelete(asset.id)}
										disabled={deletingId === asset.id}
										className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background text-destructive disabled:opacity-40"
										title="Delete audio"
									>
										{deletingId === asset.id ? (
											<Loader2 size={13} className="animate-spin" />
										) : (
											<Trash2 size={13} />
										)}
									</button>
								</div>
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
