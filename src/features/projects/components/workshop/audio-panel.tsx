/**
 * AudioPanel Component
 *
 * Workshop panel for generating and previewing voiceover audio.
 * Allows users to:
 * - Select a voice from available TTS voices
 * - Enter/edit script text for voiceover
 * - Generate voiceover audio
 * - Play/pause generated audio inline
 */

import {
	AlertTriangle,
	ChevronDown,
	Loader2,
	Mic,
	Pause,
	Play,
	Sparkles,
	Volume2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { VoiceInfo } from "@/features/audio";
import type { ShotDraftEntry } from "../../project-types";

interface VoiceoverAsset {
	id: string;
	url: string | null;
	prompt: string | null;
	model: string | null;
	status: string;
	isSelected: boolean;
	durationMs: number | null;
	createdAt: string;
}

interface VoiceUsage {
	charactersUsed: number;
	charactersLimit: number;
	resetDate: string | null;
}

interface AudioPanelProps {
	shots: ShotDraftEntry[] | null;
	voices: VoiceInfo[];
	isLoadingVoices: boolean;
	voicesError: string | null;
	selectedVoiceId: string | null;
	onSelectVoice: (voiceId: string) => void;
	voiceovers: VoiceoverAsset[];
	isLoadingVoiceovers: boolean;
	usage: VoiceUsage | null;
	isGenerating: boolean;
	generationError: string | null;
	onClearError: () => void;
	onGenerateVoiceover: (text: string) => Promise<unknown>;
	playingAssetId: string | null;
	isPlaying: boolean;
	onPlay: (assetId: string, url: string) => void;
	onPause: () => void;
	onStop: () => void;
}

export function AudioPanel({
	shots,
	voices,
	isLoadingVoices,
	voicesError,
	selectedVoiceId,
	onSelectVoice,
	voiceovers,
	isLoadingVoiceovers,
	usage,
	isGenerating,
	generationError,
	onClearError,
	onGenerateVoiceover,
	playingAssetId,
	isPlaying,
	onPlay,
	onPause,
}: AudioPanelProps) {
	const [scriptText, setScriptText] = useState("");
	const [showVoiceSelector, setShowVoiceSelector] = useState(false);

	// Generate default script from shots
	const defaultScript = useMemo(() => {
		if (!shots || shots.length === 0) return "";
		return shots.map((shot) => shot.description).join("\n\n");
	}, [shots]);

	// Use default script if user hasn't edited
	const effectiveScript = scriptText || defaultScript;

	const selectedVoice = useMemo(
		() => voices.find((v) => v.id === selectedVoiceId),
		[voices, selectedVoiceId],
	);

	const handleGenerate = useCallback(async () => {
		if (!effectiveScript.trim()) return;
		await onGenerateVoiceover(effectiveScript);
	}, [effectiveScript, onGenerateVoiceover]);

	const formatDuration = (ms: number | null) => {
		if (!ms) return "--:--";
		const seconds = Math.floor(ms / 1000);
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const formatDate = (dateStr: string) => {
		const date = new Date(dateStr);
		return date.toLocaleDateString(undefined, {
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	};

	if (!shots || shots.length === 0) {
		return (
			<div className="h-full rounded-2xl border border-dashed border-border/70 bg-background/70 flex items-center justify-center">
				<div className="text-center max-w-md px-6">
					<Mic size={24} className="mx-auto mb-3 text-muted-foreground" />
					<p className="text-sm font-medium text-foreground mb-2">
						Generate shots first
					</p>
					<p className="text-sm text-muted-foreground leading-relaxed">
						Create your shot breakdown before generating voiceover audio.
						The script will be generated from your shot descriptions.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="max-w-4xl space-y-6">
			{/* Header */}
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Volume2 size={15} />
				<span>Voiceover Audio</span>
			</div>

			{/* Voice Selection */}
			<div className="rounded-xl border bg-background p-4 space-y-3">
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium">Voice</span>
					{usage && (
						<span className="text-xs text-muted-foreground">
							{usage.charactersUsed.toLocaleString()} / {usage.charactersLimit.toLocaleString()} characters
						</span>
					)}
				</div>

				{isLoadingVoices ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 size={14} className="animate-spin" />
						<span>Loading voices...</span>
					</div>
				) : voicesError ? (
					<div className="flex items-center gap-2 text-sm text-destructive">
						<AlertTriangle size={14} />
						<span>{voicesError}</span>
					</div>
				) : (
					<div className="relative">
						<button
							type="button"
							onClick={() => setShowVoiceSelector(!showVoiceSelector)}
							className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
						>
							<div className="flex items-center gap-2">
								<Mic size={14} className="text-primary" />
								<span className="text-sm font-medium">
									{selectedVoice?.name ?? "Select a voice"}
								</span>
								{selectedVoice?.labels?.gender && (
									<span className="text-xs text-muted-foreground">
										{selectedVoice.labels.gender}
									</span>
								)}
							</div>
							<ChevronDown
								size={14}
								className={`text-muted-foreground transition-transform ${showVoiceSelector ? "rotate-180" : ""}`}
							/>
						</button>

						{showVoiceSelector && (
							<div className="absolute z-10 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border bg-background shadow-lg">
								{voices.map((voice) => (
									<button
										key={voice.id}
										type="button"
										onClick={() => {
											onSelectVoice(voice.id);
											setShowVoiceSelector(false);
										}}
										className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50 transition-colors ${
											voice.id === selectedVoiceId ? "bg-primary/5" : ""
										}`}
									>
										<div>
											<span className="text-sm font-medium">{voice.name}</span>
											{voice.labels && (
												<span className="ml-2 text-xs text-muted-foreground">
													{[voice.labels.gender, voice.labels.accent, voice.labels.age]
														.filter(Boolean)
														.join(" · ")}
												</span>
											)}
										</div>
										{voice.previewUrl && (
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													const audio = new Audio(voice.previewUrl);
													audio.play();
												}}
												className="p-1 rounded hover:bg-muted"
												title="Preview voice"
											>
												<Play size={12} />
											</button>
										)}
									</button>
								))}
							</div>
						)}
					</div>
				)}
			</div>

			{/* Script Input */}
			<div className="rounded-xl border bg-background p-4 space-y-3">
				<div className="flex items-center justify-between">
					<span className="text-sm font-medium">Voiceover Script</span>
					<span className="text-xs text-muted-foreground">
						{effectiveScript.length} characters
					</span>
				</div>

				<Textarea
					value={scriptText}
					onChange={(e) => setScriptText(e.target.value)}
					placeholder={defaultScript || "Enter your voiceover script..."}
					rows={6}
					className="resize-none"
				/>

				{scriptText === "" && defaultScript && (
					<p className="text-xs text-muted-foreground">
						Using script generated from shot descriptions. Edit above to customize.
					</p>
				)}

				{generationError && (
					<div className="flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2">
						<span className="text-sm text-destructive">{generationError}</span>
						<button
							type="button"
							onClick={onClearError}
							className="text-destructive/50 hover:text-destructive"
						>
							✕
						</button>
					</div>
				)}

				<Button
					onClick={handleGenerate}
					disabled={isGenerating || !effectiveScript.trim() || !selectedVoiceId}
					variant="accent"
					className="w-full gap-2"
				>
					{isGenerating ? (
						<>
							<Loader2 size={14} className="animate-spin" />
							Generating...
						</>
					) : (
						<>
							<Sparkles size={14} />
							Generate Voiceover
						</>
					)}
				</Button>
			</div>

			{/* Generated Voiceovers */}
			{voiceovers.length > 0 && (
				<div className="space-y-3">
					<span className="text-sm font-medium text-muted-foreground">
						Generated Audio ({voiceovers.length})
					</span>

					<div className="space-y-2">
						{voiceovers.map((vo) => {
							const isCurrentlyPlaying = playingAssetId === vo.id && isPlaying;

							return (
								<div
									key={vo.id}
									className={`rounded-xl border p-4 transition-all ${
										vo.isSelected
											? "border-primary/40 bg-primary/5"
											: "border-border bg-background"
									}`}
								>
									<div className="flex items-center justify-between gap-4">
										<div className="flex items-center gap-3 flex-1 min-w-0">
											{vo.status === "done" && vo.url ? (
												<button
													type="button"
													onClick={() =>
														isCurrentlyPlaying
															? onPause()
															: onPlay(vo.id, vo.url!)
													}
													className="shrink-0 w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center transition-colors"
												>
													{isCurrentlyPlaying ? (
														<Pause size={18} className="text-primary" />
													) : (
														<Play size={18} className="text-primary ml-0.5" />
													)}
												</button>
											) : vo.status === "generating" ? (
												<div className="shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center">
													<Loader2 size={18} className="animate-spin text-muted-foreground" />
												</div>
											) : (
												<div className="shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
													<AlertTriangle size={18} className="text-destructive" />
												</div>
											)}

											<div className="flex-1 min-w-0">
												<p className="text-sm font-medium truncate">
													{formatDuration(vo.durationMs)}
													{vo.isSelected && (
														<span className="ml-2 text-xs text-primary">Selected</span>
													)}
												</p>
												<p className="text-xs text-muted-foreground truncate">
													{formatDate(vo.createdAt)}
													{vo.model && ` · ${vo.model}`}
												</p>
											</div>
										</div>
									</div>

									{vo.prompt && (
										<p className="mt-2 text-xs text-muted-foreground line-clamp-2">
											{vo.prompt}
										</p>
									)}
								</div>
							);
						})}
					</div>
				</div>
			)}

			{isLoadingVoiceovers && voiceovers.length === 0 && (
				<div className="flex items-center justify-center py-8">
					<Loader2 size={20} className="animate-spin text-muted-foreground" />
				</div>
			)}
		</div>
	);
}
