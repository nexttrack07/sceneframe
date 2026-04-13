import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
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
	VideoDefaults,
} from "../project-types";
import { projectKeys } from "../query-keys";
import {
	deleteTransitionVideo,
	enhanceTransitionVideoPrompt,
	generateTransitionVideo,
	generateTransitionVideoPrompt,
	getTransitionVideoRunStatuses,
	pollTransitionVideos,
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
	const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
	const [isGeneratingVideoPrompt, setIsGeneratingVideoPrompt] = useState(false);
	const [isEnhancingVideoPrompt, setIsEnhancingVideoPrompt] = useState(false);
	const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
	const [useProjectContext, setUseProjectContext] = useState(true);
	const [usePrevShotContext, setUsePrevShotContext] = useState(true);
	const [detectedPromptAssetType, setDetectedPromptAssetType] =
		useState<PromptAssetType | null>(null);
	const [promptTypeSelection, setPromptTypeSelection] =
		useState<PromptAssetTypeSelection>("auto");
	const allTransitionVideosRef = useRef(allTransitionVideos);
	const trackedToastMetaRef = useRef(
		new Map<string, { title: string; location: string }>(),
	);
	const cancelPollingRef = useRef(false);
	const isPollingRef = useRef(false);
	const completedRunIdsRef = useRef<Set<string>>(new Set());
	const autoPromptPairKeysRef = useRef<Set<string>>(new Set());
	const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);
	allTransitionVideosRef.current = allTransitionVideos;
	const [runStatusesByVideoId, setRunStatusesByVideoId] = useState<
		Record<string, TriggerRunSummary>
	>({});
	const shotLabelMap = buildShotLabelMap(storyShots);
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

	const stopPolling = useCallback(() => {
		cancelPollingRef.current = true;
		if (pollingIntervalRef.current) {
			clearInterval(pollingIntervalRef.current);
			pollingIntervalRef.current = null;
		}
		isPollingRef.current = false;
		setIsGeneratingVideo(false);
	}, []);

	useEffect(() => {
		if (!selectedTransitionPair) {
			stopPolling();
			return;
		}

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

		// Check if there are any generating videos for this pair
		const hasGeneratingVideos = pairVideos.some((tv) =>
			isPendingVideoStatus(tv.status),
		);

		setVideoPrompt(initialPrompt);
		setVideoSettingsState(
			applyProjectAspectRatioToVideoDefaults(projectId, initialSettings),
		);
		setIsQueueingVideo(false);
		setIsGeneratingVideo(hasGeneratingVideos); // Keep true if videos are generating
		setIsGeneratingVideoPrompt(false);
		setIsEnhancingVideoPrompt(false);
		setDeletingVideoId(null);
		setUseProjectContext(true);
		setUsePrevShotContext(true);
		setDetectedPromptAssetType(null);
		setPromptTypeSelection("auto");
		setRunStatusesByVideoId({});
		completedRunIdsRef.current.clear();
		stopPolling();
		cancelPollingRef.current = false;
	}, [selectedTransitionPair, stopPolling, projectId]);

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

	// Keep local loading state aligned with fresh query data for the selected transition pair.
	useEffect(() => {
		if (!selectedTransitionPair) {
			setIsQueueingVideo(false);
			setIsGeneratingVideo(false);
			setRunStatusesByVideoId({});
			return;
		}

		const hasGeneratingVideos = allTransitionVideos.some(
			(video) =>
				video.fromShotId === selectedTransitionPair.fromShotId &&
				video.toShotId === selectedTransitionPair.toShotId &&
				isPendingVideoStatus(video.status),
		);

		if (!hasGeneratingVideos) {
			if (isPollingRef.current) {
				stopPolling();
			} else {
				setIsGeneratingVideo(false);
			}
			setIsQueueingVideo(false);
			setRunStatusesByVideoId({});
		}
	}, [allTransitionVideos, selectedTransitionPair, stopPolling]);

	useEffect(() => {
		return () => {
			stopPolling();
		};
	}, [stopPolling]);

	const startPolling = useCallback(
		(pair: { fromShotId: string; toShotId: string }) => {
			if (isPollingRef.current) return;

			console.info(`${logPrefix} poll:start`, pair);

			cancelPollingRef.current = false;
			isPollingRef.current = true;
			setIsGeneratingVideo(true);

			const POLL_TIMEOUT_MS = 12 * 60 * 1000;
			const deadline = Date.now() + POLL_TIMEOUT_MS;

			pollingIntervalRef.current = setInterval(async () => {
				if (cancelPollingRef.current || Date.now() > deadline) {
					console.warn(`${logPrefix} poll:stopped`, {
						...pair,
						cancelled: cancelPollingRef.current,
						pastDeadline: Date.now() > deadline,
					});
					stopPolling();
					return;
				}

				try {
					const runStatusResult = await getTransitionVideoRunStatuses({
						data: pair,
					});
					const interestingRuns = runStatusResult.runs.filter(
						(run) =>
							run.status === "completed" ||
							run.status === "failed" ||
							run.status === "canceled",
					);
					if (interestingRuns.length > 0) {
						console.info(`${logPrefix} run:stage`, {
							...pair,
							runs: interestingRuns.map((run) => ({
								assetId: run.assetId,
								status: run.status,
							})),
						});
					}
					const newlyCompletedRuns = runStatusResult.runs.filter((run) => {
						if (run.status !== "completed" || !run.jobId) return false;
						if (completedRunIdsRef.current.has(run.jobId)) return false;
						completedRunIdsRef.current.add(run.jobId);
						return true;
					});
					setRunStatusesByVideoId(
						Object.fromEntries(
							runStatusResult.runs.map((run) => [run.assetId, run]),
						),
					);
					if (newlyCompletedRuns.length > 0) {
						await queryClient.refetchQueries({
							queryKey: projectKeys.project(projectId),
							type: "active",
						});
						console.info(`${logPrefix} run:completed-refetch`, pair);
					}

					const result = await pollTransitionVideos({
						data: pair,
					});

					if (result.isGenerating) {
						await queryClient.refetchQueries({
							queryKey: projectKeys.project(projectId),
							type: "active",
						});
					} else {
						stopPolling();
						setRunStatusesByVideoId({});
						if (!result.selectedDoneId && result.latestDoneId) {
							try {
								await selectTransitionVideo({
									data: { transitionVideoId: result.latestDoneId },
								});
							} catch (error) {
								console.warn(`${logPrefix} auto-select failed`, {
									...pair,
									videoId: result.latestDoneId,
									error: error instanceof Error ? error.message : String(error),
								});
							}
						}
						await queryClient.refetchQueries({
							queryKey: projectKeys.project(projectId),
							type: "active",
						});
						console.info(`${logPrefix} poll:complete`, {
							...pair,
							latestDoneId: result.latestDoneId,
							doneCount: result.doneCount,
							erroredCount: result.erroredCount,
						});
					}
				} catch (error) {
					// Transient error, keep polling.
					console.error(`${logPrefix} poll error`, {
						...pair,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}, 3000);
		},
		[projectId, queryClient, stopPolling],
	);

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

	useEffect(() => {
		const pair = selectedTransitionPair;
		if (!pair) return;
		const generatingTv = allTransitionVideos.find(
			(tv) =>
				tv.fromShotId === pair.fromShotId &&
				tv.toShotId === pair.toShotId &&
				isPendingVideoStatus(tv.status),
		);
		if (!generatingTv || isPollingRef.current) return;
		return startPolling(pair);
	}, [allTransitionVideos, selectedTransitionPair, startPolling]);

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
		cancelPollingRef.current = false;
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
			startPolling(pair);
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
			stopPolling();
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
