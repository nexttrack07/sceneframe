import { ChevronLeft, ChevronRight, Image, Music, Video } from "lucide-react";
import { useMemo, useState } from "react";
import type { Scene, Shot } from "@/db/schema";
import type {
	BackgroundMusicAssetSummary,
	SceneAssetSummary,
	ShotVideoSummary,
	TransitionVideoSummary,
	VoiceoverAssetSummary,
} from "@/features/projects/project-types";
import { createEditorAssetLabeler } from "../asset-labels";

// ---------------------------------------------------------------------------
// Drag payload type
// ---------------------------------------------------------------------------

interface DragPayload {
	type: "image" | "video" | "audio";
	assetId: string;
	url: string;
	width?: number;
	height?: number;
	durationMs?: number;
	filename: string;
}

function startDrag(e: React.DragEvent, payload: DragPayload) {
	e.dataTransfer.setData(
		"application/x-sceneframe-asset",
		JSON.stringify(payload),
	);
	e.dataTransfer.effectAllowed = "copy";
}

// ---------------------------------------------------------------------------
// Tab type
// ---------------------------------------------------------------------------

type TabId = "images" | "videos" | "audio";

// ---------------------------------------------------------------------------
// AssetThumbnail — image draggable
// ---------------------------------------------------------------------------

function AssetThumbnail({
	asset,
	label,
	filename,
}: {
	asset: SceneAssetSummary & { url: string };
	label: string;
	filename: string;
}) {
	const payload: DragPayload = {
		type: "image",
		assetId: `asset-img-${asset.id}`,
		url: asset.url,
		filename,
	};

	return (
		<button
			type="button"
			className="relative group cursor-grab active:cursor-grabbing"
			draggable
			onDragStart={(e) => startDrag(e, payload)}
			aria-label={label}
		>
			<img
				src={asset.url}
				alt="Shot asset"
				className="w-full aspect-video object-cover rounded-md border border-zinc-700 hover:ring-2 ring-blue-500 transition-all"
			/>
			{asset.prompt && (
				<div className="absolute inset-0 hidden group-hover:flex bg-black/70 rounded-md items-end p-1 z-10">
					<p className="text-[9px] text-zinc-200 line-clamp-3 leading-tight">
						{asset.prompt}
					</p>
				</div>
			)}
			<div className="mt-1">
				<p className="text-[10px] text-zinc-300 leading-tight line-clamp-2">
					{label}
				</p>
			</div>
		</button>
	);
}

// ---------------------------------------------------------------------------
// TransitionThumbnail — video draggable
// ---------------------------------------------------------------------------

function TransitionThumbnail({
	tv,
	label,
	filename,
}: {
	tv: { id: string; url: string };
	label: string;
	filename: string;
}) {
	const payload: DragPayload = {
		type: "video",
		assetId: `asset-tv-${tv.id}`,
		url: tv.url,
		filename,
	};

	return (
		<button
			type="button"
			className="relative cursor-grab active:cursor-grabbing"
			draggable
			onDragStart={(e) => startDrag(e, payload)}
			aria-label={label}
		>
			<video
				src={tv.url}
				className="w-full aspect-video object-cover rounded-md border border-zinc-700 hover:ring-2 ring-blue-500 transition-all"
				muted
			/>
			<div className="absolute bottom-1 left-1 flex items-center gap-0.5 bg-black/70 rounded px-1 py-0.5">
				<Video size={8} className="text-zinc-300" />
				<span className="text-[8px] text-zinc-300 uppercase tracking-wide">
					Video
				</span>
			</div>
			<div className="mt-1">
				<p className="text-[10px] text-zinc-300 leading-tight line-clamp-2">
					{label}
				</p>
			</div>
		</button>
	);
}

// ---------------------------------------------------------------------------
// VoiceoverItem — audio draggable
// ---------------------------------------------------------------------------

function AudioAssetItem({
	audio,
	label,
	filename,
}: {
	audio: (VoiceoverAssetSummary | BackgroundMusicAssetSummary) & {
		url: string;
	};
	label: string;
	filename: string;
}) {
	const durationLabel = audio.durationMs
		? `${(audio.durationMs / 1000).toFixed(1)}s`
		: null;

	const payload: DragPayload = {
		type: "audio",
		assetId: `asset-audio-${audio.id}`,
		url: audio.url,
		durationMs: audio.durationMs ?? undefined,
		filename,
	};

	return (
		<button
			type="button"
			className="flex items-center gap-2 p-2 rounded-md bg-zinc-800 border border-zinc-700 hover:ring-2 ring-blue-500 cursor-grab active:cursor-grabbing transition-all"
			draggable
			onDragStart={(e) => startDrag(e, payload)}
			aria-label={label}
		>
			<Music size={12} className="text-zinc-400 flex-shrink-0" />
			<span className="text-[10px] text-zinc-300 truncate flex-1">{label}</span>
			{durationLabel && (
				<span className="text-[9px] text-zinc-500 flex-shrink-0">
					{durationLabel}
				</span>
			)}
		</button>
	);
}

