import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shot } from "@/db/schema";
import {
	buildShotLabelMap,
	formatTransitionLocation,
} from "../generation-labels";
import {
	beginGenerationToast,
	resolveGenerationToast,
	updateGenerationToast,
} from "../generation-toast";
import {
	applyProjectAspectRatioToVideoDefaults,
	getPreferredAspectRatioFromVideoDefaults,
	persistProjectAspectRatio,
} from "../project-aspect-ratio";
import { normalizeVideoDefaults } from "../project-normalize";
import type {
	PromptAssetType,
	PromptAssetTypeSelection,
	TransitionVideoSummary,
	TriggerRunSummary,
	TriggerRunUiStatus,
	VideoDefaults,
} from "../project-types";
import { projectKeys } from "../query-keys";
import { getRealtimeToken } from "../realtime-actions";
import {
	deleteTransitionVideo,
	enhanceTransitionVideoPrompt,
	generateTransitionVideo,
	generateTransitionVideoPrompt,
	selectTransitionVideo,
} from "../transition-actions";
import { getVideoModelDefinition } from "../video-models";
import { isPendingVideoStatus } from "../video-status";

type ToastFn = (message: string, variant: "success" | "error") => void;

function getTransitionDraftStorageKey(pair: {
	fromShotId: string;
	toShotId: string;
}) {
	return `transition-video-draft:${pair.fromShotId}:${pair.toShotId}`;
}

function readTransitionDraft(pair: { fromShotId: string; toShotId: string }) {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(getTransitionDraftStorageKey(pair));
	} catch {
		return null;
	}
}

function getTransitionSettingsStorageKey() {
	return `video-studio:last-settings`;
}

function readTransitionSettings(): VideoDefaults | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(getTransitionSettingsStorageKey());
		if (!raw) return null;
		return normalizeVideoDefaults(JSON.parse(raw));
	} catch {
		return null;
	}
}

function writeTransitionSettings(settings: VideoDefaults) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(
			getTransitionSettingsStorageKey(),
			JSON.stringify(settings),
		);
	} catch {
		// Ignore storage failures; draft settings are a UX enhancement.
	}
}

function writeTransitionDraft(
	pair: { fromShotId: string; toShotId: string },
	prompt: string,
) {
	if (typeof window === "undefined") return;
	try {
		const key = getTransitionDraftStorageKey(pair);
		if (prompt.trim().length === 0) {
			window.localStorage.removeItem(key);
			return;
		}
		window.localStorage.setItem(key, prompt);
	} catch {
		// Ignore storage failures; drafts are a UX enhancement, not critical state.
	}
}

