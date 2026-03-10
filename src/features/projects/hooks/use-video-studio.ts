import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type { VideoModel } from "../components/studio/video-controls-panel";
import type { TransitionVideoSummary } from "../project-types";
import { projectKeys } from "../query-keys";
import {
	deleteTransitionVideo,
	enhanceTransitionVideoPrompt,
	generateTransitionVideo,
	generateTransitionVideoPrompt,
	pollTransitionVideo,
	selectTransitionVideo,
} from "../scene-actions";

type ToastFn = (message: string, variant: "success" | "error") => void;

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
	const [videoModel, setVideoModel] = useState<VideoModel>("v3-omni");
	const [videoMode, setVideoMode] = useState<"standard" | "pro">("pro");
	const [generateAudio, setGenerateAudio] = useState(false);
	const [negativePrompt, setNegativePrompt] = useState("");
	const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
	const [isGeneratingVideoPrompt, setIsGeneratingVideoPrompt] = useState(false);
	const [isEnhancingVideoPrompt, setIsEnhancingVideoPrompt] = useState(false);
	const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
	const cancelVideoRef = useRef(false);
	const isGeneratingVideoRef = useRef(false);
	const allTransitionVideosRef = useRef(allTransitionVideos);
	allTransitionVideosRef.current = allTransitionVideos;

	// Reset video studio state when selected transition pair changes
	useEffect(() => {
		if (!selectedTransitionPair) return;
		setVideoPrompt("");
		setIsGeneratingVideo(false);
		setIsGeneratingVideoPrompt(false);
		setDeletingVideoId(null);
		cancelVideoRef.current = false;
	}, [selectedTransitionPair?.fromShotId, selectedTransitionPair?.toShotId]); // eslint-disable-line react-hooks/exhaustive-deps

	// Auto-resume polling for any stuck generating transition when transition pair is selected
	useEffect(() => {
		if (!selectedTransitionPair) return;
		const generatingTv = allTransitionVideosRef.current.find(
			(tv) =>
				tv.fromShotId === selectedTransitionPair.fromShotId &&
				tv.toShotId === selectedTransitionPair.toShotId &&
				tv.status === "generating",
		);
		if (!generatingTv || isGeneratingVideoRef.current) return;

		const transitionVideoId = generatingTv.id;
		cancelVideoRef.current = false;
		isGeneratingVideoRef.current = true;
		setIsGeneratingVideo(true);

		const POLL_TIMEOUT_MS = 12 * 60 * 1000;
		const deadline = Date.now() + POLL_TIMEOUT_MS;
		let consecutiveErrors = 0;

		const interval = setInterval(async () => {
			if (cancelVideoRef.current || Date.now() > deadline) {
				clearInterval(interval);
				isGeneratingVideoRef.current = false;
				setIsGeneratingVideo(false);
				return;
			}
			try {
				const result = await pollTransitionVideo({
					data: { transitionVideoId },
				});
				consecutiveErrors = 0;
				if (result.status === "done") {
					const isSelected = allTransitionVideosRef.current.find(
						(tv) =>
							tv.fromShotId === selectedTransitionPair.fromShotId &&
							tv.toShotId === selectedTransitionPair.toShotId &&
							tv.isSelected &&
							tv.status === "done",
					);
					if (!isSelected) {
						await selectTransitionVideo({ data: { transitionVideoId } });
					}
					clearInterval(interval);
					isGeneratingVideoRef.current = false;
					setIsGeneratingVideo(false);
					await queryClient.invalidateQueries({
						queryKey: projectKeys.project(projectId),
					});
					toast("Transition video ready", "success");
				} else if (result.status === "error") {
					clearInterval(interval);
					isGeneratingVideoRef.current = false;
					setIsGeneratingVideo(false);
					await deleteTransitionVideo({ data: { transitionVideoId } });
					await queryClient.invalidateQueries({
						queryKey: projectKeys.project(projectId),
					});
					toast(result.errorMessage ?? "Video generation failed", "error");
				}
			} catch (err) {
				consecutiveErrors++;
				if (consecutiveErrors >= 3) {
					clearInterval(interval);
					isGeneratingVideoRef.current = false;
					setIsGeneratingVideo(false);
					const msg = err instanceof Error ? err.message : "Polling failed";
					toast(msg, "error");
				}
			}
		}, 5000);

		return () => {
			clearInterval(interval);
			cancelVideoRef.current = true;
		};
	}, [selectedTransitionPair?.fromShotId, selectedTransitionPair?.toShotId]); // eslint-disable-line react-hooks/exhaustive-deps

	async function handleGenerateVideoPrompt() {
		if (!selectedTransitionPair) return;
		setIsGeneratingVideoPrompt(true);
		setError(null);
		try {
			const result = await generateTransitionVideoPrompt({
				data: {
					fromShotId: selectedTransitionPair.fromShotId,
					toShotId: selectedTransitionPair.toShotId,
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
		if (!selectedTransitionPair || !videoPrompt.trim()) return;
		isGeneratingVideoRef.current = true;
		setIsGeneratingVideo(true);
		cancelVideoRef.current = false;
		setError(null);
		try {
			const { transitionVideoId } = await generateTransitionVideo({
				data: {
					fromShotId: selectedTransitionPair.fromShotId,
					toShotId: selectedTransitionPair.toShotId,
					prompt: videoPrompt.trim(),
					videoModel,
					mode: videoMode,
					generateAudio,
					negativePrompt,
				},
			});

			const POLL_TIMEOUT_MS = 12 * 60 * 1000;
			const deadline = Date.now() + POLL_TIMEOUT_MS;

			await new Promise<void>((resolve, reject) => {
				let settled = false;
				const interval = setInterval(async () => {
					if (settled) return;
					if (Date.now() > deadline || cancelVideoRef.current) {
						settled = true;
						clearInterval(interval);
						// Delete the zombie DB record so it doesn't get auto-resumed on next load
						deleteTransitionVideo({ data: { transitionVideoId } }).catch(
							() => {},
						);
						reject(
							new Error(
								cancelVideoRef.current
									? "Cancelled"
									: "Video generation timed out",
							),
						);
						return;
					}
					try {
						const result = await pollTransitionVideo({
							data: { transitionVideoId },
						});
						if (result.status === "done") {
							// Auto-select if nothing is selected yet
							const hasSelected = allTransitionVideosRef.current.some(
								(tv) =>
									tv.fromShotId === selectedTransitionPair.fromShotId &&
									tv.toShotId === selectedTransitionPair.toShotId &&
									tv.isSelected &&
									tv.status === "done",
							);
							if (!hasSelected) {
								await selectTransitionVideo({ data: { transitionVideoId } });
							}
							settled = true;
							clearInterval(interval);
							resolve();
						} else if (result.status === "error") {
							settled = true;
							clearInterval(interval);
							await deleteTransitionVideo({
								data: { transitionVideoId },
							}).catch(() => {});
							reject(
								new Error(result.errorMessage ?? "Video generation failed"),
							);
						}
					} catch {
						// transient error — keep polling
					}
				}, 5000);
			});

			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			toast("Transition video generated", "success");
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to generate video";
			setError(msg);
			toast(msg, "error");
		} finally {
			isGeneratingVideoRef.current = false;
			setIsGeneratingVideo(false);
			cancelVideoRef.current = false;
		}
	}

	async function handleSelectTransitionVideo(transitionVideoId: string) {
		setError(null);
		try {
			await selectTransitionVideo({ data: { transitionVideoId } });
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			toast("Video selected", "success");
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to select video";
			setError(msg);
			toast(msg, "error");
		}
	}

	async function handleDeleteTransitionVideo(transitionVideoId: string) {
		setDeletingVideoId(transitionVideoId);
		setError(null);
		try {
			await deleteTransitionVideo({ data: { transitionVideoId } });
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			toast("Video deleted", "success");
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
		videoModel,
		setVideoModel,
		videoMode,
		setVideoMode,
		generateAudio,
		setGenerateAudio,
		negativePrompt,
		setNegativePrompt,
		isGeneratingVideo,
		isGeneratingVideoPrompt,
		isEnhancingVideoPrompt,
		deletingVideoId,
		cancelVideoRef,
		allTransitionVideosRef,
		handleGenerateVideo,
		handleGenerateVideoPrompt,
		handleEnhanceVideoPrompt,
		handleSelectTransitionVideo,
		handleDeleteTransitionVideo,
	};
}
