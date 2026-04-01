import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Shot } from "@/db/schema";
import { buildShotLabelMap, formatShotLocation } from "../generation-labels";
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
	SceneAssetSummary,
	ShotVideoSummary,
	TriggerRunSummary,
	VideoDefaults,
} from "../project-types";
import { projectKeys } from "../query-keys";
import {
	deleteShotVideo,
	enhanceShotVideoPrompt,
	generateShotVideo,
	generateShotVideoPrompt,
	getShotVideoRunStatuses,
	pollShotVideos,
	selectShotVideo,
} from "../scene-actions";
import { isPendingVideoStatus } from "../video-status";

type ToastFn = (message: string, variant: "success" | "error") => void;

function getShotVideoDraftStorageKey(shotId: string) {
	return `shot-video-draft:${shotId}`;
}

function readShotVideoDraft(shotId: string) {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(getShotVideoDraftStorageKey(shotId));
	} catch {
		return null;
	}
}

function writeShotVideoDraft(shotId: string, prompt: string) {
	if (typeof window === "undefined") return;
	try {
		const key = getShotVideoDraftStorageKey(shotId);
		if (prompt.trim().length === 0) {
			window.localStorage.removeItem(key);
			return;
		}
		window.localStorage.setItem(key, prompt);
	} catch {
		// Ignore storage failures; drafts are a UX enhancement.
	}
}

function getShotVideoSettingsStorageKey() {
	return `shot-video-studio:last-settings`;
}

function readShotVideoSettings(): VideoDefaults | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(getShotVideoSettingsStorageKey());
		if (!raw) return null;
		return normalizeVideoDefaults(JSON.parse(raw));
	} catch {
		return null;
	}
}

function writeShotVideoSettings(settings: VideoDefaults) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(
			getShotVideoSettingsStorageKey(),
			JSON.stringify(settings),
		);
	} catch {
		// Ignore storage failures.
	}
}

