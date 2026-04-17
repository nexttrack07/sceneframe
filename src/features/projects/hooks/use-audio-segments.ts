/**
 * useAudioSegments Hook
 *
 * Manages multi-track audio segments for Workshop: segment listing,
 * auto-segmentation, script editing, shot range adjustment, and generation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks";
import {
	listVoices,
	listProjectSegments,
	autoSegmentProject,
	updateSegmentScript,
	updateSegmentShotRange,
	deleteAudioSegment,
	generateSegmentScript,
	generateSegmentAudio,
	generateAllSegments,
	migrateProjectToSegments,
	type SegmentWithShots,
} from "@/features/audio";
import { projectKeys } from "../query-keys";
import { getRealtimeToken } from "../realtime-actions";
import {
	beginGenerationToast,
	resolveGenerationToast,
} from "../generation-toast";
import type { TriggerRunUiStatus } from "../project-types";

interface SegmentRunStatus {
	runId: string;
	status: TriggerRunUiStatus;
}

interface UseAudioSegmentsArgs {
	projectId: string;
	/** Existing legacy voiceover asset ID for migration */
	legacyVoiceoverAssetId?: string;
}

export function useAudioSegments({
	projectId,
	legacyVoiceoverAssetId,
}: UseAudioSegmentsArgs) {
	const queryClient = useQueryClient();

	// Voice selection state (global for all segments)
	const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);

	// Generation state
	const [generatingSegmentId, setGeneratingSegmentId] = useState<string | null>(
		null,
	);
	const [isGeneratingAll, setIsGeneratingAll] = useState(false);
	const [generationError, setGenerationError] = useState<string | null>(null);
	const [isInitializing, setIsInitializing] = useState(false);

	// Script editing state
	const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
	const [editingScript, setEditingScript] = useState("");

	// Playback state
	const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTimeMs, setCurrentTimeMs] = useState(0);
	const [totalDurationMs, setTotalDurationMs] = useState(0);
	const audioRef = useRef<HTMLAudioElement | null>(null);

	// Fetch available voices
	const {
		data: voices = [],
		isLoading: isLoadingVoices,
		error: voicesError,
	} = useQuery({
		queryKey: ["voices", "elevenlabs"],
		queryFn: () => listVoices({ data: { provider: "elevenlabs" } }),
		staleTime: 1000 * 60 * 5, // Cache for 5 minutes
	});

	// Fetch project segments
	const {
		data: segments = [],
		isLoading: isLoadingSegments,
		refetch: refetchSegments,
	} = useQuery({
		queryKey: projectKeys.audioSegments(projectId),
		queryFn: () => listProjectSegments({ data: { projectId } }),
	});

	// Realtime subscription for trigger.dev runs
	const [realtimeToken, setRealtimeToken] = useState<string | null>(null);
	const processedRunIdsRef = useRef<Set<string>>(new Set());

	// Fetch realtime token on mount
	useEffect(() => {
		let cancelled = false;
		getRealtimeToken({ data: { projectId } })
			.then(({ token }) => {
				if (!cancelled) setRealtimeToken(token);
			})
			.catch((err) => {
				console.error("[useAudioSegments] Failed to get realtime token:", err);
			});
		return () => {
			cancelled = true;
		};
	}, [projectId]);

	// Subscribe to realtime run updates for audio generation
	const { runs: realtimeRuns } = useRealtimeRunsWithTag(
		[`project:${projectId}`],
		{
			accessToken: realtimeToken ?? undefined,
			enabled: !!realtimeToken,
			createdAt: "1h",
		},
	);

	// Derive run statuses from realtime runs, keyed by segment ID
	const runStatusesBySegmentId = useMemo(() => {
		if (!realtimeRuns) return {};
		const statusMap: Record<string, SegmentRunStatus> = {};
		for (const run of realtimeRuns) {
			const segmentTag = run.tags?.find((tag) => tag.startsWith("segment:"));
			if (!segmentTag) continue;
			const segmentId = segmentTag.replace("segment:", "");
			const statusMapping: Record<string, TriggerRunUiStatus> = {
				PENDING: "queued",
				QUEUED: "queued",
				EXECUTING: "running",
				REATTEMPTING: "retrying",
				COMPLETED: "completed",
				FAILED: "failed",
				CANCELED: "failed",
			};
			statusMap[segmentId] = {
				runId: run.id,
				status: statusMapping[run.status] ?? "queued",
			};
		}
		return statusMap;
	}, [realtimeRuns]);

	// Handle realtime run completions - refetch segments and resolve toasts
	useEffect(() => {
		if (!realtimeRuns) return;

		for (const run of realtimeRuns) {
			if (processedRunIdsRef.current.has(run.id)) continue;

			const segmentTag = run.tags?.find((tag) => tag.startsWith("segment:"));
			if (!segmentTag) continue;

			const batchTag = run.tags?.find((tag) => tag.startsWith("batch:"));
			const batchId = batchTag?.replace("batch:", "");

			if (
				run.status === "COMPLETED" ||
				run.status === "FAILED" ||
				run.status === "CANCELED"
			) {
				processedRunIdsRef.current.add(run.id);
				// Refetch segments to get updated status
				void refetchSegments();

				// Resolve toast for this batch
				if (batchId) {
					const isError = run.status === "FAILED" || run.status === "CANCELED";
					resolveGenerationToast(batchId, {
						status: isError ? "Failed" : "Complete",
						message: isError ? "Audio generation failed" : "Voiceover ready",
						error: isError,
					});
				}

				// Clear generating state if this was our segment
				const segmentId = segmentTag.replace("segment:", "");
				if (generatingSegmentId === segmentId) {
					setGeneratingSegmentId(null);
				}
			}
		}
	}, [realtimeRuns, refetchSegments, generatingSegmentId]);

	// Set default voice when voices load
	useEffect(() => {
		if (voices.length > 0 && !selectedVoiceId) {
			const defaultVoice =
				voices.find((v) => v.name === "George") ?? voices[0];
			if (defaultVoice) {
				setSelectedVoiceId(defaultVoice.id);
			}
		}
	}, [voices, selectedVoiceId]);

	// Track if auto-init has been attempted this mount
	const hasAttemptedInit = useRef(false);

	// Auto-create segments on first load if none exist
	useEffect(() => {
		async function initSegments() {
			if (isLoadingSegments) return;
			if (segments.length > 0) return;
			if (isInitializing) return;
			if (hasAttemptedInit.current) return;

			hasAttemptedInit.current = true;
			setIsInitializing(true);
			try {
				if (legacyVoiceoverAssetId) {
					// Migrate legacy voiceover to single segment
					await migrateProjectToSegments({
						data: { projectId, legacyVoiceoverAssetId },
					});
				} else {
					// Auto-segment the project
					const result = await autoSegmentProject({ data: { projectId } });
					if (result.created === 0) {
						setGenerationError(
							"No segments created. Make sure shots are saved to the project.",
						);
					}
				}
				await refetchSegments();
			} catch (err) {
				console.error("Failed to initialize segments:", err);
				const message =
					err instanceof Error ? err.message : "Failed to create segments";
				setGenerationError(message);
			} finally {
				setIsInitializing(false);
			}
		}
		initSegments();
	}, [
		projectId,
		segments.length,
		isLoadingSegments,
		legacyVoiceoverAssetId,
		refetchSegments,
		isInitializing,
	]);

	// Manual segment creation
	const handleCreateSegments = useCallback(async () => {
		setIsInitializing(true);
		setGenerationError(null);
		try {
			const result = await autoSegmentProject({ data: { projectId } });
			if (result.created === 0) {
				setGenerationError(
					"No segments created. Shots may not be saved to the database yet.",
				);
			}
			await refetchSegments();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to create segments";
			setGenerationError(message);
		} finally {
			setIsInitializing(false);
		}
	}, [projectId, refetchSegments]);

	// Start editing a segment's script
	const handleStartEditScript = useCallback(
		(segment: SegmentWithShots) => {
			setEditingSegmentId(segment.id);
			setEditingScript(segment.script ?? "");
		},
		[],
	);

	// Cancel script editing
	const handleCancelEditScript = useCallback(() => {
		setEditingSegmentId(null);
		setEditingScript("");
	}, []);

	// Save script changes
	const handleSaveScript = useCallback(
		async (segmentId: string, script: string) => {
			try {
				await updateSegmentScript({ data: { segmentId, script } });
				await refetchSegments();
				setEditingSegmentId(null);
				setEditingScript("");
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to save script";
				setGenerationError(message);
			}
		},
		[refetchSegments],
	);

	// Auto-generate script for a segment
	const handleAutoGenerateScript = useCallback(
		async (segmentId: string) => {
			setGeneratingSegmentId(segmentId);
			setGenerationError(null);

			try {
				const result = await generateSegmentScript({ data: { segmentId } });
				await refetchSegments();

				// If currently editing this segment, update the editing state
				if (editingSegmentId === segmentId && result.script) {
					setEditingScript(result.script);
				}
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to generate script";
				setGenerationError(message);
			} finally {
				setGeneratingSegmentId(null);
			}
		},
		[refetchSegments, editingSegmentId],
	);

	// Update shot range for a segment
	const handleUpdateShotRange = useCallback(
		async (segmentId: string, startShotId: string, endShotId: string) => {
			try {
				await updateSegmentShotRange({
					data: { segmentId, startShotId, endShotId },
				});
				await refetchSegments();
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to update shot range";
				setGenerationError(message);
			}
		},
		[refetchSegments],
	);

	// Delete a segment
	const handleDeleteSegment = useCallback(
		async (segmentId: string) => {
			try {
				await deleteAudioSegment({ data: { segmentId } });
				await refetchSegments();
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to delete segment";
				setGenerationError(message);
			}
		},
		[refetchSegments],
	);

	// Generate audio for a single segment
	const handleGenerateSegmentAudio = useCallback(
		async (segmentId: string) => {
			if (!selectedVoiceId) {
				setGenerationError("Please select a voice first");
				return;
			}

			const segmentIndex = segments.findIndex((s) => s.id === segmentId);

			setGeneratingSegmentId(segmentId);
			setGenerationError(null);

			try {
				const result = await generateSegmentAudio({
					data: { segmentId, voiceId: selectedVoiceId },
				});

				// Show toast for this segment
				beginGenerationToast({
					id: result.batchId,
					title: "Generating voiceover",
					location: `Segment ${segmentIndex + 1}`,
					medium: "audio",
					status: "Queued",
				});

				await refetchSegments();
			} catch (err) {
				const message =
					err instanceof Error ? err.message : "Failed to generate audio";
				setGenerationError(message);
			} finally {
				setGeneratingSegmentId(null);
			}
		},
		[selectedVoiceId, segments, refetchSegments],
	);

	// Generate audio for all segments
	const handleGenerateAllAudio = useCallback(async () => {
		if (!selectedVoiceId) {
			setGenerationError("Please select a voice first");
			return;
		}

		setIsGeneratingAll(true);
		setGenerationError(null);

		try {
			const result = await generateAllSegments({
				data: { projectId, voiceId: selectedVoiceId },
			});

			// Check for any failures (segments that couldn't be triggered)
			const failures = result.results.filter((r) => !r.triggered && !r.skipped);
			const triggeredCount = result.results.filter((r) => r.triggered).length;

			if (failures.length > 0) {
				setGenerationError(
					`${failures.length} segment(s) failed to start: ${failures.map((f) => f.error).join(", ")}`,
				);
			}

			// Show toast for the batch
			if (triggeredCount > 0) {
				beginGenerationToast({
					id: result.batchId,
					title: `Generating ${triggeredCount} voiceover${triggeredCount > 1 ? "s" : ""}`,
					location: "Audio Panel",
					medium: "audio",
					status: "Queued",
				});
			}

			// Segments are now generating in background via Trigger.dev
			// Realtime subscription will handle status updates
			await refetchSegments();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to generate all audio";
			setGenerationError(message);
		} finally {
			setIsGeneratingAll(false);
		}
	}, [projectId, selectedVoiceId, refetchSegments, queryClient]);

	// Re-run auto-segmentation (clears existing segments)
	const handleReAutoSegment = useCallback(async () => {
		try {
			// Delete existing segments first
			for (const seg of segments) {
				await deleteAudioSegment({ data: { segmentId: seg.id } });
			}
			// Create new segments
			await autoSegmentProject({ data: { projectId } });
			await refetchSegments();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Failed to re-segment";
			setGenerationError(message);
		}
	}, [projectId, segments, refetchSegments]);

	// Playback controls
	const handlePlay = useCallback((segmentId: string, url: string) => {
		// Stop any currently playing audio
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current = null;
		}

		const audio = new Audio(url);
		audioRef.current = audio;

		audio.addEventListener("loadedmetadata", () => {
			setTotalDurationMs(Math.round(audio.duration * 1000));
		});

		audio.addEventListener("timeupdate", () => {
			setCurrentTimeMs(Math.round(audio.currentTime * 1000));
		});

		audio.addEventListener("ended", () => {
			setIsPlaying(false);
			setPlayingSegmentId(null);
			setCurrentTimeMs(0);
		});

		audio.addEventListener("error", () => {
			setIsPlaying(false);
			setPlayingSegmentId(null);
			setCurrentTimeMs(0);
		});

		audio.play();
		setPlayingSegmentId(segmentId);
		setIsPlaying(true);
		setCurrentTimeMs(0);
	}, []);

	const handlePause = useCallback(() => {
		if (audioRef.current) {
			audioRef.current.pause();
		}
		setIsPlaying(false);
	}, []);

	const handleStop = useCallback(() => {
		if (audioRef.current) {
			audioRef.current.pause();
			audioRef.current.currentTime = 0;
			audioRef.current = null;
		}
		setIsPlaying(false);
		setPlayingSegmentId(null);
		setCurrentTimeMs(0);
	}, []);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (audioRef.current) {
				audioRef.current.pause();
				audioRef.current = null;
			}
		};
	}, []);

	return {
		// Voice data
		voices,
		isLoadingVoices,
		voicesError: voicesError instanceof Error ? voicesError.message : null,
		selectedVoiceId,
		setSelectedVoiceId,

		// Segments
		segments: segments as SegmentWithShots[],
		isLoadingSegments,
		refetchSegments,

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
		clearGenerationError: () => setGenerationError(null),
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
		handleStop,
	};
}
