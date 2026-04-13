import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shot } from "@/db/schema";
import { updateShotPromptContext } from "../character-actions";
import { buildShotLabelMap, formatShotLocation } from "../generation-labels";
import {
	beginGenerationToast,
	resolveGenerationToast,
	updateGenerationToast,
} from "../generation-toast";
import { getImageModelDefinition } from "../image-models";
import {
	readImageSettings,
	writeImageSettings,
} from "../image-settings-storage";
import {
	applyProjectAspectRatioToImageDefaults,
	getPreferredAspectRatioFromImageDefaults,
	persistProjectAspectRatio,
} from "../project-aspect-ratio";
import { normalizeImageDefaults } from "../project-normalize";
import type {
	ImageDefaults,
	ProjectSettings,
	PromptAssetType,
	PromptAssetTypeSelection,
	SceneAssetSummary,
	TriggerRunSummary,
} from "../project-types";
import { projectKeys } from "../query-keys";
import { deleteAsset } from "../audio-actions";
import {
	enhanceShotImagePrompt,
	generateShotImagePrompt,
	generateShotImages,
	getShotImageRunStatuses,
	pollShotAssets,
	selectShotAsset,
	uploadShotReferenceImage,
} from "../shot-actions";

type ToastFn = (message: string, variant: "success" | "error") => void;

