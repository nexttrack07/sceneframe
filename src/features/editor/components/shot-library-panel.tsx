import {
	ChevronLeft,
	ChevronRight,
	Image,
	Music,
	Video,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { Shot } from "@/db/schema";
import type {
	SceneAssetSummary,
	TransitionVideoSummary,
	VoiceoverAssetSummary,
} from "@/features/projects/project-types";

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
	shotIndex,
}: {
	asset: SceneAssetSummary;
	shotIndex?: number;
}) {
	const [showPrompt, setShowPrompt] = useState(false);

	const payload: DragPayload = {
		type: "image",
		assetId: `asset-img-${asset.id}`,
		url: asset.url!,
		filename: `image-${asset.id}.jpg`,
	};

	return (
		<div
			className="relative group cursor-grab active:cursor-grabbing"
			draggable
			onDragStart={(e) => startDrag(e, payload)}
			onMouseEnter={() => setShowPrompt(true)}
			onMouseLeave={() => setShowPrompt(false)}
		>
			<img
				src={asset.url!}
				alt="Shot asset"
				className="w-full aspect-video object-cover rounded-md border border-zinc-700 hover:ring-2 ring-blue-500 transition-all"
			/>
			{shotIndex !== undefined && (
				<div className="absolute top-1 left-1 bg-black/70 rounded px-1.5 py-0.5">
					<span className="text-[9px] text-zinc-300 font-medium">
						Shot {shotIndex + 1}
					</span>
				</div>
			)}
			{showPrompt && asset.prompt && (
				<div className="absolute inset-0 bg-black/70 rounded-md flex items-end p-1 z-10">
					<p className="text-[9px] text-zinc-200 line-clamp-3 leading-tight">
						{asset.prompt}
					</p>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// TransitionThumbnail — video draggable
// ---------------------------------------------------------------------------

function TransitionThumbnail({
	tv,
	shotIndex,
}: {
	tv: TransitionVideoSummary;
	shotIndex?: number;
}) {
	const payload: DragPayload = {
		type: "video",
		assetId: `asset-tv-${tv.id}`,
		url: tv.url!,
		filename: `clip-${tv.id}.mp4`,
	};

	return (
		<div
			className="relative cursor-grab active:cursor-grabbing"
			draggable
			onDragStart={(e) => startDrag(e, payload)}
		>
			<video
				src={tv.url!}
				className="w-full aspect-video object-cover rounded-md border border-zinc-700 hover:ring-2 ring-blue-500 transition-all"
				muted
			/>
			<div className="absolute bottom-1 left-1 flex items-center gap-0.5 bg-black/70 rounded px-1 py-0.5">
				<Video size={8} className="text-zinc-300" />
				<span className="text-[8px] text-zinc-300 uppercase tracking-wide">
					Clip
				</span>
			</div>
			{shotIndex !== undefined && (
				<div className="absolute top-1 left-1 bg-black/70 rounded px-1.5 py-0.5">
					<span className="text-[9px] text-zinc-300 font-medium">
						Shot {shotIndex + 1}
					</span>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// VoiceoverItem — audio draggable
// ---------------------------------------------------------------------------

function VoiceoverItem({ vo }: { vo: VoiceoverAssetSummary }) {
	const durationLabel = vo.durationMs
		? `${(vo.durationMs / 1000).toFixed(1)}s`
		: null;

	const payload: DragPayload = {
		type: "audio",
		assetId: `asset-vo-${vo.id}`,
		url: vo.url!,
		durationMs: vo.durationMs ?? undefined,
		filename: `voiceover-${vo.id}.mp3`,
	};

	return (
		<div
			className="flex items-center gap-2 p-2 rounded-md bg-zinc-800 border border-zinc-700 hover:ring-2 ring-blue-500 cursor-grab active:cursor-grabbing transition-all"
			draggable
			onDragStart={(e) => startDrag(e, payload)}
		>
			<Music size={12} className="text-zinc-400 flex-shrink-0" />
			<span className="text-[10px] text-zinc-300 truncate flex-1">
				Voiceover
			</span>
			{durationLabel && (
				<span className="text-[9px] text-zinc-500 flex-shrink-0">
					{durationLabel}
				</span>
			)}
		</div>
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
	assets,
	shots,
}: {
	assets: SceneAssetSummary[];
	shots: Shot[];
}) {
	const shotIndexMap = useMemo(() => {
		const map = new Map<string, number>();
		shots.forEach((shot, idx) => map.set(shot.id, idx));
		return map;
	}, [shots]);

	const filteredAssets = assets.filter(
		(a) => a.isSelected && a.status === "done" && a.url != null,
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
			{filteredAssets.map((asset) => (
				<AssetThumbnail
					key={asset.id}
					asset={asset}
					shotIndex={asset.shotId ? shotIndexMap.get(asset.shotId) : undefined}
				/>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Videos Tab Content
// ---------------------------------------------------------------------------

function VideosTabContent({
	transitionVideos,
	shots,
}: {
	transitionVideos: TransitionVideoSummary[];
	shots: Shot[];
}) {
	const shotIndexMap = useMemo(() => {
		const map = new Map<string, number>();
		shots.forEach((shot, idx) => map.set(shot.id, idx));
		return map;
	}, [shots]);

	const filteredVideos = transitionVideos.filter(
		(tv) => tv.isSelected && tv.status === "done" && tv.url != null,
	);

	if (filteredVideos.length === 0) {
		return (
			<p className="text-[11px] text-zinc-600 text-center pt-8">
				No video clips yet
			</p>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-2">
			{filteredVideos.map((tv) => (
				<TransitionThumbnail
					key={tv.id}
					tv={tv}
					shotIndex={shotIndexMap.get(tv.fromShotId)}
				/>
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Audio Tab Content
// ---------------------------------------------------------------------------

function AudioTabContent({
	voiceovers,
}: {
	voiceovers: VoiceoverAssetSummary[];
}) {
	const filteredVoiceovers = voiceovers.filter(
		(vo) => vo.isSelected && vo.status === "done" && vo.url != null,
	);

	if (filteredVoiceovers.length === 0) {
		return (
			<p className="text-[11px] text-zinc-600 text-center pt-8">
				No audio yet
			</p>
		);
	}

	return (
		<div className="space-y-2">
			{filteredVoiceovers.map((vo) => (
				<VoiceoverItem key={vo.id} vo={vo} />
			))}
		</div>
	);
}

// ---------------------------------------------------------------------------
// ShotLibraryPanel
// ---------------------------------------------------------------------------

interface ShotLibraryPanelProps {
	shots: Shot[];
	assets: SceneAssetSummary[];
	transitionVideos: TransitionVideoSummary[];
	voiceovers: VoiceoverAssetSummary[];
}

export function ShotLibraryPanel({
	shots,
	assets,
	transitionVideos,
	voiceovers,
}: ShotLibraryPanelProps) {
	const [collapsed, setCollapsed] = useState(false);
	const [activeTab, setActiveTab] = useState<TabId>("images");

	const counts = useMemo(() => {
		return {
			images: assets.filter(
				(a) => a.isSelected && a.status === "done" && a.url != null,
			).length,
			videos: transitionVideos.filter(
				(tv) => tv.isSelected && tv.status === "done" && tv.url != null,
			).length,
			audio: voiceovers.filter(
				(vo) => vo.isSelected && vo.status === "done" && vo.url != null,
			).length,
		};
	}, [assets, transitionVideos, voiceovers]);

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
					<ImagesTabContent assets={assets} shots={shots} />
				)}
				{activeTab === "videos" && (
					<VideosTabContent transitionVideos={transitionVideos} shots={shots} />
				)}
				{activeTab === "audio" && (
					<AudioTabContent voiceovers={voiceovers} />
				)}
			</div>
		</div>
	);
}
