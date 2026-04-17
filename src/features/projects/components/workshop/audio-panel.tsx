/**
 * AudioPanel Component
 *
 * Workshop panel for generating and previewing voiceover audio.
 * Redesigned for better UX: generated audio prominent, script collapsed.
 */

import {
	AlertTriangle,
	ChevronDown,
	ChevronUp,
	Edit3,
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
import { GeneratingIndicator } from "@/components/ui/generating-indicator";
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
	const [showScriptEditor, setShowScriptEditor] = useState(false);

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

	// Empty state
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
					</p>
				</div>
			</div>
		);
	}

	const hasVoiceovers = voiceovers.length > 0;
	const latestVoiceover = voiceovers[0];

	return (
		<div className="max-w-2xl space-y-5">
			{/* Main Player Card - Show when we have voiceovers */}
			{hasVoiceovers && latestVoiceover.status === "done" && latestVoiceover.url && (
				<div className="rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-6">
					<div className="flex items-center gap-4">
						{/* Large Play Button */}
						<button
							type="button"
							onClick={() =>
								playingAssetId === latestVoiceover.id && isPlaying
									? onPause()
									: onPlay(latestVoiceover.id, latestVoiceover.url!)
							}
							className="shrink-0 w-16 h-16 rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center transition-all shadow-lg shadow-primary/25 hover:scale-105"
						>
							{playingAssetId === latestVoiceover.id && isPlaying ? (
								<Pause size={28} className="text-primary-foreground" />
							) : (
								<Play size={28} className="text-primary-foreground ml-1" />
							)}
						</button>

						<div className="flex-1 min-w-0">
							<p className="font-display text-lg font-semibold text-foreground">
								{formatDuration(latestVoiceover.durationMs)}
							</p>
							<p className="text-sm text-muted-foreground">
								Generated {formatDate(latestVoiceover.createdAt)}
							</p>
						</div>

						{/* Voice indicator */}
						{selectedVoice && (
							<div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 text-sm">
								<Volume2 size={14} className="text-muted-foreground" />
								<span className="text-muted-foreground">{selectedVoice.name}</span>
							</div>
						)}
					</div>

					{/* Generated Script Text */}
					{latestVoiceover.prompt && (
						<div className="mt-4 pt-4 border-t border-primary/10">
							<p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
								{latestVoiceover.prompt}
							</p>
						</div>
					)}
				</div>
			)}

			{/* Generation in progress */}
			{isGenerating && (
				<GeneratingIndicator
					status="Creating your voiceover..."
					showPhases
					variant="card"
				/>
			)}

			{/* Compact Generation Controls */}
			<div className="rounded-xl border bg-card p-4 space-y-4">
				{/* Voice + Generate Row */}
				<div className="flex items-center gap-3">
					{/* Voice Selector - Compact */}
					<div className="relative flex-1">
						{isLoadingVoices ? (
							<div className="flex items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground">
								<Loader2 size={14} className="animate-spin" />
								<span>Loading voices...</span>
							</div>
						) : voicesError ? (
							<div className="flex items-center gap-2 px-3 py-2.5 text-sm text-destructive">
								<AlertTriangle size={14} />
								<span>{voicesError}</span>
							</div>
						) : (
							<>
								<button
									type="button"
									onClick={() => setShowVoiceSelector(!showVoiceSelector)}
									className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
								>
									<div className="flex items-center gap-2">
										<Mic size={14} className="text-primary" />
										<span className="text-sm font-medium">
											{selectedVoice?.name ?? "Select voice"}
										</span>
									</div>
									<ChevronDown
										size={14}
										className={`text-muted-foreground transition-transform ${showVoiceSelector ? "rotate-180" : ""}`}
									/>
								</button>

								{showVoiceSelector && (
									<div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border bg-background shadow-xl">
										{voices.map((voice) => (
											<button
												key={voice.id}
												type="button"
												onClick={() => {
													onSelectVoice(voice.id);
													setShowVoiceSelector(false);
												}}
												className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50 transition-colors ${
													voice.id === selectedVoiceId ? "bg-primary/5" : ""
												}`}
											>
												<div>
													<span className="text-sm font-medium">{voice.name}</span>
													{voice.labels && (
														<span className="ml-2 text-xs text-muted-foreground">
															{[voice.labels.gender, voice.labels.accent]
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
															new Audio(voice.previewUrl).play();
														}}
														className="p-1.5 rounded hover:bg-muted"
														title="Preview"
													>
														<Play size={12} />
													</button>
												)}
											</button>
										))}
									</div>
								)}
							</>
						)}
					</div>

					{/* Generate Button */}
					<Button
						onClick={handleGenerate}
						disabled={isGenerating || !effectiveScript.trim() || !selectedVoiceId}
						variant="accent"
						className="gap-2 shrink-0"
					>
						<Sparkles size={14} />
						{hasVoiceovers ? "Regenerate" : "Generate"}
					</Button>
				</div>

				{/* Script Summary - Collapsed by default */}
				<div className="border-t pt-3">
					<button
						type="button"
						onClick={() => setShowScriptEditor(!showScriptEditor)}
						className="w-full flex items-center justify-between text-left group"
					>
						<div className="flex items-center gap-2">
							<Edit3 size={14} className="text-muted-foreground" />
							<span className="text-sm text-muted-foreground">
								Script from {shots?.length ?? 0} shots
								<span className="mx-1.5">·</span>
								<span className={effectiveScript.length > 5000 ? "text-warning" : ""}>
									{effectiveScript.length.toLocaleString()} chars
								</span>
								{effectiveScript.length > 5000 && (
									<span className="ml-1 text-xs">(will be summarized)</span>
								)}
							</span>
						</div>
						{showScriptEditor ? (
							<ChevronUp size={14} className="text-muted-foreground" />
						) : (
							<ChevronDown size={14} className="text-muted-foreground" />
						)}
					</button>

					{showScriptEditor && (
						<div className="mt-3 space-y-2">
							<Textarea
								value={scriptText}
								onChange={(e) => setScriptText(e.target.value)}
								placeholder={defaultScript || "Enter your voiceover script..."}
								rows={8}
								className="resize-none text-sm"
							/>
							{scriptText === "" && defaultScript && (
								<p className="text-xs text-muted-foreground">
									Using auto-generated script. Edit to customize.
								</p>
							)}
						</div>
					)}
				</div>

				{/* Error */}
				{generationError && (
					<div className="flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2">
						<span className="text-sm text-destructive">{generationError}</span>
						<button
							type="button"
							onClick={onClearError}
							className="text-destructive/50 hover:text-destructive text-lg leading-none"
						>
							×
						</button>
					</div>
				)}

				{/* Usage */}
				{usage && (
					<p className="text-xs text-muted-foreground text-right">
						{usage.charactersUsed.toLocaleString()} / {usage.charactersLimit.toLocaleString()} characters used
					</p>
				)}
			</div>

			{/* Previous Voiceovers - Compact list */}
			{voiceovers.length > 1 && (
				<div className="space-y-2">
					<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
						Previous Generations
					</p>
					<div className="space-y-1.5">
						{voiceovers.slice(1).map((vo) => {
							const isCurrentlyPlaying = playingAssetId === vo.id && isPlaying;

							return (
								<div
									key={vo.id}
									className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-background hover:bg-muted/30 transition-colors"
								>
									{vo.status === "done" && vo.url ? (
										<button
											type="button"
											onClick={() =>
												isCurrentlyPlaying ? onPause() : onPlay(vo.id, vo.url!)
											}
											className="shrink-0 w-8 h-8 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
										>
											{isCurrentlyPlaying ? (
												<Pause size={14} className="text-foreground" />
											) : (
												<Play size={14} className="text-foreground ml-0.5" />
											)}
										</button>
									) : vo.status === "generating" ? (
										<div className="shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
											<Loader2 size={14} className="animate-spin text-muted-foreground" />
										</div>
									) : (
										<div className="shrink-0 w-8 h-8 rounded-full bg-destructive/10 flex items-center justify-center">
											<AlertTriangle size={14} className="text-destructive" />
										</div>
									)}

									<div className="flex-1 min-w-0 flex items-center gap-3">
										<span className="text-sm font-medium">
											{formatDuration(vo.durationMs)}
										</span>
										<span className="text-xs text-muted-foreground">
											{formatDate(vo.createdAt)}
										</span>
									</div>
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