export function useImageStudio({
	projectId,
	selectedShotId,
	storyShots,
	assetsByShotId,
	projectSettings,
	toast,
	setError,
}: {
	projectId: string;
	selectedShotId: string | null;
	storyShots: Shot[];
	assetsByShotId: Map<string, SceneAssetSummary[]>;
	projectSettings: ProjectSettings | null;
	toast: ToastFn;
	setError: (msg: string | null) => void;
}) {
	const queryClient = useQueryClient();
	const storyShotsRef = useRef(storyShots);
	const assetsByShotIdRef = useRef(assetsByShotId);
	const trackedBatchMetaRef = useRef(
		new Map<string, { title: string; location: string }>(),
	);
	const cancelPollingRef = useRef(false);
	const isPollingRef = useRef(false);
	const completedRunIdsRef = useRef<Set<string>>(new Set());
	const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);
	storyShotsRef.current = storyShots;
	assetsByShotIdRef.current = assetsByShotId;
	const [prompt, setPrompt] = useState("");
	const [settingsOverrides, setSettingsOverridesState] =
		useState<ImageDefaults>(normalizeImageDefaults(null));
	const [isQueueing, setIsQueueing] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
	const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
	const [isSelectingAssetId, setIsSelectingAssetId] = useState<string | null>(
		null,
	);
	const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
	const [expandedImageId, setExpandedImageId] = useState<string | null>(null);
	const [isLightboxOpen, setIsLightboxOpen] = useState(false);
	const [useRefImage, setUseRefImage] = useState(true);
	const [useProjectContext, setUseProjectContext] = useState(true);
	const [usePrevShotContext, setUsePrevShotContext] = useState(true);
	const [useProjectCharacters, setUseProjectCharacters] = useState(true);
	const [useProjectLocations, setUseProjectLocations] = useState(true);
	const [excludedCharacterIds, setExcludedCharacterIds] = useState<string[]>(
		[],
	);
	const [excludedLocationIds, setExcludedLocationIds] = useState<string[]>([]);
	const [editingReferenceUrl, setEditingReferenceUrl] = useState<string | null>(
		null,
	);
	const [userReferenceUrls, setUserReferenceUrls] = useState<string[]>([]);
	const [isUploadingReference, setIsUploadingReference] = useState(false);
	const [detectedPromptAssetType, setDetectedPromptAssetType] =
		useState<PromptAssetType | null>(null);
	const [promptTypeSelection, setPromptTypeSelection] =
		useState<PromptAssetTypeSelection>("auto");
	const [runStatusesByAssetId, setRunStatusesByAssetId] = useState<
		Record<string, TriggerRunSummary>
	>({});
	const shotLabelMap = buildShotLabelMap(storyShots);
	const allCharacterIds = useMemo(
		() => projectSettings?.characters?.map((character) => character.id) ?? [],
		[projectSettings?.characters],
	);
	const allLocationIds = useMemo(
		() => projectSettings?.locations?.map((location) => location.id) ?? [],
		[projectSettings?.locations],
	);
	const setSettingsOverrides = useCallback(
		(next: ImageDefaults) => {
			const explicitAspectRatio =
				getPreferredAspectRatioFromImageDefaults(next);
			if (explicitAspectRatio) {
				persistProjectAspectRatio(projectId, explicitAspectRatio);
			}
			setSettingsOverridesState(
				applyProjectAspectRatioToImageDefaults(projectId, next),
			);
		},
		[projectId],
	);
	const pollingParamsRef = useRef({
		projectId,
		queryClient,
	});
	pollingParamsRef.current = {
		projectId,
		queryClient,
	};

	const stopPolling = useCallback(() => {
		cancelPollingRef.current = true;
		if (pollingIntervalRef.current) {
			clearInterval(pollingIntervalRef.current);
			pollingIntervalRef.current = null;
		}
		isPollingRef.current = false;
		setIsGenerating(false);
	}, []);

	const startPolling = useCallback(
		(shotId: string) => {
			if (isPollingRef.current) return;

			cancelPollingRef.current = false;
			isPollingRef.current = true;
			setIsGenerating(true);

			const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
			const deadline = Date.now() + POLL_TIMEOUT_MS;

			pollingIntervalRef.current = setInterval(async () => {
				if (cancelPollingRef.current || Date.now() > deadline) {
					stopPolling();
					return;
				}

				try {
					const runStatusResult = await getShotImageRunStatuses({
						data: { shotId },
					});
					const newlyCompletedRuns = runStatusResult.runs.filter((run) => {
						if (run.status !== "completed" || !run.jobId) return false;
						if (completedRunIdsRef.current.has(run.jobId)) return false;
						completedRunIdsRef.current.add(run.jobId);
						return true;
					});
					setRunStatusesByAssetId(
						Object.fromEntries(
							runStatusResult.runs.map((run) => [run.assetId, run]),
						),
					);
					if (newlyCompletedRuns.length > 0) {
						await pollingParamsRef.current.queryClient.invalidateQueries({
							queryKey: projectKeys.project(pollingParamsRef.current.projectId),
							refetchType: "active",
						});
					}

					const result = await pollShotAssets({
						data: { shotId },
					});

					if (!result.isGenerating) {
						stopPolling();
						setRunStatusesByAssetId({});
						await pollingParamsRef.current.queryClient.invalidateQueries({
							queryKey: projectKeys.project(pollingParamsRef.current.projectId),
						});
					}
				} catch {
					// Transient error, keep polling
				}
			}, 3000);
		},
		[stopPolling],
	);

	// Expose reset for use when selecting a shot
	const resetForShot = (useRefImageReset = true) => {
		setUseRefImage(useRefImageReset);
		setUseProjectContext(true);
		setUsePrevShotContext(true);
		setUseProjectCharacters(true);
		setUseProjectLocations(true);
		setExcludedCharacterIds([]);
		setExcludedLocationIds([]);
	};

	// Reset image studio state when selected shot changes
	useEffect(() => {
		if (!selectedShotId) {
			stopPolling();
			return;
		}
		stopPolling();
		const shot = storyShotsRef.current.find((s) => s.id === selectedShotId);
		const shotAssets = assetsByShotIdRef.current.get(selectedShotId) ?? [];
		const lastAssetSettings =
			[...shotAssets]
				.filter((a) => a.status === "done" && a.modelSettings)
				.sort(
					(a, b) =>
						new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
				)[0]?.modelSettings ?? null;
		const persistedImageSettings = readImageSettings();

		// Check if there are any generating assets for this shot
		const hasGeneratingAssets = shotAssets.some(
			(a) => a.status === "generating",
		);

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
		setPrompt(shot?.imagePrompt ?? "");
		setSettingsOverridesState(
			applyProjectAspectRatioToImageDefaults(
				projectId,
				persistedImageSettings ?? normalizeImageDefaults(lastAssetSettings),
			),
		);
		setExpandedImageId(null);
		setIsQueueing(false);
		setIsGenerating(hasGeneratingAssets); // Keep true if assets are generating
		setIsGeneratingPrompt(false);
		setIsEnhancingPrompt(false);
		setIsSelectingAssetId(null);
		setDeletingAssetId(null);
		setEditingReferenceUrl(null);
		setUserReferenceUrls([]);
		setIsUploadingReference(false);
		setDetectedPromptAssetType(null);
		setPromptTypeSelection("auto");
		setRunStatusesByAssetId({});
		completedRunIdsRef.current.clear();
		cancelPollingRef.current = false;
	}, [
		selectedShotId,
		stopPolling,
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

	useEffect(() => {
		writeImageSettings(settingsOverrides);
	}, [settingsOverrides]);

	// Auto-resume polling for generating assets when switching to a shot
	useEffect(() => {
		if (!selectedShotId) return;
		const shotAssets = assetsByShotIdRef.current.get(selectedShotId) ?? [];
		const hasGeneratingAssets = shotAssets.some(
			(a) => a.status === "generating",
		);

		if (!hasGeneratingAssets || isPollingRef.current) return;
		startPolling(selectedShotId);
	}, [selectedShotId, startPolling]);

	useEffect(() => stopPolling, [stopPolling]);

	// Previous shot for reference image
	const selectedShot = selectedShotId
		? (storyShots.find((s) => s.id === selectedShotId) ?? null)
		: null;
	const prevShot = selectedShot
		? (() => {
				const idx = storyShots.findIndex((s) => s.id === selectedShot.id);
				return idx > 0 ? storyShots[idx - 1] : null;
			})()
		: null;
	const prevShotSelectedImageUrl = prevShot
		? ((assetsByShotId.get(prevShot.id) ?? []).find(
				(a) => a.isSelected && a.status === "done",
			)?.url ?? null)
		: null;

	useEffect(() => {
		if (!selectedShotId) {
			setUseRefImage(false);
			return;
		}

		setUseRefImage(Boolean(prevShotSelectedImageUrl));
	}, [selectedShotId, prevShotSelectedImageUrl]);

	useEffect(() => {
		for (const [batchId, meta] of trackedBatchMetaRef.current.entries()) {
			const batchAssets = Array.from(assetsByShotId.values())
				.flat()
				.filter((asset) => asset.batchId === batchId);
			if (batchAssets.length === 0) continue;

			const generatingCount = batchAssets.filter(
				(asset) => asset.status === "generating",
			).length;
			const doneCount = batchAssets.filter(
				(asset) => asset.status === "done",
			).length;
			const erroredAssets = batchAssets.filter(
				(asset) => asset.status === "error",
			);

			if (generatingCount > 0) {
				updateGenerationToast(batchId, {
					status: "Generating",
					message: meta.location,
				});
				continue;
			}

			if (doneCount > 0 && erroredAssets.length === 0) {
				resolveGenerationToast(batchId, {
					status: "Ready",
					message: `${meta.location} · ${doneCount} image${doneCount === 1 ? "" : "s"}`,
				});
				trackedBatchMetaRef.current.delete(batchId);
				continue;
			}

			if (erroredAssets.length > 0) {
				resolveGenerationToast(batchId, {
					status: doneCount > 0 ? "Partial failure" : "Failed",
					message:
						erroredAssets[0]?.errorMessage ??
						`${meta.location} · ${erroredAssets.length} failed`,
					error: true,
				});
				trackedBatchMetaRef.current.delete(batchId);
			}
		}
	}, [assetsByShotId]);

	async function handleGenerate() {
		if (!selectedShotId) return;
		const promptOverride = prompt.trim();
		setIsQueueing(true);
		setError(null);
		try {
			const result = await generateShotImages({
				data: {
					shotId: selectedShotId,
					lane: "start",
					promptOverride: promptOverride || undefined,
					settingsOverrides,
					useProjectCharacters,
					excludedCharacterIds,
					useProjectLocations,
					excludedLocationIds,
					referenceImageUrls: editingReferenceUrl
						? [editingReferenceUrl]
						: [
								...(useRefImage && prevShotSelectedImageUrl
									? [prevShotSelectedImageUrl]
									: []),
								...userReferenceUrls,
							],
				},
			});
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			const label = shotLabelMap.get(selectedShotId);
			const location = label ? formatShotLocation(label) : "Selected shot";
			trackedBatchMetaRef.current.set(result.batchId, {
				title: "Generating image",
				location,
			});
			const href = `/projects/${projectId}?shot=${selectedShotId}&mediaTab=images`;
			const modelDef = getImageModelDefinition(settingsOverrides.model);
			const aspectRatio = settingsOverrides.modelOptions.aspect_ratio as string | undefined;
			beginGenerationToast({
				id: result.batchId,
				title: "Generating image",
				location,
				medium: "image",
				status: "Queued",
				href,
				metadata: {
					model: modelDef.label,
					aspectRatio: aspectRatio ?? undefined,
				},
			});
			startPolling(selectedShotId);
			const wasEditing = !!editingReferenceUrl;
			if (wasEditing) setEditingReferenceUrl(null);
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to generate images";
			setError(msg);
			toast(msg, "error");
		} finally {
			setIsQueueing(false);
		}
	}

	async function handleGeneratePrompt() {
		if (!selectedShotId) return;
		const effectiveReferenceImageUrls = editingReferenceUrl
			? [editingReferenceUrl]
			: [
					...(useRefImage && prevShotSelectedImageUrl
						? [prevShotSelectedImageUrl]
						: []),
					...userReferenceUrls,
				];
		setIsGeneratingPrompt(true);
		setError(null);
		try {
			const result = await generateShotImagePrompt({
				data: {
					shotId: selectedShotId,
					useProjectContext,
					usePrevShotContext,
					useProjectCharacters,
					useProjectLocations,
					referenceImageUrls: effectiveReferenceImageUrls,
					assetTypeOverride: promptTypeSelection,
				},
			});
			setPrompt(result.prompt);
			setDetectedPromptAssetType(result.assetType);
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			toast("Prompt generated", "success");
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to generate prompt";
			setError(msg);
			toast(msg, "error");
		} finally {
			setIsGeneratingPrompt(false);
		}
	}

	async function handleEnhancePrompt() {
		if (!selectedShotId || !prompt.trim()) return;
		const effectiveReferenceImageUrls = editingReferenceUrl
			? [editingReferenceUrl]
			: [
					...(useRefImage && prevShotSelectedImageUrl
						? [prevShotSelectedImageUrl]
						: []),
					...userReferenceUrls,
				];
		setIsEnhancingPrompt(true);
		setError(null);
		try {
			const result = await enhanceShotImagePrompt({
				data: {
					shotId: selectedShotId,
					userPrompt: prompt,
					useProjectContext,
					usePrevShotContext,
					useProjectCharacters,
					useProjectLocations,
					referenceImageUrls: effectiveReferenceImageUrls,
					assetTypeOverride: promptTypeSelection,
				},
			});
			setPrompt(result.prompt);
			setDetectedPromptAssetType(result.assetType);
			toast("Prompt enhanced", "success");
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to enhance prompt";
			setError(msg);
			toast(msg, "error");
		} finally {
			setIsEnhancingPrompt(false);
		}
	}

	async function handleSelectAsset(assetId: string) {
		setIsSelectingAssetId(assetId);
		setError(null);
		try {
			await selectShotAsset({ data: { assetId } });
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			toast("Image selected", "success");
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to select image";
			setError(msg);
			toast(msg, "error");
		} finally {
			setIsSelectingAssetId(null);
		}
	}

	async function handleDeleteAsset(assetId: string) {
		setDeletingAssetId(assetId);
		setError(null);
		try {
			await deleteAsset({ data: { assetId } });
			if (expandedImageId === assetId) setExpandedImageId(null);
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			toast("Image deleted", "success");
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to delete image";
			setError(msg);
			toast(msg, "error");
		} finally {
			setDeletingAssetId(null);
		}
	}

	async function handleUploadReference(file: File) {
		if (!selectedShotId) return;
		if (userReferenceUrls.length >= 4) {
			toast("Maximum 4 reference images allowed", "error");
			return;
		}

		setIsUploadingReference(true);
		setError(null);
		try {
			// Convert file to base64
			const reader = new FileReader();
			const base64Promise = new Promise<string>((resolve, reject) => {
				reader.onload = () => resolve(reader.result as string);
				reader.onerror = reject;
			});
			reader.readAsDataURL(file);
			const fileBase64 = await base64Promise;

			const result = await uploadShotReferenceImage({
				data: {
					shotId: selectedShotId,
					fileBase64,
					fileName: file.name,
				},
			});

			setUserReferenceUrls((prev) => [...prev, result.url]);
			toast("Reference image added", "success");
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to upload reference image";
			setError(msg);
			toast(msg, "error");
		} finally {
			setIsUploadingReference(false);
		}
	}

	function handleRemoveReference(url: string) {
		setUserReferenceUrls((prev) => prev.filter((u) => u !== url));
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
		prompt,
		setPrompt,
		settingsOverrides,
		setSettingsOverrides,
		isQueueing,
		isGenerating,
		isGeneratingPrompt,
		isEnhancingPrompt,
		isSelectingAssetId,
		deletingAssetId,
		expandedImageId,
		setExpandedImageId,
		isLightboxOpen,
		setIsLightboxOpen,
		useRefImage,
		setUseRefImage,
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
		prevShotSelectedImageUrl,
		runStatusesByAssetId,
		editingReferenceUrl,
		setEditingReferenceUrl,
		userReferenceUrls,
		isUploadingReference,
		detectedPromptAssetType,
		promptTypeSelection,
		setPromptTypeSelection,
		handleUploadReference,
		handleRemoveReference,
		resetForShot,
		handleGenerate,
		handleGeneratePrompt,
		handleEnhancePrompt,
		handleSelectAsset,
		handleDeleteAsset,
	};
}