export function useVideoStudio({
	projectId,
	selectedTransitionPair,
	storyShots,
	allTransitionVideos,
	toast,
	setError,
}: {
	projectId: string;
	selectedTransitionPair: { fromShotId: string; toShotId: string } | null;
	storyShots: Shot[];
	allTransitionVideos: TransitionVideoSummary[];
	toast: ToastFn;
	setError: (msg: string | null) => void;
}) {
	const queryClient = useQueryClient();
	const logPrefix = "[TransitionVideo]";
	const [videoPrompt, setVideoPrompt] = useState("");
	const [videoSettings, setVideoSettingsState] = useState<VideoDefaults>(
		normalizeVideoDefaults(null),
	);
	const [isQueueingVideo, setIsQueueingVideo] = useState(false);
	const [isGeneratingVideoPrompt, setIsGeneratingVideoPrompt] = useState(false);
	const [isEnhancingVideoPrompt, setIsEnhancingVideoPrompt] = useState(false);
	const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
	const [useProjectContext, setUseProjectContext] = useState(true);
	const [usePrevShotContext, setUsePrevShotContext] = useState(true);
	const [detectedPromptAssetType, setDetectedPromptAssetType] =
		useState<PromptAssetType | null>(null);
	const [promptTypeSelection, setPromptTypeSelection] =
		useState<PromptAssetTypeSelection>("auto");
	const [realtimeToken, setRealtimeToken] = useState<string | null>(null);
	const allTransitionVideosRef = useRef(allTransitionVideos);
	const trackedToastMetaRef = useRef(
		new Map<string, { title: string; location: string }>(),
	);
	const autoPromptPairKeysRef = useRef<Set<string>>(new Set());
	const processedRunIdsRef = useRef<Set<string>>(new Set());
	allTransitionVideosRef.current = allTransitionVideos;
	const shotLabelMap = buildShotLabelMap(storyShots);

	// Fetch realtime token on mount
	useEffect(() => {
		let cancelled = false;
		getRealtimeToken({ data: { projectId } })
			.then(({ token }) => {
				if (!cancelled) setRealtimeToken(token);
			})
			.catch((err) => {
				console.error(`${logPrefix} Failed to get realtime token:`, err);
			});
		return () => {
			cancelled = true;
		};
	}, [projectId]);

	// Subscribe to realtime run updates for this project
	const { runs: realtimeRuns } = useRealtimeRunsWithTag(
		[`project:${projectId}`],
		{
			accessToken: realtimeToken ?? undefined,
			enabled: !!realtimeToken,
			createdAt: "1h", // Only show runs from the last hour
		},
	);

	// Derive run statuses from realtime runs, keyed by video ID
	const runStatusesByVideoId = useMemo(() => {
		if (!realtimeRuns) return {};
		const statusMap: Record<string, TriggerRunSummary> = {};
		for (const run of realtimeRuns) {
			// Extract video ID from tags (format: "video:{id}")
			const videoTag = run.tags?.find((tag) => tag.startsWith("video:"));
			if (!videoTag) continue;
			const videoId = videoTag.replace("video:", "");
			// Map realtime run status to TriggerRunUiStatus
			const statusMapping: Record<string, TriggerRunUiStatus> = {
				PENDING: "queued",
				QUEUED: "queued",
				EXECUTING: "running",
				REATTEMPTING: "retrying",
				COMPLETED: "completed",
				FAILED: "failed",
				CANCELED: "canceled",
				SYSTEM_FAILURE: "failed",
				EXPIRED: "failed",
				CRASHED: "failed",
				INTERRUPTED: "canceled",
				TIMED_OUT: "failed",
			};
			const uiStatus = statusMapping[run.status] ?? "unknown";
			statusMap[videoId] = {
				assetId: videoId,
				jobId: run.id,
				status: uiStatus,
				attemptCount: 1,
				createdAt: run.createdAt?.toISOString() ?? null,
				startedAt: run.startedAt?.toISOString() ?? null,
				finishedAt: run.finishedAt?.toISOString() ?? null,
				errorMessage: typeof run.error === "object" && run.error !== null && "message" in run.error
					? String(run.error.message)
					: null,
			};
		}
		return statusMap;
	}, [realtimeRuns]);

	// Derive isGeneratingVideo from allTransitionVideos for selected pair
	const isGeneratingVideo = useMemo(() => {
		if (!selectedTransitionPair) return false;
		return allTransitionVideos.some(
			(video) =>
				video.fromShotId === selectedTransitionPair.fromShotId &&
				video.toShotId === selectedTransitionPair.toShotId &&
				isPendingVideoStatus(video.status),
		);
	}, [allTransitionVideos, selectedTransitionPair]);
	const setVideoSettings = useCallback(
		(next: VideoDefaults) => {
			const explicitAspectRatio =
				getPreferredAspectRatioFromVideoDefaults(next);
			if (explicitAspectRatio) {
				persistProjectAspectRatio(projectId, explicitAspectRatio);
			}
			setVideoSettingsState(
				applyProjectAspectRatioToVideoDefaults(projectId, next),
			);
		},
		[projectId],
	);

	// Reset state when transition pair changes
	useEffect(() => {
		if (!selectedTransitionPair) return;

		const pairVideos = allTransitionVideosRef.current.filter(
			(tv) =>
				tv.fromShotId === selectedTransitionPair.fromShotId &&
				tv.toShotId === selectedTransitionPair.toShotId,
		);
		const latestPromptVideo =
			[...pairVideos].reverse().find((tv) => tv.prompt && !tv.stale) ??
			[...pairVideos].reverse().find((tv) => tv.prompt);
		const selectedVideo = pairVideos.find((tv) => tv.isSelected);
		const draftPrompt = readTransitionDraft(selectedTransitionPair);
		const initialPrompt =
			latestPromptVideo?.prompt ?? draftPrompt ?? selectedVideo?.prompt ?? "";
		const draftSettings = readTransitionSettings();
		const initialSettings =
			draftSettings ??
			normalizeVideoDefaults({
				model: selectedVideo?.model ?? latestPromptVideo?.model,
				modelOptions:
					selectedVideo?.modelSettings ??
					latestPromptVideo?.modelSettings ??
					null,
			});

		setVideoPrompt(initialPrompt);
		setVideoSettingsState(
			applyProjectAspectRatioToVideoDefaults(projectId, initialSettings),
		);
		setIsQueueingVideo(false);
		setIsGeneratingVideoPrompt(false);
		setIsEnhancingVideoPrompt(false);
		setDeletingVideoId(null);
		setUseProjectContext(true);
		setUsePrevShotContext(true);
		setDetectedPromptAssetType(null);
		setPromptTypeSelection("auto");
		processedRunIdsRef.current.clear();
	}, [selectedTransitionPair, projectId]);

	useEffect(() => {
		const pair = selectedTransitionPair;
		if (
			!pair ||
			videoPrompt.trim() ||
			isGeneratingVideoPrompt ||
			isEnhancingVideoPrompt
		) {
			return;
		}

		const pairKey = `${pair.fromShotId}:${pair.toShotId}`;
		if (autoPromptPairKeysRef.current.has(pairKey)) {
			return;
		}
		autoPromptPairKeysRef.current.add(pairKey);

		let cancelled = false;
		setIsGeneratingVideoPrompt(true);
		setError(null);

		void generateTransitionVideoPrompt({
			data: {
				fromShotId: pair.fromShotId,
				toShotId: pair.toShotId,
				useProjectContext,
				usePrevShotContext,
				assetTypeOverride: promptTypeSelection,
			},
		})
			.then((result) => {
				if (cancelled) return;
				setVideoPrompt((currentPrompt) =>
					currentPrompt.trim() ? currentPrompt : result.prompt,
				);
				setDetectedPromptAssetType(result.assetType);
			})
			.catch((err) => {
				autoPromptPairKeysRef.current.delete(pairKey);
				if (cancelled) return;
				setError(
					err instanceof Error ? err.message : "Failed to generate prompt",
				);
			})
			.finally(() => {
				if (!cancelled) {
					setIsGeneratingVideoPrompt(false);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [
		isEnhancingVideoPrompt,
		isGeneratingVideoPrompt,
		promptTypeSelection,
		selectedTransitionPair,
		setError,
		usePrevShotContext,
		useProjectContext,
		videoPrompt,
	]);

	useEffect(() => {
		if (!selectedTransitionPair) return;
		writeTransitionDraft(selectedTransitionPair, videoPrompt);
	}, [selectedTransitionPair, videoPrompt]);

	useEffect(() => {
		if (!selectedTransitionPair) return;
		writeTransitionSettings(videoSettings);
	}, [selectedTransitionPair, videoSettings]);

	// Reset isQueueingVideo when no longer generating
	useEffect(() => {
		if (!selectedTransitionPair) {
			setIsQueueingVideo(false);
			return;
		}
		if (!isGeneratingVideo) {
			setIsQueueingVideo(false);
		}
	}, [isGeneratingVideo, selectedTransitionPair]);

	// Handle realtime run completions - refetch data and auto-select
	useEffect(() => {
		if (!realtimeRuns || !selectedTransitionPair) return;

		const pairVideoIds = new Set(
			allTransitionVideos
				.filter(
					(tv) =>
						tv.fromShotId === selectedTransitionPair.fromShotId &&
						tv.toShotId === selectedTransitionPair.toShotId,
				)
				.map((tv) => tv.id),
		);

		for (const run of realtimeRuns) {
			// Skip if already processed
			if (processedRunIdsRef.current.has(run.id)) continue;

			// Extract video ID from tags
			const videoTag = run.tags?.find((tag) => tag.startsWith("video:"));
			if (!videoTag) continue;
			const videoId = videoTag.replace("video:", "");

			// Only process runs for videos in the current pair
			if (!pairVideoIds.has(videoId)) continue;

			// Process completed or failed runs
			if (run.status === "COMPLETED" || run.status === "FAILED" || run.status === "CANCELED") {
				processedRunIdsRef.current.add(run.id);
				console.info(`${logPrefix} realtime:run-finished`, {
					runId: run.id,
					videoId,
					status: run.status,
				});

				// Refetch project data to get updated video status
				void queryClient.refetchQueries({
					queryKey: projectKeys.project(projectId),
					type: "active",
				});
			}
		}
	}, [realtimeRuns, selectedTransitionPair, allTransitionVideos, projectId, queryClient]);

	useEffect(() => {
		for (const [videoId, meta] of trackedToastMetaRef.current.entries()) {
			const video = allTransitionVideos.find((entry) => entry.id === videoId);
			if (!video) continue;

			if (isPendingVideoStatus(video.status)) {
				updateGenerationToast(videoId, {
					status:
						video.status === "queued"
							? "Queued"
							: video.status === "finalizing"
								? "Finalizing"
								: "Generating",
					message: meta.location,
				});
				continue;
			}

			if (video.status === "done") {
				resolveGenerationToast(videoId, {
					status: "Ready",
					message: meta.location,
				});
				trackedToastMetaRef.current.delete(videoId);
				continue;
			}

			if (video.status === "error") {
				resolveGenerationToast(videoId, {
					status: "Failed",
					message: video.errorMessage ?? meta.location,
					error: true,
				});
				trackedToastMetaRef.current.delete(videoId);
			}
		}
	}, [allTransitionVideos]);


	async function handleGenerateVideoPrompt() {
		if (!selectedTransitionPair) return;
		setIsGeneratingVideoPrompt(true);
		setError(null);
		try {
			const result = await generateTransitionVideoPrompt({
				data: {
					fromShotId: selectedTransitionPair.fromShotId,
					toShotId: selectedTransitionPair.toShotId,
					useProjectContext,
					usePrevShotContext,
					assetTypeOverride: promptTypeSelection,
				},
			});
			setVideoPrompt(result.prompt);
			setDetectedPromptAssetType(result.assetType);
			toast("Prompt generated", "success");
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to generate prompt";
			setError(msg);
			toast(msg, "error");
		} finally {
			setIsGeneratingVideoPrompt(false);
		}
	}

	async function handleEnhanceVideoPrompt() {
		if (!selectedTransitionPair || !videoPrompt.trim()) return;
		setIsEnhancingVideoPrompt(true);
		setError(null);
		try {
			const result = await enhanceTransitionVideoPrompt({
				data: {
					fromShotId: selectedTransitionPair.fromShotId,
					toShotId: selectedTransitionPair.toShotId,
					userPrompt: videoPrompt,
					useProjectContext,
					usePrevShotContext,
					assetTypeOverride: promptTypeSelection,
				},
			});
			setVideoPrompt(result.prompt);
			setDetectedPromptAssetType(result.assetType);
			toast("Video prompt enhanced", "success");
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to enhance prompt";
			setError(msg);
			toast(msg, "error");
		} finally {
			setIsEnhancingVideoPrompt(false);
		}
	}

	async function handleGenerateVideo() {
		const pair = selectedTransitionPair;
		if (!pair || !videoPrompt.trim()) return;
		console.info(`${logPrefix} queue:start`, {
			...pair,
			model: videoSettings.model,
		});
		setIsQueueingVideo(true);
		setError(null);
		try {
			const result = await generateTransitionVideo({
				data: {
					fromShotId: pair.fromShotId,
					toShotId: pair.toShotId,
					prompt: videoPrompt.trim(),
					videoSettings,
				},
			});
			await queryClient.refetchQueries({
				queryKey: projectKeys.project(projectId),
				type: "active",
			});
			const fromLabel = shotLabelMap.get(pair.fromShotId);
			const toLabel = shotLabelMap.get(pair.toShotId);
			const location =
				fromLabel && toLabel
					? formatTransitionLocation({
							fromShotNumber: fromLabel.shotNumber,
							toShotNumber: toLabel.shotNumber,
						})
					: "Selected transition";
			const href = `/projects/${projectId}?from=${pair.fromShotId}&to=${pair.toShotId}&mediaTab=video`;
			trackedToastMetaRef.current.set(result.transitionVideoId, {
				title: "Generating transition video",
				location,
			});
			const modelDef = getVideoModelDefinition(videoSettings.model);
			const aspectRatio = videoSettings.modelOptions.aspect_ratio as string | undefined;
			const duration = videoSettings.modelOptions.duration as number | undefined;
			beginGenerationToast({
				id: result.transitionVideoId,
				title: "Generating transition video",
				location,
				medium: "video",
				status: "Queued",
				href,
				metadata: {
					model: modelDef.label,
					aspectRatio: aspectRatio ?? undefined,
					duration: duration ? `${duration}s` : undefined,
				},
			});
			console.info(`${logPrefix} queue:done`, pair);
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to generate video";
			console.error(`${logPrefix} queue request failed`, {
				...pair,
				error: msg,
			});
			setError(msg);
			toast(msg, "error");
		} finally {
			setIsQueueingVideo(false);
		}
	}

	async function handleSelectTransitionVideo(id: string) {
		try {
			await selectTransitionVideo({ data: { transitionVideoId: id } });
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to select video";
			setError(msg);
			toast(msg, "error");
		}
	}

	async function handleDeleteTransitionVideo(id: string) {
		setDeletingVideoId(id);
		try {
			await deleteTransitionVideo({ data: { transitionVideoId: id } });
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to delete video";
			setError(msg);
			toast(msg, "error");
		} finally {
			setDeletingVideoId(null);
		}
	}

	return {
		videoPrompt,
		setVideoPrompt,
		videoSettings,
		setVideoSettings,
		isQueueingVideo,
		isGeneratingVideo,
		isGeneratingVideoPrompt,
		isEnhancingVideoPrompt,
		deletingVideoId,
		useProjectContext,
		setUseProjectContext,
		usePrevShotContext,
		setUsePrevShotContext,
		detectedPromptAssetType,
		promptTypeSelection,
		setPromptTypeSelection,
		runStatusesByVideoId,
		handleGenerateVideoPrompt,
		handleEnhanceVideoPrompt,
		handleGenerateVideo,
		handleSelectTransitionVideo,
		handleDeleteTransitionVideo,
	};
}
