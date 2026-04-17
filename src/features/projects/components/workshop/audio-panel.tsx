/**
 * AudioPanel Component
 *
 * Workshop panel for multi-track voiceover audio with segment management.
 * Auto-segments shots into ~60-90 second chunks for optimal TTS generation.
 */

import {
	AlertTriangle,
	ChevronDown,
	Loader2,
	Mic,
	Play,
	RefreshCw,
	Sparkles,
	Volume2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAudioSegments } from "../../hooks/use-audio-segments";
import { SegmentCard } from "./segment-card";
import { getProjectShots } from "../../shot-actions";

interface AudioPanelProps {
	projectId: string;
	/** Whether the project has shots (to show empty state) */
	hasShotsInDraft?: boolean;
	/** Legacy voiceover asset ID for migration */
	legacyVoiceoverAssetId?: string;
}

export function AudioPanel({
	projectId,
	hasShotsInDraft = false,
	legacyVoiceoverAssetId,
}: AudioPanelProps) {
	const [showVoiceSelector, setShowVoiceSelector] = useState(false);

	// Fetch actual shots from database (needed for segment shot range UI)
	const { data: shots = [], isLoading: isLoadingShots } = useQuery({
		queryKey: ["projects", projectId, "shots"],
		queryFn: () => getProjectShots({ data: { projectId } }),
		enabled: hasShotsInDraft,
	});

	const {
		// Voice data
		voices,
		isLoadingVoices,
		voicesError,
		selectedVoiceId,
		setSelectedVoiceId,
		// Segments
		segments,
		isLoadingSegments,
		// Initialization
		isInitializing,
		handleCreateSegments,
		// Script editing
		editingSegmentId,
		editingScript,
		setEditingScript,
		handleStartEditScript,
		handleCancelEditScript,
		handleSaveScript,
		handleAutoGenerateScript,
		// Shot range
		handleUpdateShotRange,
		// Segment management
		handleDeleteSegment,
		handleReAutoSegment,
		// Generation
		generatingSegmentId,
		isGeneratingAll,
		generationError,
		clearGenerationError,
		handleGenerateSegmentAudio,
		handleGenerateAllAudio,
		// Realtime status
		runStatusesBySegmentId,
		// Playback
		playingSegmentId,
		isPlaying,
		currentTimeMs,
		totalDurationMs,
		handlePlay,
		handlePause,
	} = useAudioSegments({ projectId, legacyVoiceoverAssetId });

	const selectedVoice = useMemo(
		() => voices.find((v) => v.id === selectedVoiceId),
		[voices, selectedVoiceId],
	);

	// Count segments that are ready
	const readyCount = segments.filter((s) => s.status === "done").length;
	const draftCount = segments.filter(
		(s) => s.status === "draft" || s.status === "error",
	).length;

	// Empty state - no shots yet
	if (!hasShotsInDraft) {
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

	return (
		<div className="max-w-2xl space-y-5">
			{/* Header Controls */}
			<div className="rounded-xl border bg-card p-4 space-y-4">
				{/* Voice + Generate All Row */}
				<div className="flex items-center gap-3">
					{/* Voice Selector */}
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
										<Volume2 size={14} className="text-primary" />
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
													setSelectedVoiceId(voice.id);
													setShowVoiceSelector(false);
												}}
												className={`w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50 transition-colors ${
													voice.id === selectedVoiceId ? "bg-primary/5" : ""
												}`}
											>
												<div>
													<span className="text-sm font-medium">
														{voice.name}
													</span>
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
														title="Preview voice"
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

					{/* Generate All Button */}
					<Button
						onClick={handleGenerateAllAudio}
						disabled={
							isGeneratingAll ||
							draftCount === 0 ||
							!selectedVoiceId ||
							segments.length === 0
						}
						variant="accent"
						className="gap-2 shrink-0"
					>
						{isGeneratingAll ? (
							<Loader2 size={14} className="animate-spin" />
						) : (
							<Sparkles size={14} />
						)}
						Generate All ({draftCount})
					</Button>
				</div>

				{/* Segment Summary */}
				<div className="flex items-center justify-between text-sm">
					<span className="text-muted-foreground">
						{segments.length} segment{segments.length !== 1 ? "s" : ""} from{" "}
						{shots.length} shots
					</span>
					<div className="flex items-center gap-3">
						{readyCount > 0 && (
							<span className="text-green-600">
								{readyCount} ready
							</span>
						)}
						<Button
							size="sm"
							variant="ghost"
							onClick={handleReAutoSegment}
							disabled={isGeneratingAll}
							className="gap-1 text-xs h-7"
						>
							<RefreshCw size={12} />
							Re-segment
						</Button>
					</div>
				</div>

				{/* Global Error */}
				{generationError && (
					<div className="flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2">
						<span className="text-sm text-destructive">{generationError}</span>
						<button
							type="button"
							onClick={clearGenerationError}
							className="text-destructive/50 hover:text-destructive text-lg leading-none"
						>
							&times;
						</button>
					</div>
				)}
			</div>

			{/* Segment List */}
			{isLoadingSegments || isLoadingShots || isInitializing ? (
				<div className="flex flex-col items-center justify-center py-12 gap-3">
					<Loader2 size={24} className="animate-spin text-muted-foreground" />
					<p className="text-sm text-muted-foreground">
						{isInitializing ? "Creating segments..." : "Loading..."}
					</p>
				</div>
			) : segments.length === 0 ? (
				<div className="rounded-xl border border-dashed p-8 text-center space-y-4">
					<p className="text-sm text-muted-foreground">
						No segments yet. Segments are created from shots saved to the project.
					</p>
					<Button
						onClick={handleCreateSegments}
						variant="outline"
						className="gap-2"
					>
						<RefreshCw size={14} />
						Create Segments
					</Button>
				</div>
			) : (
				<div className="space-y-4">
					{segments.map((segment, index) => (
						<SegmentCard
							key={segment.id}
							segment={segment}
							segmentIndex={index}
							totalSegments={segments.length}
							allShots={shots}
							isGenerating={
								generatingSegmentId === segment.id ||
								runStatusesBySegmentId[segment.id]?.status === "running" ||
								runStatusesBySegmentId[segment.id]?.status === "queued"
							}
							runStatus={runStatusesBySegmentId[segment.id]?.status}
							isEditing={editingSegmentId === segment.id}
							editingScript={
								editingSegmentId === segment.id ? editingScript : ""
							}
							playingSegmentId={playingSegmentId}
							isPlaying={isPlaying}
							currentTimeMs={currentTimeMs}
							totalDurationMs={totalDurationMs}
							onStartEdit={() => handleStartEditScript(segment)}
							onCancelEdit={handleCancelEditScript}
							onSaveScript={(script) => handleSaveScript(segment.id, script)}
							onSetEditingScript={setEditingScript}
							onAutoGenerateScript={() => handleAutoGenerateScript(segment.id)}
							onGenerateAudio={() => handleGenerateSegmentAudio(segment.id)}
							onUpdateShotRange={(startId, endId) =>
								handleUpdateShotRange(segment.id, startId, endId)
							}
							onDelete={() => handleDeleteSegment(segment.id)}
							onPlay={(url) => handlePlay(segment.id, url)}
							onPause={handlePause}
						/>
					))}
				</div>
			)}
		</div>
	);
}
