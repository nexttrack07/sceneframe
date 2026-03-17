import { useQueryClient } from "@tanstack/react-query";
import {
	Check,
	ChevronDown,
	Loader2,
	Mic,
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
import type { VoiceoverAssetSummary } from "../project-types";
import { projectKeys } from "../query-keys";
import {
	deleteVoiceoverAsset,
	fetchElevenLabsVoices,
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

const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"; // George

export function VoiceoverPanel({
	scene,
	projectId,
	voiceovers,
}: {
	scene: Scene;
	projectId: string;
	voiceovers: VoiceoverAssetSummary[];
}) {
	const queryClient = useQueryClient();
	const { toast } = useToast();

	const [script, setScript] = useState("");
	const [isGeneratingScript, setIsGeneratingScript] = useState(false);
	const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
	const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

	const audioRef = useRef<HTMLAudioElement | null>(null);
	const [playingId, setPlayingId] = useState<string | null>(null);

	// Voice selection state
	const [voices, setVoices] = useState<Voice[]>([]);
	const [isLoadingVoices, setIsLoadingVoices] = useState(false);
	const [selectedVoiceId, setSelectedVoiceId] = useState(DEFAULT_VOICE_ID);
	const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false);
	const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(
		null,
	);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Cleanup audio on unmount
	useEffect(() => {
		return () => {
			audioRef.current?.pause();
			audioRef.current = null;
		};
	}, []);

	// Close dropdown on outside click
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

			// If already previewing this voice, stop it
			if (previewingVoiceId === voice.id) {
				audioRef.current?.pause();
				setPreviewingVoiceId(null);
				return;
			}

			// Stop any current playback
			if (audioRef.current) {
				audioRef.current.pause();
			}
			setPlayingId(null);

			const audio = new Audio(voice.previewUrl);
			audioRef.current = audio;
			setPreviewingVoiceId(voice.id);

			audio.addEventListener("ended", () => setPreviewingVoiceId(null));
			audio.play().catch(() => setPreviewingVoiceId(null));
		},
		[previewingVoiceId],
	);

	const invalidate = useCallback(
		() =>
			queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			}),
		[queryClient, projectId],
	);

	const handleGenerateScript = useCallback(async () => {
		setIsGeneratingScript(true);
		try {
			const result = await generateVoiceoverScript({
				data: { sceneId: scene.id },
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
	}, [scene.id, toast]);

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

	const handleDelete = useCallback(
		async (assetId: string) => {
			setIsDeletingId(assetId);
			try {
				await deleteVoiceoverAsset({ data: { assetId } });
				await invalidate();
			} catch (err) {
				toast(
					err instanceof Error ? err.message : "Failed to delete voiceover",
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
					err instanceof Error ? err.message : "Failed to select voiceover",
					"error",
				);
			}
		},
		[invalidate, toast],
	);

	const handlePlayPause = useCallback(
		(voiceover: VoiceoverAssetSummary) => {
			if (!voiceover.url) return;

			if (playingId === voiceover.id) {
				audioRef.current?.pause();
				setPlayingId(null);
				return;
			}

			if (audioRef.current) {
				audioRef.current.pause();
			}
			setPreviewingVoiceId(null);

			const audio = new Audio(voiceover.url);
			audioRef.current = audio;
			setPlayingId(voiceover.id);

			audio.addEventListener("ended", () => setPlayingId(null));
			audio.play().catch(() => setPlayingId(null));
		},
		[playingId],
	);

	const formatLabels = useCallback((labels: Record<string, string>) => {
		const parts: string[] = [];
		if (labels.accent) parts.push(labels.accent);
		if (labels.age) parts.push(labels.age);
		if (labels.gender) parts.push(labels.gender);
		if (labels.use_case) parts.push(labels.use_case);
		return parts.join(" · ");
	}, []);

	return (
		<div className="space-y-3">
			{/* Voice selector */}
			<div className="space-y-2">
				<p className="text-xs font-medium text-zinc-400">Voice</p>
				<div ref={dropdownRef} className="relative">
					<button
						type="button"
						onClick={handleLoadVoices}
						disabled={isLoadingVoices}
						className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800/50 text-sm text-zinc-200 hover:border-zinc-600 transition-colors"
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
							<ChevronDown size={14} className="shrink-0 text-zinc-400" />
						)}
					</button>

					{isVoiceDropdownOpen && voices.length > 0 && (
						<div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl">
							{voices.map((voice) => (
								<div
									key={voice.id}
									className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
										voice.id === selectedVoiceId
											? "bg-primary/10 text-primary"
											: "hover:bg-zinc-700/50 text-zinc-200"
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
											<p className="text-[10px] text-zinc-500 truncate">
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
											className="shrink-0 w-6 h-6 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center transition-colors"
										>
											{previewingVoiceId === voice.id ? (
												<Square size={8} className="fill-current text-white" />
											) : (
												<Volume2 size={10} className="text-zinc-300" />
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
					<p className="text-xs font-medium text-zinc-400">Narration Script</p>
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
					className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
				/>
				{script && (
					<p className="text-[10px] text-zinc-500">
						~{script.split(/\s+/).filter(Boolean).length} words / ~
						{Math.round(script.split(/\s+/).filter(Boolean).length / 2.5)}s
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
			{voiceovers.length > 0 && (
				<div className="space-y-2">
					<p className="text-xs font-medium text-zinc-400">
						Generated Voiceovers
					</p>
					{voiceovers.map((vo) => (
						<div
							key={vo.id}
							className={`flex items-center gap-2 p-2 rounded-lg border transition-colors ${
								vo.status === "error"
									? "border-red-800/50 bg-red-900/10"
									: vo.isSelected
										? "border-primary/30 bg-primary/5"
										: "border-zinc-700 bg-zinc-800/30"
							}`}
						>
							{vo.status === "done" && vo.url ? (
								<button
									type="button"
									onClick={() => handlePlayPause(vo)}
									className="shrink-0 w-7 h-7 rounded-full bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center transition-colors"
								>
									{playingId === vo.id ? (
										<Square size={10} className="fill-current text-white" />
									) : (
										<Play
											size={10}
											className="fill-current text-white ml-0.5"
										/>
									)}
								</button>
							) : vo.status === "generating" ? (
								<div className="shrink-0 w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center">
									<Loader2 size={10} className="animate-spin text-zinc-400" />
								</div>
							) : null}

							<div className="flex-1 min-w-0">
								{vo.status === "error" ? (
									<p className="text-xs text-red-400 truncate">
										{vo.errorMessage ?? "Generation failed"}
									</p>
								) : vo.status === "generating" ? (
									<p className="text-xs text-zinc-400">Generating...</p>
								) : (
									<p className="text-xs text-zinc-300 truncate">
										{vo.durationMs
											? `${(vo.durationMs / 1000).toFixed(1)}s`
											: "Audio ready"}
									</p>
								)}
								{vo.prompt && (
									<p className="text-[10px] text-zinc-500 truncate mt-0.5">
										{vo.prompt.slice(0, 80)}...
									</p>
								)}
							</div>

							{vo.status === "done" && !vo.isSelected && (
								<button
									type="button"
									onClick={() => handleSelect(vo.id)}
									className="shrink-0 p-1 text-zinc-500 hover:text-primary transition-colors"
									title="Use this voiceover"
								>
									<Check size={12} />
								</button>
							)}
							{vo.isSelected && (
								<span className="shrink-0 p-1 text-primary" title="Selected">
									<Check size={12} />
								</span>
							)}
							<button
								type="button"
								onClick={() => handleDelete(vo.id)}
								disabled={isDeletingId === vo.id}
								className="shrink-0 p-1 text-zinc-500 hover:text-red-400 transition-colors"
							>
								{isDeletingId === vo.id ? (
									<Loader2 size={12} className="animate-spin" />
								) : (
									<Trash2 size={12} />
								)}
							</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
