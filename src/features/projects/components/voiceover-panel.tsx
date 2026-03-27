import { useQueryClient } from "@tanstack/react-query";
import {
	Check,
	ChevronDown,
	Loader2,
	Mic,
	Music,
	Play,
	RotateCcw,
	Square,
	Trash2,
	Volume2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { Scene } from "@/db/schema";
import type {
	BackgroundMusicAssetSummary,
	VoiceoverAssetSummary,
} from "../project-types";
import { projectKeys } from "../query-keys";
import {
	deleteVoiceoverAsset,
	fetchElevenLabsVoices,
	generateBackgroundMusic,
	generateSoundEffectAudio,
	generateVoiceoverAudio,
	generateVoiceoverScript,
	selectVoiceover,
} from "../scene-actions";

interface Voice {
	id: string;
	name: string;
	category: string;
	labels: Record<string, string>;
	previewUrl: string | null;
}

type AudioTab = "voiceover" | "sfx";
type SfxProvider = "elevenlabs" | "musicgen";

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George

export function VoiceoverPanel({
	scene,
	projectId,
	voiceovers,
	backgroundMusic,
	sceneVideoDurationSec,
}: {
	scene: Scene;
	projectId: string;
	voiceovers: VoiceoverAssetSummary[];
	backgroundMusic: BackgroundMusicAssetSummary[];
	sceneVideoDurationSec: number;
}) {
	const queryClient = useQueryClient();
	const { toast } = useToast();
	const [activeTab, setActiveTab] = useState<AudioTab>("voiceover");

	// Shared audio playback
	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [playingId, setPlayingId] = useState<string | null>(null);
	const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

	useEffect(() => {
		return () => {
			audioRef.current?.pause();
			audioRef.current = null;
		};
	}, []);

	const invalidate = useCallback(
		() =>
			queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			}),
		[queryClient, projectId],
	);

	const handlePlayPause = useCallback(
		(asset: { id: string; url: string | null }) => {
			if (!asset.url) return;
			if (playingId === asset.id) {
				audioRef.current?.pause();
				setPlayingId(null);
				return;
			}
			if (audioRef.current) audioRef.current.pause();
			const audio = new Audio(asset.url);
			audioRef.current = audio;
			setPlayingId(asset.id);
			audio.addEventListener("ended", () => setPlayingId(null));
			audio.play().catch(() => setPlayingId(null));
		},
		[playingId],
	);

	const handleDelete = useCallback(
		async (assetId: string) => {
			setIsDeletingId(assetId);
			try {
				await deleteVoiceoverAsset({ data: { assetId } });
				await invalidate();
			} catch (err) {
				toast(
					err instanceof Error ? err.message : "Failed to delete asset",
					"error",
				);
			} finally {
				setIsDeletingId(null);
			}
		},
		[invalidate, toast],
	);

	const handleSelect = useCallback(
		async (assetId: string) => {
			try {
				await selectVoiceover({ data: { assetId } });
				await invalidate();
			} catch (err) {
				toast(
					err instanceof Error ? err.message : "Failed to select asset",
					"error",
				);
			}
		},
		[invalidate, toast],
	);

	return (
		<div className="space-y-3">
			{/* Tab switcher */}
			<div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
				<button
					type="button"
					onClick={() => setActiveTab("voiceover")}
					className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
						activeTab === "voiceover"
							? "bg-background text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground"
					}`}
				>
					<Mic size={11} />
					Voiceover
				</button>
				<button
					type="button"
					onClick={() => setActiveTab("sfx")}
					className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
						activeTab === "sfx"
							? "bg-background text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground"
					}`}
				>
					<Music size={11} />
					Sound Effects
				</button>
			</div>

			{activeTab === "voiceover" ? (
				<VoiceoverTab
					scene={scene}
					voiceovers={voiceovers}
					sceneVideoDurationSec={sceneVideoDurationSec}
					playingId={playingId}
					isDeletingId={isDeletingId}
					onPlayPause={handlePlayPause}
					onDelete={handleDelete}
					onSelect={handleSelect}
					invalidate={invalidate}
				/>
			) : (
				<SoundEffectsTab
					scene={scene}
					backgroundMusic={backgroundMusic}
					playingId={playingId}
					isDeletingId={isDeletingId}
					onPlayPause={handlePlayPause}
					onDelete={handleDelete}
					onSelect={handleSelect}
					invalidate={invalidate}
				/>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Voiceover Tab (original functionality)
// ---------------------------------------------------------------------------

function VoiceoverTab({
	scene,
	voiceovers,
	sceneVideoDurationSec,
	playingId,
	isDeletingId,
	onPlayPause,
	onDelete,
	onSelect,
	invalidate,
}: {
	scene: Scene;
	voiceovers: VoiceoverAssetSummary[];
	sceneVideoDurationSec: number;
	playingId: string | null;
	isDeletingId: string | null;
	onPlayPause: (asset: { id: string; url: string | null }) => void;
	onDelete: (id: string) => void;
	onSelect: (id: string) => void;
	invalidate: () => Promise<void>;
}) {
	const { toast } = useToast();
	const [targetDuration, setTargetDuration] = useState(
		sceneVideoDurationSec > 0 ? sceneVideoDurationSec : 10,
	);

	const [script, setScript] = useState(
		() =>
			voiceovers
				.filter((v) => v.prompt)
				.sort(
					(a, b) =>
						new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
				)[0]?.prompt ?? "",
	);
	const [isGeneratingScript, setIsGeneratingScript] = useState(false);
	const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);

	// Voice selection
	const [voices, setVoices] = useState<Voice[]>([]);
	const [isLoadingVoices, setIsLoadingVoices] = useState(false);
	const [selectedVoiceId, setSelectedVoiceId] = useState(DEFAULT_VOICE_ID);
	const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false);
	const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(
		null,
	);
	const previewAudioRef = useRef<HTMLAudioElement | null>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!isVoiceDropdownOpen) return;
		const handleClick = (e: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			) {
				setIsVoiceDropdownOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [isVoiceDropdownOpen]);

	useEffect(() => {
		return () => {
			previewAudioRef.current?.pause();
			previewAudioRef.current = null;
		};
	}, []);

	const selectedVoice = useMemo(
		() => voices.find((v) => v.id === selectedVoiceId),
		[voices, selectedVoiceId],
	);

	const handleLoadVoices = useCallback(async () => {
		if (voices.length > 0) {
			setIsVoiceDropdownOpen(true);
			return;
		}
		setIsLoadingVoices(true);
		try {
			const result = await fetchElevenLabsVoices({
				data: { sceneId: scene.id },
			});
			setVoices(result);
			setIsVoiceDropdownOpen(true);
		} catch (err) {
			toast(
				err instanceof Error ? err.message : "Failed to load voices",
				"error",
			);
		} finally {
			setIsLoadingVoices(false);
		}
	}, [voices.length, scene.id, toast]);

	const handlePreviewVoice = useCallback(
		(voice: Voice) => {
			if (!voice.previewUrl) return;
			if (previewingVoiceId === voice.id) {
				previewAudioRef.current?.pause();
				setPreviewingVoiceId(null);
				return;
			}
			if (previewAudioRef.current) previewAudioRef.current.pause();
			const audio = new Audio(voice.previewUrl);
			previewAudioRef.current = audio;
			setPreviewingVoiceId(voice.id);
			audio.addEventListener("ended", () => setPreviewingVoiceId(null));
			audio.play().catch(() => setPreviewingVoiceId(null));
		},
		[previewingVoiceId],
	);

	const handleGenerateScript = useCallback(async () => {
		setIsGeneratingScript(true);
		try {
			const result = await generateVoiceoverScript({
				data: { sceneId: scene.id, targetDurationSec: targetDuration },
			});
			setScript(result.script);
		} catch (err) {
			toast(
				err instanceof Error ? err.message : "Failed to generate script",
				"error",
			);
		} finally {
			setIsGeneratingScript(false);
		}
	}, [scene.id, targetDuration, toast]);

	const handleGenerateAudio = useCallback(async () => {
		if (!script.trim()) {
			toast("Write or generate a script first", "error");
			return;
		}
		setIsGeneratingAudio(true);
		try {
			await generateVoiceoverAudio({
				data: {
					sceneId: scene.id,
					script: script.trim(),
					voiceId: selectedVoiceId,
				},
			});
			await invalidate();
			toast("Voiceover generated", "success");
		} catch (err) {
			toast(
				err instanceof Error ? err.message : "Failed to generate voiceover",
				"error",
			);
		} finally {
			setIsGeneratingAudio(false);
		}
	}, [scene.id, script, selectedVoiceId, invalidate, toast]);

	const formatLabels = useCallback((labels: Record<string, string>) => {
		const parts: string[] = [];
		if (labels.accent) parts.push(labels.accent);
		if (labels.age) parts.push(labels.age);
		if (labels.gender) parts.push(labels.gender);
		if (labels.use_case) parts.push(labels.use_case);
		return parts.join(" · ");
	}, []);

	const wordCount = script.split(/\s+/).filter(Boolean).length;
	const estimatedNarrationSec = wordCount > 0 ? wordCount / 2.5 : 0;
	const isOverTarget =
		estimatedNarrationSec > 0 && estimatedNarrationSec > targetDuration * 1.1;

	return (
		<>
			{/* Duration info bar */}
			<div className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-2">
				<div className="flex items-center justify-between">
					<div className="text-[10px] text-muted-foreground">
						Scene video:{" "}
						<span className="text-foreground font-medium">
							{sceneVideoDurationSec > 0
								? `${sceneVideoDurationSec}s`
								: "no clips"}
						</span>
					</div>
					{estimatedNarrationSec > 0 && (
						<div
							className={`text-[10px] font-medium ${isOverTarget ? "text-destructive" : "text-muted-foreground"}`}
						>
							~{estimatedNarrationSec.toFixed(1)}s narration
						</div>
					)}
				</div>
				<div className="flex items-center justify-between">
					<span className="text-[10px] text-muted-foreground">
						Target duration
					</span>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => setTargetDuration((d) => Math.max(1, d - 1))}
							className="w-5 h-5 rounded flex items-center justify-center bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors"
						>
							-
						</button>
						<span className="text-xs font-medium text-foreground w-8 text-center tabular-nums">
							{targetDuration}s
						</span>
						<button
							type="button"
							onClick={() => setTargetDuration((d) => Math.min(300, d + 1))}
							className="w-5 h-5 rounded flex items-center justify-center bg-muted hover:bg-muted/80 text-foreground text-xs font-medium transition-colors"
						>
							+
						</button>
					</div>
				</div>
			</div>

			{/* Voice selector */}
			<div className="space-y-2">
				<p className="text-xs font-medium text-muted-foreground">Voice</p>
				<div ref={dropdownRef} className="relative">
					<button
						type="button"
						onClick={handleLoadVoices}
						disabled={isLoadingVoices}
						className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground hover:border-border/80 transition-colors"
					>
						<span className="truncate">
							{isLoadingVoices
								? "Loading voices..."
								: selectedVoice
									? selectedVoice.name
									: "George (default)"}
						</span>
						{isLoadingVoices ? (
							<Loader2 size={14} className="shrink-0 animate-spin" />
						) : (
							<ChevronDown
								size={14}
								className="shrink-0 text-muted-foreground"
							/>
						)}
					</button>

					{isVoiceDropdownOpen && voices.length > 0 && (
						<div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
							{voices.map((voice) => (
								<div
									key={voice.id}
									className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
										voice.id === selectedVoiceId
											? "bg-primary/10 text-primary"
											: "hover:bg-muted/50 text-foreground"
									}`}
								>
									<button
										type="button"
										className="flex-1 min-w-0 text-left"
										onClick={() => {
											setSelectedVoiceId(voice.id);
											setIsVoiceDropdownOpen(false);
										}}
									>
										<p className="text-sm truncate">{voice.name}</p>
										{Object.keys(voice.labels).length > 0 && (
											<p className="text-[10px] text-muted-foreground/70 truncate">
												{formatLabels(voice.labels)}
											</p>
										)}
									</button>
									{voice.previewUrl && (
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												handlePreviewVoice(voice);
											}}
											className="shrink-0 w-6 h-6 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
										>
											{previewingVoiceId === voice.id ? (
												<Square size={8} className="fill-current" />
											) : (
												<Volume2 size={10} className="text-muted-foreground" />
											)}
										</button>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			</div>

			{/* Script section */}
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<p className="text-xs font-medium text-muted-foreground">
						Narration Script
					</p>
					<Button
						size="sm"
						variant="ghost"
						className="h-6 text-xs gap-1"
						disabled={isGeneratingScript}
						onClick={handleGenerateScript}
					>
						{isGeneratingScript ? (
							<Loader2 size={10} className="animate-spin" />
						) : (
							<RotateCcw size={10} />
						)}
						{script ? "Regenerate" : "Auto-generate"}
					</Button>
				</div>
				<textarea
					value={script}
					onChange={(e) => setScript(e.target.value)}
					placeholder="Write narration for this scene, or click auto-generate..."
					rows={5}
					className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-background placeholder:text-muted-foreground"
				/>
				{script && (
					<p
						className={`text-[10px] ${isOverTarget ? "text-destructive" : "text-muted-foreground/70"}`}
					>
						~{wordCount} words / ~{estimatedNarrationSec.toFixed(1)}s
						{isOverTarget
							? ` (${(estimatedNarrationSec - targetDuration).toFixed(1)}s over target)`
							: ""}
					</p>
				)}
			</div>

			{/* Generate audio button */}
			<Button
				size="sm"
				className="w-full gap-1.5"
				disabled={!script.trim() || isGeneratingAudio}
				onClick={handleGenerateAudio}
			>
				{isGeneratingAudio ? (
					<Loader2 size={12} className="animate-spin" />
				) : (
					<Mic size={12} />
				)}
				{isGeneratingAudio ? "Generating voiceover..." : "Generate Voiceover"}
			</Button>

			{/* Existing voiceovers */}
			<AudioAssetList
				assets={voiceovers}
				label="Generated Voiceovers"
				playingId={playingId}
				isDeletingId={isDeletingId}
				onPlayPause={onPlayPause}
				onDelete={onDelete}
				onSelect={onSelect}
			/>
		</>
	);
}

// ---------------------------------------------------------------------------
// Sound Effects / Music Tab
// ---------------------------------------------------------------------------

function SoundEffectsTab({
	scene,
	backgroundMusic,
	playingId,
	isDeletingId,
	onPlayPause,
	onDelete,
	onSelect,
	invalidate,
}: {
	scene: Scene;
	backgroundMusic: BackgroundMusicAssetSummary[];
	playingId: string | null;
	isDeletingId: string | null;
	onPlayPause: (asset: { id: string; url: string | null }) => void;
	onDelete: (id: string) => void;
	onSelect: (id: string) => void;
	invalidate: () => Promise<void>;
}) {
	const { toast } = useToast();
	const [provider, setProvider] = useState<SfxProvider>("elevenlabs");
	const [prompt, setPrompt] = useState("");
	const [duration, setDuration] = useState(8);
	const [isGenerating, setIsGenerating] = useState(false);

	const handleGenerate = useCallback(async () => {
		if (!prompt.trim()) {
			toast("Describe the sound you want to generate", "error");
			return;
		}
		setIsGenerating(true);
		try {
			if (provider === "elevenlabs") {
				await generateSoundEffectAudio({
					data: {
						sceneId: scene.id,
						prompt: prompt.trim(),
						durationSeconds: duration,
					},
				});
			} else {
				await generateBackgroundMusic({
					data: {
						sceneId: scene.id,
						prompt: prompt.trim(),
						durationSeconds: duration,
					},
				});
			}
			await invalidate();
			toast(
				provider === "elevenlabs"
					? "Sound effect generated"
					: "Background music generated",
				"success",
			);
		} catch (err) {
			toast(
				err instanceof Error ? err.message : "Audio generation failed",
				"error",
			);
		} finally {
			setIsGenerating(false);
		}
	}, [scene.id, prompt, duration, provider, invalidate, toast]);

	return (
		<>
			{/* Provider selector */}
			<div className="space-y-2">
				<p className="text-xs font-medium text-muted-foreground">Provider</p>
				<div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
					<button
						type="button"
						onClick={() => setProvider("elevenlabs")}
						className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
							provider === "elevenlabs"
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						ElevenLabs SFX
					</button>
					<button
						type="button"
						onClick={() => setProvider("musicgen")}
						className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
							provider === "musicgen"
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						MusicGen
					</button>
				</div>
				<p className="text-[10px] text-muted-foreground/70">
					{provider === "elevenlabs"
						? "Sound effects, ambience, foley — uses your ElevenLabs key"
						: "Musical loops, melodies, ambient music — uses your Replicate key"}
				</p>
			</div>

			{/* Prompt */}
			<div className="space-y-2">
				<p className="text-xs font-medium text-muted-foreground">Description</p>
				<textarea
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder={
						provider === "elevenlabs"
							? "Rain on a tin roof with distant thunder..."
							: "Upbeat lo-fi hip hop beat with mellow piano chords..."
					}
					rows={3}
					className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-background placeholder:text-muted-foreground"
				/>
			</div>

			{/* Duration */}
			<div className="space-y-2">
				<div className="flex items-center justify-between">
					<p className="text-xs font-medium text-muted-foreground">Duration</p>
					<span className="text-xs text-muted-foreground">{duration}s</span>
				</div>
				<input
					type="range"
					min={1}
					max={provider === "elevenlabs" ? 22 : 30}
					step={1}
					value={duration}
					onChange={(e) => setDuration(Number(e.target.value))}
					className="w-full accent-primary"
				/>
				<div className="flex justify-between text-[10px] text-muted-foreground/70">
					<span>1s</span>
					<span>{provider === "elevenlabs" ? "22s" : "30s"}</span>
				</div>
			</div>

			{/* Generate button */}
			<Button
				size="sm"
				className="w-full gap-1.5"
				disabled={!prompt.trim() || isGenerating}
				onClick={handleGenerate}
			>
				{isGenerating ? (
					<Loader2 size={12} className="animate-spin" />
				) : (
					<Music size={12} />
				)}
				{isGenerating
					? "Generating..."
					: provider === "elevenlabs"
						? "Generate Sound Effect"
						: "Generate Music"}
			</Button>

			{/* Existing background music */}
			<AudioAssetList
				assets={backgroundMusic}
				label="Generated Audio"
				playingId={playingId}
				isDeletingId={isDeletingId}
				onPlayPause={onPlayPause}
				onDelete={onDelete}
				onSelect={onSelect}
			/>
		</>
	);
}

// ---------------------------------------------------------------------------
// Shared audio asset list (used by both tabs)
// ---------------------------------------------------------------------------

function AudioAssetList({
	assets,
	label,
	playingId,
	isDeletingId,
	onPlayPause,
	onDelete,
	onSelect,
}: {
	assets: (VoiceoverAssetSummary | BackgroundMusicAssetSummary)[];
	label: string;
	playingId: string | null;
	isDeletingId: string | null;
	onPlayPause: (asset: { id: string; url: string | null }) => void;
	onDelete: (id: string) => void;
	onSelect: (id: string) => void;
}) {
	if (assets.length === 0) return null;

	return (
		<div className="space-y-2">
			<p className="text-xs font-medium text-muted-foreground">{label}</p>
			{assets.map((asset) => (
				<div
					key={asset.id}
					className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
						asset.status === "error"
							? "border-destructive/30 bg-destructive/5"
							: asset.isSelected
								? "border-primary/30 bg-primary/5"
								: "border-border bg-muted/20"
					}`}
				>
					{asset.status === "done" && asset.url ? (
						<button
							type="button"
							onClick={() => onPlayPause(asset)}
							className="shrink-0 w-7 h-7 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
						>
							{playingId === asset.id ? (
								<Square size={10} className="fill-current" />
							) : (
								<Play size={10} className="fill-current ml-0.5" />
							)}
						</button>
					) : asset.status === "generating" ? (
						<div className="shrink-0 w-7 h-7 rounded-full bg-muted flex items-center justify-center">
							<Loader2
								size={10}
								className="animate-spin text-muted-foreground"
							/>
						</div>
					) : null}

					<div className="flex-1 min-w-0">
						{asset.status === "error" ? (
							<p className="text-xs text-destructive truncate">
								{asset.errorMessage ?? "Generation failed"}
							</p>
						) : asset.status === "generating" ? (
							<p className="text-xs text-muted-foreground">Generating...</p>
						) : asset.type === "voiceover" ? (
							// Voiceovers: script excerpt is the meaningful identifier
							<>
								<p className="text-xs text-foreground truncate">
									{asset.prompt
										? `"${asset.prompt.slice(0, 50)}${asset.prompt.length > 50 ? "\u2026" : ""}"`
										: "Voiceover"}
								</p>
								<p className="text-[10px] text-muted-foreground/70 mt-0.5">
									{asset.durationMs
										? `${(asset.durationMs / 1000).toFixed(1)}s`
										: "Audio ready"}
								</p>
							</>
						) : (
							// SFX / background music: show model tag + duration
							<>
								<p className="text-xs text-foreground truncate">
									<span className="text-muted-foreground">
										{asset.model === "elevenlabs-sfx"
											? "SFX"
											: asset.model === "musicgen"
												? "MusicGen"
												: (asset.model ?? "Audio")}{" "}
										·{" "}
									</span>
									{asset.durationMs
										? `${(asset.durationMs / 1000).toFixed(1)}s`
										: "Audio ready"}
								</p>
								{asset.prompt && (
									<p className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
										{asset.prompt.slice(0, 80)}
										{asset.prompt.length > 80 ? "\u2026" : ""}
									</p>
								)}
							</>
						)}
					</div>

					{asset.status === "done" && !asset.isSelected && (
						<button
							type="button"
							onClick={() => onSelect(asset.id)}
							className="shrink-0 p-1 text-muted-foreground hover:text-primary transition-colors"
							title="Use this audio"
						>
							<Check size={12} />
						</button>
					)}
					{asset.isSelected && (
						<span className="shrink-0 p-1 text-primary" title="Selected">
							<Check size={12} />
						</span>
					)}
					<button
						type="button"
						onClick={() => onDelete(asset.id)}
						disabled={isDeletingId === asset.id}
						className="shrink-0 p-1 text-muted-foreground hover:text-destructive transition-colors"
					>
						{isDeletingId === asset.id ? (
							<Loader2 size={12} className="animate-spin" />
						) : (
							<Trash2 size={12} />
						)}
					</button>
				</div>
			))}
		</div>
	);
}
