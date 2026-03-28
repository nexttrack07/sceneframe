import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeVideoDefaults } from "../project-normalize";
import type {
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
	allShotVideos,
	toast,
	setError,
}: {
	projectId: string;
	selectedShotId: string | null;
	allShotVideos: ShotVideoSummary[];
	toast: ToastFn;
	setError: (msg: string | null) => void;
}) {
	const queryClient = useQueryClient();
	const [videoPrompt, setVideoPrompt] = useState("");
	const [videoSettings, setVideoSettings] = useState<VideoDefaults>(
		normalizeVideoDefaults(null),
	);
	const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
	const [isGeneratingVideoPrompt, setIsGeneratingVideoPrompt] = useState(false);
	const [isEnhancingVideoPrompt, setIsEnhancingVideoPrompt] = useState(false);
	const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
	const [useProjectContext, setUseProjectContext] = useState(true);
	const [usePrevShotContext, setUsePrevShotContext] = useState(true);
	// Reference image for video generation (null = use selected image)
	const [referenceImageId, setReferenceImageId] = useState<string | null>(null);
	const allShotVideosRef = useRef(allShotVideos);
	const cancelPollingRef = useRef(false);
	const isPollingRef = useRef(false);
	const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);
	allShotVideosRef.current = allShotVideos;
	const [runStatusesByVideoId, setRunStatusesByVideoId] = useState<
		Record<string, TriggerRunSummary>
	>({});

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
		const hasGeneratingVideos = shotVideos.some(
			(v) => v.status === "generating",
		);

		setVideoPrompt(initialPrompt);
		setVideoSettings(initialSettings);
		setIsGeneratingVideo(hasGeneratingVideos);
		setIsGeneratingVideoPrompt(false);
		setIsEnhancingVideoPrompt(false);
		setDeletingVideoId(null);
		setUseProjectContext(true);
		setUsePrevShotContext(true);
		setReferenceImageId(null);
		setRunStatusesByVideoId({});
		stopPolling();
		cancelPollingRef.current = false;
	}, [selectedShotId, stopPolling]);

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

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			stopPolling();
		};
	}, [stopPolling]);

	const startPolling = useCallback(
		(shotId: string) => {
			if (isPollingRef.current) return;

			cancelPollingRef.current = false;
			isPollingRef.current = true;
			setIsGeneratingVideo(true);

			const POLL_TIMEOUT_MS = 12 * 60 * 1000;
			const deadline = Date.now() + POLL_TIMEOUT_MS;

			pollingIntervalRef.current = setInterval(async () => {
				if (cancelPollingRef.current || Date.now() > deadline) {
					stopPolling();
					return;
				}

				try {
					const runStatusResult = await getShotVideoRunStatuses({
						data: { shotId },
					});
					setRunStatusesByVideoId(
						Object.fromEntries(
							runStatusResult.runs.map((run) => [run.assetId, run]),
						),
					);

					const result = await pollShotVideos({
						data: { shotId },
					});

					if (!result.isGenerating) {
						if (!result.selectedDoneId && result.latestDoneId) {
							await selectShotVideo({
								data: { videoId: result.latestDoneId },
							});
						}

						stopPolling();
						setRunStatusesByVideoId({});
						await queryClient.invalidateQueries({
							queryKey: projectKeys.project(projectId),
						});

						if (result.doneCount > 0) {
							toast(
								`${result.doneCount} video${result.doneCount !== 1 ? "s" : ""} ready${result.erroredCount > 0 ? ` (${result.erroredCount} failed)` : ""}`,
								result.erroredCount > 0 ? "error" : "success",
							);
						} else if (result.erroredCount > 0) {
							toast(
								result.latestErrorMessage ?? "Video generation failed",
								"error",
							);
						}
					}
				} catch {
					// Transient error, keep polling.
				}
			}, 3000);
		},
		[projectId, queryClient, stopPolling, toast],
	);

	// Auto-start polling if there are generating videos on mount
	useEffect(() => {
		const shotId = selectedShotId;
		if (!shotId) return;
		const generatingVideo = allShotVideosRef.current.find(
			(v) => v.shotId === shotId && v.status === "generating",
		);
		if (!generatingVideo || isPollingRef.current) return;
		startPolling(shotId);
	}, [selectedShotId, startPolling]);

	async function handleGenerateVideoPrompt() {
		if (!selectedShotId) return;
		setIsGeneratingVideoPrompt(true);
		setError(null);
		try {
			const result = await generateShotVideoPrompt({
				data: { shotId: selectedShotId },
			});
			setVideoPrompt(result.prompt);
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
		setIsEnhancingVideoPrompt(true);
		setError(null);
		try {
			const result = await enhanceShotVideoPrompt({
				data: {
					shotId: selectedShotId,
					userPrompt: videoPrompt,
					useProjectContext,
					usePrevShotContext,
				},
			});
			setVideoPrompt(result.prompt);
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
		if (isPollingRef.current) return;
		setIsGeneratingVideo(true);
		cancelPollingRef.current = false;
		setError(null);
		try {
			await generateShotVideo({
				data: {
					shotId,
					prompt: videoPrompt.trim(),
					videoSettings,
					referenceImageId: referenceImageId ?? undefined,
				},
			});
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			startPolling(shotId);
			toast("Queued video generation", "success");
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to generate video";
			setError(msg);
			toast(msg, "error");
			stopPolling();
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
		isGeneratingVideo,
		isGeneratingVideoPrompt,
		isEnhancingVideoPrompt,
		deletingVideoId,
		useProjectContext,
		setUseProjectContext,
		usePrevShotContext,
		setUsePrevShotContext,
		referenceImageId,
		setReferenceImageId,
		runStatusesByVideoId,
		handleGenerateVideoPrompt,
		handleEnhanceVideoPrompt,
		handleGenerateVideo,
		handleSelectShotVideo,
		handleDeleteShotVideo,
	};
}
