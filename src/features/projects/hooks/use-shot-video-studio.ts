import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shot } from "@/db/schema";
import { updateShotPromptContext } from "../character-actions";
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
	ProjectSettings,
	PromptAssetType,
	PromptAssetTypeSelection,
	SceneAssetSummary,
	ShotVideoSummary,
	TriggerRunSummary,
	TriggerRunUiStatus,
	VideoDefaults,
} from "../project-types";
import { projectKeys } from "../query-keys";
import { getRealtimeToken } from "../realtime-actions";
import {
	deleteShotVideo,
	enhanceShotVideoPrompt,
	generateShotVideo,
	generateShotVideoPrompt,
	selectShotVideo,
} from "../shot-actions";
import { getVideoModelDefinition } from "../video-models";
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
	projectSettings,
	toast,
	setError,
}: {
	projectId: string;
	selectedShotId: string | null;
	storyShots: Shot[];
	assetsByShotId: Map<string, SceneAssetSummary[]>;
	allShotVideos: ShotVideoSummary[];
	projectSettings: ProjectSettings | null;
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
	const [isGeneratingVideoPrompt, setIsGeneratingVideoPrompt] = useState(false);
	const [isEnhancingVideoPrompt, setIsEnhancingVideoPrompt] = useState(false);
	const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
	const [useProjectContext, setUseProjectContext] = useState(true);
	const [usePrevShotContext, setUsePrevShotContext] = useState(true);
	const [useProjectCharacters, setUseProjectCharacters] = useState(true);
	const [useProjectLocations, setUseProjectLocations] = useState(true);
	const [excludedCharacterIds, setExcludedCharacterIds] = useState<string[]>(
		[],
	);
	const [excludedLocationIds, setExcludedLocationIds] = useState<string[]>([]);
	const [usePrevShotImage, setUsePrevShotImage] = useState(true);
	// Reference images for video generation selected manually in the slider.
	const [referenceImageIds, setReferenceImageIds] = useState<string[]>([]);
	const [detectedPromptAssetType, setDetectedPromptAssetType] =
		useState<PromptAssetType | null>(null);
	const [promptTypeSelection, setPromptTypeSelection] =
		useState<PromptAssetTypeSelection>("auto");
	const [realtimeToken, setRealtimeToken] = useState<string | null>(null);
	const allShotVideosRef = useRef(allShotVideos);
	const trackedToastMetaRef = useRef(
		new Map<string, { title: string; location: string }>(),
	);
	const processedRunIdsRef = useRef<Set<string>>(new Set());
	allShotVideosRef.current = allShotVideos;

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
			createdAt: "1h",
		},
	);

	// Derive run statuses from realtime runs, keyed by video ID
	const runStatusesByVideoId = useMemo(() => {
		if (!realtimeRuns) return {};
		const statusMap: Record<string, TriggerRunSummary> = {};
		for (const run of realtimeRuns) {
			const videoTag = run.tags?.find((tag) => tag.startsWith("video:"));
			if (!videoTag) continue;
			const videoId = videoTag.replace("video:", "");
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

	// Derive isGeneratingVideo from allShotVideos for selected shot
	const isGeneratingVideo = useMemo(() => {
		if (!selectedShotId) return false;
		return allShotVideos.some(
			(video) =>
				video.shotId === selectedShotId && isPendingVideoStatus(video.status),
		);
	}, [allShotVideos, selectedShotId]);
	const allCharacterIds = useMemo(
		() => projectSettings?.characters?.map((character) => character.id) ?? [],
		[projectSettings?.characters],
	);
	const allLocationIds = useMemo(
		() => projectSettings?.locations?.map((location) => location.id) ?? [],
		[projectSettings?.locations],
	);
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

	// Reset state when shot changes
	useEffect(() => {
		if (!selectedShotId) return;

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
		setUseProjectCharacters(
			projectSettings?.shotPromptContext?.[selectedShotId]
				?.useProjectCharacters ?? true,
		);
		const savedExcludedCharacterIds =
			projectSettings?.shotPromptContext?.[selectedShotId]
				?.excludedCharacterIds ?? [];
		setExcludedCharacterIds(
			projectSettings?.shotPromptContext?.[selectedShotId]
				?.useProjectCharacters === false
				? allCharacterIds
				: savedExcludedCharacterIds,
		);
		setUseProjectLocations(
			projectSettings?.shotPromptContext?.[selectedShotId]
				?.useProjectLocations ?? true,
		);
		const savedExcludedLocationIds =
			projectSettings?.shotPromptContext?.[selectedShotId]
				?.excludedLocationIds ?? [];
		setExcludedLocationIds(
			projectSettings?.shotPromptContext?.[selectedShotId]
				?.useProjectLocations === false
				? allLocationIds
				: savedExcludedLocationIds,
		);
		setUsePrevShotImage(false);
		setReferenceImageIds([]);
		setDetectedPromptAssetType(null);
		setPromptTypeSelection("auto");
		processedRunIdsRef.current.clear();
	}, [
		selectedShotId,
		projectId,
		projectSettings?.shotPromptContext?.[selectedShotId ?? ""]
			?.useProjectCharacters,
		projectSettings?.shotPromptContext?.[selectedShotId ?? ""]
			?.excludedCharacterIds,
		projectSettings?.shotPromptContext?.[selectedShotId ?? ""]
			?.useProjectLocations,
		projectSettings?.shotPromptContext?.[selectedShotId ?? ""]
			?.excludedLocationIds,
		allCharacterIds,
		allLocationIds,
	]);

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

	// Reset isQueueingVideo when no longer generating
	useEffect(() => {
		if (!selectedShotId) {
			setIsQueueingVideo(false);
			return;
		}
		if (!isGeneratingVideo) {
			setIsQueueingVideo(false);
		}
	}, [isGeneratingVideo, selectedShotId]);

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

	// Handle realtime run completions - refetch data
	useEffect(() => {
		if (!realtimeRuns || !selectedShotId) return;

		const shotVideoIds = new Set(
			allShotVideos
				.filter((v) => v.shotId === selectedShotId)
				.map((v) => v.id),
		);

		for (const run of realtimeRuns) {
			if (processedRunIdsRef.current.has(run.id)) continue;

			const videoTag = run.tags?.find((tag) => tag.startsWith("video:"));
			if (!videoTag) continue;
			const videoId = videoTag.replace("video:", "");

			if (!shotVideoIds.has(videoId)) continue;

			if (run.status === "COMPLETED" || run.status === "FAILED" || run.status === "CANCELED") {
				processedRunIdsRef.current.add(run.id);
				console.info(`${logPrefix} realtime:run-finished`, {
					runId: run.id,
					videoId,
					status: run.status,
				});

				void queryClient.refetchQueries({
					queryKey: projectKeys.project(projectId),
					type: "active",
				});
			}
		}
	}, [realtimeRuns, selectedShotId, allShotVideos, projectId, queryClient]);

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
					useProjectCharacters,
					excludedCharacterIds,
					useProjectLocations,
					excludedLocationIds,
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
					useProjectCharacters,
					excludedCharacterIds,
					useProjectLocations,
					excludedLocationIds,
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
			const href = `/projects/${projectId}?shot=${shotId}&mediaTab=video`;
			trackedToastMetaRef.current.set(result.assetId, {
				title: "Generating video",
				location,
			});
			const modelDef = getVideoModelDefinition(videoSettings.model);
			const aspectRatio = videoSettings.modelOptions.aspect_ratio as string | undefined;
			const duration = videoSettings.modelOptions.duration as number | undefined;
			beginGenerationToast({
				id: result.assetId,
				title: "Generating video",
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

	async function handleUseProjectCharactersChange(value: boolean) {
		setUseProjectCharacters(value);
		const nextExcludedCharacterIds = value ? [] : allCharacterIds;
		setExcludedCharacterIds(nextExcludedCharacterIds);
		if (!selectedShotId) return;
		try {
			await updateShotPromptContext({
				data: {
					projectId,
					shotId: selectedShotId,
					settings: {
						useProjectCharacters: value,
						excludedCharacterIds: nextExcludedCharacterIds,
					},
				},
			});
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			const msg =
				err instanceof Error
					? err.message
					: "Failed to update character prompt settings";
			setError(msg);
			toast(msg, "error");
		}
	}

	async function handleUseProjectLocationsChange(value: boolean) {
		setUseProjectLocations(value);
		const nextExcludedLocationIds = value ? [] : allLocationIds;
		setExcludedLocationIds(nextExcludedLocationIds);
		if (!selectedShotId) return;
		try {
			await updateShotPromptContext({
				data: {
					projectId,
					shotId: selectedShotId,
					settings: {
						useProjectLocations: value,
						excludedLocationIds: nextExcludedLocationIds,
					},
				},
			});
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			const msg =
				err instanceof Error
					? err.message
					: "Failed to update location prompt settings";
			setError(msg);
			toast(msg, "error");
		}
	}

	async function handleSelectedCharacterIdsChange(ids: string[]) {
		const nextExcludedCharacterIds = allCharacterIds.filter(
			(id) => !ids.includes(id),
		);
		const nextUseProjectCharacters = ids.length > 0;
		setExcludedCharacterIds(nextExcludedCharacterIds);
		setUseProjectCharacters(nextUseProjectCharacters);
		if (!selectedShotId) return;
		try {
			await updateShotPromptContext({
				data: {
					projectId,
					shotId: selectedShotId,
					settings: {
						useProjectCharacters: nextUseProjectCharacters,
						excludedCharacterIds: nextExcludedCharacterIds,
					},
				},
			});
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			const msg =
				err instanceof Error
					? err.message
					: "Failed to update character reference settings";
			setError(msg);
			toast(msg, "error");
		}
	}

	async function handleSelectedLocationIdsChange(ids: string[]) {
		const nextExcludedLocationIds = allLocationIds.filter(
			(id) => !ids.includes(id),
		);
		const nextUseProjectLocations = ids.length > 0;
		setExcludedLocationIds(nextExcludedLocationIds);
		setUseProjectLocations(nextUseProjectLocations);
		if (!selectedShotId) return;
		try {
			await updateShotPromptContext({
				data: {
					projectId,
					shotId: selectedShotId,
					settings: {
						useProjectLocations: nextUseProjectLocations,
						excludedLocationIds: nextExcludedLocationIds,
					},
				},
			});
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			const msg =
				err instanceof Error
					? err.message
					: "Failed to update location reference settings";
			setError(msg);
			toast(msg, "error");
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
		useProjectCharacters,
		setUseProjectCharacters: handleUseProjectCharactersChange,
		selectedCharacterIds: allCharacterIds.filter(
			(id) => !excludedCharacterIds.includes(id),
		),
		setSelectedCharacterIds: handleSelectedCharacterIdsChange,
		useProjectLocations,
		setUseProjectLocations: handleUseProjectLocationsChange,
		selectedLocationIds: allLocationIds.filter(
			(id) => !excludedLocationIds.includes(id),
		),
		setSelectedLocationIds: handleSelectedLocationIdsChange,
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