// ---------------------------------------------------------------------------
// Tab Button
// ---------------------------------------------------------------------------

function TabButton({
	active,
	onClick,
	icon: Icon,
	label,
	count,
}: {
	active: boolean;
	onClick: () => void;
	icon: typeof Image;
	label: string;
	count: number;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[10px] font-medium uppercase tracking-wide transition-colors ${
				active
					? "text-zinc-200 border-b-2 border-blue-500"
					: "text-zinc-500 hover:text-zinc-300 border-b-2 border-transparent"
			}`}
		>
			<Icon size={12} />
			<span>{label}</span>
			<span
				className={`px-1 py-0.5 rounded text-[9px] ${
					active ? "bg-blue-500/20 text-blue-400" : "bg-zinc-800 text-zinc-500"
				}`}
			>
				{count}
			</span>
		</button>
	);
}

// ---------------------------------------------------------------------------
// Images Tab Content
// ---------------------------------------------------------------------------

function ImagesTabContent({
	scenes,
	assets,
	shots,
}: {
	scenes: Scene[];
	assets: SceneAssetSummary[];
	shots: Shot[];
}) {
	const labels = useMemo(
		() => createEditorAssetLabeler({ scenes, shots }),
		[scenes, shots],
	);

	const filteredAssets = assets.filter(
		(a): a is SceneAssetSummary & { url: string } =>
			a.isSelected && a.status === "done" && a.url != null,
	);

	if (filteredAssets.length === 0) {
		return (
			<p className="text-[11px] text-zinc-600 text-center pt-8">
				No images yet
			</p>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-2">
			{filteredAssets.map((asset) => {
				const label = labels.imageLabel(asset, filteredAssets);
				return (
					<AssetThumbnail
						key={asset.id}
						asset={asset}
						label={label}
						filename={labels.fileName(label, "jpg")}
					/>
				);
			})}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Videos Tab Content
// ---------------------------------------------------------------------------

function VideosTabContent({
	scenes,
	shotVideoAssets,
	transitionVideos,
	shots,
}: {
	scenes: Scene[];
	shotVideoAssets: ShotVideoSummary[];
	transitionVideos: TransitionVideoSummary[];
	shots: Shot[];
}) {
	const labels = useMemo(
		() => createEditorAssetLabeler({ scenes, shots }),
		[scenes, shots],
	);

	const filteredTransitionVideos = transitionVideos.filter(
		(tv): tv is TransitionVideoSummary & { url: string } =>
			tv.isSelected && tv.status === "done" && tv.url != null,
	);
	const filteredShotVideos = shotVideoAssets.filter(
		(video): video is ShotVideoSummary & { url: string } =>
			video.isSelected && video.status === "done" && video.url != null,
	);

	if (
		filteredTransitionVideos.length === 0 &&
		filteredShotVideos.length === 0
	) {
		return (
			<p className="text-[11px] text-zinc-600 text-center pt-8">
				No video clips yet
			</p>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-2">
			{filteredShotVideos.map((video) => {
				const label = labels.shotVideoLabel(video, filteredShotVideos);
				return (
					<TransitionThumbnail
						key={video.id}
						tv={video}
						label={label}
						filename={labels.fileName(label, "mp4")}
					/>
				);
			})}
			{filteredTransitionVideos.map((tv) => {
				const label = labels.transitionVideoLabel(tv, filteredTransitionVideos);
				return (
					<TransitionThumbnail
						key={tv.id}
						tv={tv}
						label={label}
						filename={labels.fileName(label, "mp4")}
					/>
				);
			})}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Audio Tab Content
// ---------------------------------------------------------------------------

function AudioTabContent({
	scenes,
	shots,
	voiceovers,
	backgroundMusic,
}: {
	scenes: Scene[];
	shots: Shot[];
	voiceovers: VoiceoverAssetSummary[];
	backgroundMusic: BackgroundMusicAssetSummary[];
}) {
	const labels = useMemo(
		() => createEditorAssetLabeler({ scenes, shots }),
		[scenes, shots],
	);
	const filteredVoiceovers = voiceovers.filter(
		(vo): vo is VoiceoverAssetSummary & { url: string } =>
			vo.status === "done" && vo.url != null,
	);
	const filteredBackgroundMusic = backgroundMusic.filter(
		(track): track is BackgroundMusicAssetSummary & { url: string } =>
			track.status === "done" && track.url != null,
	);

	if (filteredVoiceovers.length === 0 && filteredBackgroundMusic.length === 0) {
		return (
			<p className="text-[11px] text-zinc-600 text-center pt-8">No audio yet</p>
		);
	}

	return (
		<div className="space-y-2">
			{filteredVoiceovers.map((vo) => {
				const label = labels.voiceoverLabel(vo, filteredVoiceovers);
				return (
					<AudioAssetItem
						key={vo.id}
						audio={vo}
						label={label}
						filename={labels.fileName(label, "mp3")}
					/>
				);
			})}
			{filteredBackgroundMusic.map((track) => {
				const label = labels.backgroundMusicLabel(
					track,
					filteredBackgroundMusic,
				);
				return (
					<AudioAssetItem
						key={track.id}
						audio={track}
						label={label}
						filename={labels.fileName(label, "mp3")}
					/>
				);
			})}
		</div>
	);
}

// ---------------------------------------------------------------------------
// ShotLibraryPanel
// ---------------------------------------------------------------------------

interface ShotLibraryPanelProps {
	scenes: Scene[];
	shots: Shot[];
	assets: SceneAssetSummary[];
	shotVideoAssets: ShotVideoSummary[];
	transitionVideos: TransitionVideoSummary[];
	voiceovers: VoiceoverAssetSummary[];
	backgroundMusic: BackgroundMusicAssetSummary[];
}

export function ShotLibraryPanel({
	scenes,
	shots,
	assets,
	shotVideoAssets,
	transitionVideos,
	voiceovers,
	backgroundMusic,
}: ShotLibraryPanelProps) {
	const [collapsed, setCollapsed] = useState(false);
	const [activeTab, setActiveTab] = useState<TabId>("images");

	const counts = useMemo(() => {
		return {
			images: assets.filter(
				(a) => a.isSelected && a.status === "done" && a.url != null,
			).length,
			videos:
				transitionVideos.filter(
					(tv) => tv.isSelected && tv.status === "done" && tv.url != null,
				).length +
				shotVideoAssets.filter(
					(video) =>
						video.isSelected && video.status === "done" && video.url != null,
				).length,
			audio:
				voiceovers.filter((vo) => vo.status === "done" && vo.url != null)
					.length +
				backgroundMusic.filter(
					(track) => track.status === "done" && track.url != null,
				).length,
		};
	}, [assets, shotVideoAssets, transitionVideos, voiceovers, backgroundMusic]);

	if (collapsed) {
		return (
			<div className="flex flex-col items-center w-8 h-full bg-zinc-950 border-r border-zinc-800 py-3">
				<button
					type="button"
					onClick={() => setCollapsed(false)}
					className="text-zinc-400 hover:text-zinc-200 transition-colors"
					title="Expand Asset Library"
				>
					<ChevronRight size={16} />
				</button>
			</div>
		);
	}

	return (
		<div className="flex flex-col w-[280px] h-full bg-zinc-950 border-r border-zinc-800 flex-shrink-0 transition-all">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2.5 border-b border-zinc-800">
				<span className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
					Asset Library
				</span>
				<button
					type="button"
					onClick={() => setCollapsed(true)}
					className="text-zinc-500 hover:text-zinc-300 transition-colors"
					title="Collapse"
				>
					<ChevronLeft size={14} />
				</button>
			</div>

			{/* Tabs */}
			<div className="flex border-b border-zinc-800">
				<TabButton
					active={activeTab === "images"}
					onClick={() => setActiveTab("images")}
					icon={Image}
					label="Images"
					count={counts.images}
				/>
				<TabButton
					active={activeTab === "videos"}
					onClick={() => setActiveTab("videos")}
					icon={Video}
					label="Videos"
					count={counts.videos}
				/>
				<TabButton
					active={activeTab === "audio"}
					onClick={() => setActiveTab("audio")}
					icon={Music}
					label="Audio"
					count={counts.audio}
				/>
			</div>

			{/* Tab content */}
			<div className="flex-1 overflow-y-auto p-3">
				{activeTab === "images" && (
					<ImagesTabContent scenes={scenes} assets={assets} shots={shots} />
				)}
				{activeTab === "videos" && (
					<VideosTabContent
						scenes={scenes}
						shotVideoAssets={shotVideoAssets}
						transitionVideos={transitionVideos}
						shots={shots}
					/>
				)}
				{activeTab === "audio" && (
					<AudioTabContent
						scenes={scenes}
						shots={shots}
						voiceovers={voiceovers}
						backgroundMusic={backgroundMusic}
					/>
				)}
			</div>
		</div>
	);
}