export function useShotVideoStudio({
	projectId,
	selectedShotId,
	storyShots,
	assetsByShotId,
	allShotVideos,
	toast,
	setError,
}: {
	projectId: string;
	selectedShotId: string | null;
	storyShots: Shot[];
	assetsByShotId: Map<string, SceneAssetSummary[]>;
	allShotVideos: ShotVideoSummary[];
	toast: ToastFn;
	setError: (msg: string | null) => void;
}) {
	const queryClient = useQueryClient();
	const logPrefix = "[ShotVideo]";
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
	const [usePrevShotImage, setUsePrevShotImage] = useState(true);
	// Reference images for video generation selected manually in the slider.
	const [referenceImageIds, setReferenceImageIds] = useState<string[]>([]);
	const [detectedPromptAssetType, setDetectedPromptAssetType] =
		useState<PromptAssetType | null>(null);
	const [promptTypeSelection, setPromptTypeSelection] =
		useState<PromptAssetTypeSelection>("auto");
	const allShotVideosRef = useRef(allShotVideos);
	const trackedToastMetaRef = useRef(
		new Map<string, { title: string; location: string }>(),
	);
	const cancelPollingRef = useRef(false);
	const isPollingRef = useRef(false);
	const completedRunIdsRef = useRef<Set<string>>(new Set());
	const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);
	allShotVideosRef.current = allShotVideos;
	const [runStatusesByVideoId, setRunStatusesByVideoId] = useState<
		Record<string, TriggerRunSummary>
	>({});
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

	// Reset state when shot changes
	useEffect(() => {
		if (!selectedShotId) {
			stopPolling();
			return;
		}

		const shotVideos = allShotVideosRef.current.filter(
			(v) => v.shotId === selectedShotId,
		);
		const promptVideos = shotVideos.filter((v) => v.prompt);
		const selectedVideo = shotVideos.find((v) => v.isSelected);
		const draftPrompt = readShotVideoDraft(selectedShotId);
		const initialPrompt =
			draftPrompt ?? selectedVideo?.prompt ?? promptVideos[0]?.prompt ?? "";
		const draftSettings = readShotVideoSettings();
		const initialSettings =
			draftSettings ??
			normalizeVideoDefaults({
				model: selectedVideo?.model ?? promptVideos[0]?.model,
				modelOptions:
					selectedVideo?.modelSettings ??
					promptVideos[0]?.modelSettings ??
					null,
			});

		// Check if there are any generating videos for this shot
		const hasGeneratingVideos = shotVideos.some((v) =>
			isPendingVideoStatus(v.status),
		);

		setVideoPrompt(initialPrompt);
		setVideoSettingsState(
			applyProjectAspectRatioToVideoDefaults(projectId, initialSettings),
		);
		setIsQueueingVideo(false);
		setIsGeneratingVideo(hasGeneratingVideos);
		setIsGeneratingVideoPrompt(false);
		setIsEnhancingVideoPrompt(false);
		setDeletingVideoId(null);
		setUseProjectContext(true);
		setUsePrevShotContext(true);
		setUsePrevShotImage(false);
		setReferenceImageIds([]);
		setDetectedPromptAssetType(null);
		setPromptTypeSelection("auto");
		setRunStatusesByVideoId({});
		completedRunIdsRef.current.clear();
		stopPolling();
		cancelPollingRef.current = false;
	}, [selectedShotId, stopPolling, projectId]);

	// Persist draft prompt
	useEffect(() => {
		if (!selectedShotId) return;
		writeShotVideoDraft(selectedShotId, videoPrompt);
	}, [selectedShotId, videoPrompt]);

	// Persist settings
	useEffect(() => {
		if (!selectedShotId) return;
		writeShotVideoSettings(videoSettings);
	}, [selectedShotId, videoSettings]);

	// Keep local loading state aligned with fresh query data for the selected shot.
	useEffect(() => {
		if (!selectedShotId) {
			setIsGeneratingVideo(false);
			setRunStatusesByVideoId({});
			return;
		}

		const hasGeneratingVideos = allShotVideos.some(
			(video) =>
				video.shotId === selectedShotId && isPendingVideoStatus(video.status),
		);

		if (!hasGeneratingVideos) {
			if (isPollingRef.current) {
				stopPolling();
			} else {
				setIsGeneratingVideo(false);
			}
			setRunStatusesByVideoId({});
		}
	}, [allShotVideos, selectedShotId, stopPolling]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			stopPolling();
		};
	}, [stopPolling]);

	const selectedShot = selectedShotId
		? (storyShots.find((shot) => shot.id === selectedShotId) ?? null)
		: null;
	const shotLabelMap = buildShotLabelMap(storyShots);
	const prevShot = selectedShot
		? (() => {
				const idx = storyShots.findIndex((shot) => shot.id === selectedShot.id);
				return idx > 0 ? storyShots[idx - 1] : null;
			})()
		: null;
	const prevShotSelectedImage = prevShot
		? ((assetsByShotId.get(prevShot.id) ?? []).find(
				(asset) => asset.isSelected && asset.status === "done" && asset.url,
			) ?? null)
		: null;

	useEffect(() => {
		if (!selectedShotId) {
			setUsePrevShotImage(false);
			return;
		}

		setUsePrevShotImage(Boolean(prevShotSelectedImage));
	}, [selectedShotId, prevShotSelectedImage]);

	const startPolling = useCallback(
		(shotId: string) => {
			if (isPollingRef.current) return;

			console.info(`${logPrefix} poll:start`, { shotId });

			cancelPollingRef.current = false;
			isPollingRef.current = true;
			setIsGeneratingVideo(true);

			const POLL_TIMEOUT_MS = 12 * 60 * 1000;
			const deadline = Date.now() + POLL_TIMEOUT_MS;

			pollingIntervalRef.current = setInterval(async () => {
				if (cancelPollingRef.current || Date.now() > deadline) {
					console.warn(`${logPrefix} poll:stopped`, {
						shotId,
						cancelled: cancelPollingRef.current,
						pastDeadline: Date.now() > deadline,
					});
					stopPolling();
					return;
				}

				try {
					const runStatusResult = await getShotVideoRunStatuses({
						data: { shotId },
					});
					const interestingRuns = runStatusResult.runs.filter(
						(run) =>
							run.status === "completed" ||
							run.status === "failed" ||
							run.status === "canceled",
					);
					if (interestingRuns.length > 0) {
						console.info(`${logPrefix} run:stage`, {
							shotId,
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
						console.info(`${logPrefix} run:completed-refetch`, {
							shotId,
							count: newlyCompletedRuns.length,
						});
					}

					const result = await pollShotVideos({
						data: { shotId },
					});

					if (result.isGenerating) {
						await queryClient.refetchQueries({
							queryKey: projectKeys.project(projectId),
							type: "active",
						});
					} else {
						console.info(`${logPrefix} poll:complete`, {
							shotId,
							latestDoneId: result.latestDoneId,
							doneCount: result.doneCount,
							erroredCount: result.erroredCount,
						});
						stopPolling();
						setRunStatusesByVideoId({});
						if (!result.selectedDoneId && result.latestDoneId) {
							try {
								await selectShotVideo({
									data: { videoId: result.latestDoneId },
								});
							} catch (error) {
								console.warn(`${logPrefix} auto-select failed`, {
									shotId,
									videoId: result.latestDoneId,
									error: error instanceof Error ? error.message : String(error),
								});
							}
						}
						await queryClient.refetchQueries({
							queryKey: projectKeys.project(projectId),
							type: "active",
						});
					}
				} catch (err) {
					// Transient error, keep polling.
					console.error(`${logPrefix} poll error`, {
						shotId,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}, 3000);
		},
		[projectId, queryClient, stopPolling],
	);

	useEffect(() => {
		for (const [videoId, meta] of trackedToastMetaRef.current.entries()) {
			const video = allShotVideos.find((entry) => entry.id === videoId);
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
	}, [allShotVideos]);

	// Auto-start polling if there are generating videos on mount
	useEffect(() => {
		const shotId = selectedShotId;
		if (!shotId) return;
		const generatingVideo = allShotVideos.find(
			(v) => v.shotId === shotId && isPendingVideoStatus(v.status),
		);
		if (!generatingVideo || isPollingRef.current) return;
		startPolling(shotId);
	}, [allShotVideos, selectedShotId, startPolling]);

	async function handleGenerateVideoPrompt() {
		if (!selectedShotId) return;
		const effectiveReferenceImageIds = [
			...(usePrevShotImage && prevShotSelectedImage
				? [prevShotSelectedImage.id]
				: []),
			...referenceImageIds,
		];
		setIsGeneratingVideoPrompt(true);
		setError(null);
		try {
			const result = await generateShotVideoPrompt({
				data: {
					shotId: selectedShotId,
					referenceImageIds: effectiveReferenceImageIds,
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
		if (!selectedShotId || !videoPrompt.trim()) return;
		const effectiveReferenceImageIds = [
			...(usePrevShotImage && prevShotSelectedImage
				? [prevShotSelectedImage.id]
				: []),
			...referenceImageIds,
		];
		setIsEnhancingVideoPrompt(true);
		setError(null);
		try {
			const result = await enhanceShotVideoPrompt({
				data: {
					shotId: selectedShotId,
					userPrompt: videoPrompt,
					useProjectContext,
					usePrevShotContext,
					referenceImageIds: effectiveReferenceImageIds,
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
		const shotId = selectedShotId;
		if (!shotId || !videoPrompt.trim()) return;
		const effectiveReferenceImageIds = [
			...(usePrevShotImage && prevShotSelectedImage
				? [prevShotSelectedImage.id]
				: []),
			...referenceImageIds,
		];
		console.info(`${logPrefix} queue:start`, {
			shotId,
			model: videoSettings.model,
			referenceCount: effectiveReferenceImageIds.length,
		});
		setIsQueueingVideo(true);
		cancelPollingRef.current = false;
		setError(null);
		try {
			const result = await generateShotVideo({
				data: {
					shotId,
					prompt: videoPrompt.trim(),
					videoSettings,
					referenceImageIds:
						effectiveReferenceImageIds.length > 0
							? effectiveReferenceImageIds
							: undefined,
				},
			});
			await queryClient.refetchQueries({
				queryKey: projectKeys.project(projectId),
				type: "active",
			});
			const label = shotLabelMap.get(shotId);
			const location = label ? formatShotLocation(label) : "Selected shot";
			const sceneId =
				storyShots.find((shot) => shot.id === shotId)?.sceneId ?? null;
			const href = sceneId
				? `/projects/${projectId}?scene=${sceneId}&shot=${shotId}&mediaTab=video`
				: `/projects/${projectId}?shot=${shotId}&mediaTab=video`;
			trackedToastMetaRef.current.set(result.assetId, {
				title: "Generating video",
				location,
			});
			beginGenerationToast({
				id: result.assetId,
				title: "Generating video",
				location,
				medium: "video",
				status: "Queued",
				href,
			});
			startPolling(shotId);
			console.info(`${logPrefix} queue:done`, { shotId });
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to generate video";
			console.error(`${logPrefix} queue request failed`, {
				shotId,
				error: msg,
			});
			setError(msg);
			toast(msg, "error");
			stopPolling();
		} finally {
			setIsQueueingVideo(false);
		}
	}

	async function handleSelectShotVideo(id: string) {
		try {
			await selectShotVideo({ data: { videoId: id } });
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to select video";
			setError(msg);
			toast(msg, "error");
		}
	}

	async function handleDeleteShotVideo(id: string) {
		setDeletingVideoId(id);
		try {
			await deleteShotVideo({ data: { videoId: id } });
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
		usePrevShotImage,
		setUsePrevShotImage,
		prevShotSelectedImage,
		referenceImageIds,
		setReferenceImageIds,
		detectedPromptAssetType,
		promptTypeSelection,
		setPromptTypeSelection,
		runStatusesByVideoId,
		handleGenerateVideoPrompt,
		handleEnhanceVideoPrompt,
		handleGenerateVideo,
		handleSelectShotVideo,
		handleDeleteShotVideo,
	};
}
