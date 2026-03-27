import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeVideoDefaults } from "../project-normalize";
import type {
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
} from "../scene-actions";

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
	allTransitionVideos,
	toast,
	setError,
}: {
	projectId: string;
	selectedTransitionPair: { fromShotId: string; toShotId: string } | null;
	allTransitionVideos: TransitionVideoSummary[];
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
	const allTransitionVideosRef = useRef(allTransitionVideos);
	const cancelPollingRef = useRef(false);
	const isPollingRef = useRef(false);
	const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);
	allTransitionVideosRef.current = allTransitionVideos;
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

	useEffect(() => {
		if (!selectedTransitionPair) {
			stopPolling();
			return;
		}

		const pairVideos = allTransitionVideos.filter(
			(tv) =>
				tv.fromShotId === selectedTransitionPair.fromShotId &&
				tv.toShotId === selectedTransitionPair.toShotId,
		);
		const promptVideos = pairVideos.filter((tv) => tv.prompt);
		const selectedVideo = pairVideos.find((tv) => tv.isSelected);
		const draftPrompt = readTransitionDraft(selectedTransitionPair);
		const initialPrompt =
			draftPrompt ?? selectedVideo?.prompt ?? promptVideos[0]?.prompt ?? "";
		const draftSettings = readTransitionSettings();
		const initialSettings =
			draftSettings ??
			normalizeVideoDefaults({
				model: selectedVideo?.model ?? promptVideos[0]?.model,
				modelOptions:
					selectedVideo?.modelSettings ??
					promptVideos[0]?.modelSettings ??
					null,
			});

		setVideoPrompt(initialPrompt);
		setVideoSettings(initialSettings);
		setIsGeneratingVideo(false);
		setIsGeneratingVideoPrompt(false);
		setIsEnhancingVideoPrompt(false);
		setDeletingVideoId(null);
		setUseProjectContext(true);
		setUsePrevShotContext(true);
		setRunStatusesByVideoId({});
		stopPolling();
		cancelPollingRef.current = false;
	}, [selectedTransitionPair, allTransitionVideos, stopPolling]);

	useEffect(() => {
		if (!selectedTransitionPair) return;
		writeTransitionDraft(selectedTransitionPair, videoPrompt);
	}, [selectedTransitionPair, videoPrompt]);

	useEffect(() => {
		if (!selectedTransitionPair) return;
		writeTransitionSettings(videoSettings);
	}, [selectedTransitionPair, videoSettings]);

	useEffect(() => {
		return () => {
			stopPolling();
		};
	}, [stopPolling]);

	const startPolling = useCallback(
		(pair: { fromShotId: string; toShotId: string }) => {
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
					const runStatusResult = await getTransitionVideoRunStatuses({
						data: pair,
					});
					setRunStatusesByVideoId(
						Object.fromEntries(
							runStatusResult.runs.map((run) => [run.assetId, run]),
						),
					);

					const result = await pollTransitionVideos({
						data: pair,
					});

					if (!result.isGenerating) {
						if (!result.selectedDoneId && result.latestDoneId) {
							await selectTransitionVideo({
								data: { transitionVideoId: result.latestDoneId },
							});
						}

						stopPolling();
						setRunStatusesByVideoId({});
						await queryClient.invalidateQueries({
							queryKey: projectKeys.project(projectId),
						});

						if (result.doneCount > 0) {
							toast(
								`${result.doneCount} transition video${result.doneCount !== 1 ? "s" : ""} ready${result.erroredCount > 0 ? ` (${result.erroredCount} failed)` : ""}`,
								result.erroredCount > 0 ? "error" : "success",
							);
						} else if (result.erroredCount > 0) {
							toast(
								result.latestErrorMessage ??
									"Transition video generation failed",
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

	useEffect(() => {
		const pair = selectedTransitionPair;
		if (!pair) return;
		const generatingTv = allTransitionVideosRef.current.find(
			(tv) =>
				tv.fromShotId === pair.fromShotId &&
				tv.toShotId === pair.toShotId &&
				tv.status === "generating",
		);
		if (!generatingTv || isPollingRef.current) return;
		return startPolling(pair);
	}, [selectedTransitionPair, startPolling]);

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
				},
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
		const pair = selectedTransitionPair;
		if (!pair || !videoPrompt.trim()) return;
		if (isPollingRef.current) return;
		setIsGeneratingVideo(true);
		cancelPollingRef.current = false;
		setError(null);
		try {
			await generateTransitionVideo({
				data: {
					fromShotId: pair.fromShotId,
					toShotId: pair.toShotId,
					prompt: videoPrompt.trim(),
					videoSettings,
				},
			});
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			startPolling(pair);
			toast("Queued transition video", "success");
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to generate video";
			setError(msg);
			toast(msg, "error");
			stopPolling();
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
		isGeneratingVideo,
		isGeneratingVideoPrompt,
		isEnhancingVideoPrompt,
		deletingVideoId,
		useProjectContext,
		setUseProjectContext,
		usePrevShotContext,
		setUsePrevShotContext,
		runStatusesByVideoId,
		handleGenerateVideoPrompt,
		handleEnhanceVideoPrompt,
		handleGenerateVideo,
		handleSelectTransitionVideo,
		handleDeleteTransitionVideo,
	};
}
