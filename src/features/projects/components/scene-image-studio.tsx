import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import type { Scene } from "@/db/schema";
import { normalizeImageDefaults } from "../project-normalize";
import type {
	ImageDefaults,
	SceneAssetSummary,
	ScenePlanEntry,
	TriggerRunSummary,
} from "../project-types";
import {
	deleteAsset,
	generateImagePrompt,
	generateSceneImages,
	getSceneImageRunStatuses,
	pollSceneAssets,
	saveScenePrompt,
	selectAsset,
} from "../scene-actions";
import { StudioGallery } from "./studio/studio-gallery";
import { StudioHeader } from "./studio/studio-header";
import { StudioLeftPanel } from "./studio/studio-left-panel";

function makeDefaultPrompt(description: string, lane: "start" | "end"): string {
	if (lane === "start") {
		return `Start frame: ${description}\nFocus on the opening moment of this scene.`;
	}
	return `End frame: ${description}\nFocus on the closing moment of this scene.`;
}

function formatImageFailureToast(
	errorMessage: string | null,
	failedCount: number,
) {
	const fallback = `${failedCount} image${failedCount !== 1 ? "s" : ""} failed. Try again.`;
	if (!errorMessage) return fallback;

	const message = errorMessage.trim();
	const lower = message.toLowerCase();

	if (
		lower.includes("high demand") ||
		lower.includes("service is currently unavailable") ||
		lower.includes("temporarily unavailable") ||
		lower.includes("e003")
	) {
		return `Image generation failed because the model provider is under heavy load. Wait a moment and try again.`;
	}

	if (
		lower.includes("api key") ||
		lower.includes("authentication") ||
		lower.includes("unauthorized") ||
		lower.includes("forbidden")
	) {
		return `Image generation failed because your Replicate connection is missing or invalid. Reconnect your API key and try again.`;
	}

	if (lower.includes("timeout") || lower.includes("timed out")) {
		return `Image generation timed out before the provider returned a result. Try again, or use a simpler prompt/settings combination.`;
	}

	const shortened =
		message.length > 180 ? `${message.slice(0, 177)}...` : message;
	return `Image generation failed: ${shortened} Try again or adjust the prompt/settings.`;
}

export function SceneImageStudio({
	scene,
	sceneIndex,
	allScenes,
	allAssets,
	scenePlan,
	sceneAssets,
	onSceneChange,
	onClose,
}: {
	scene: Scene;
	sceneIndex: number;
	allScenes: Scene[];
	allAssets: SceneAssetSummary[];
	scenePlan: Map<string, ScenePlanEntry | undefined>;
	sceneAssets: SceneAssetSummary[];
	onSceneChange: (sceneId: string) => void;
	onClose: () => void;
}) {
	const router = useRouter();
	const { toast } = useToast();

	// Prompt mode state
	const [promptMode, setPromptMode] = useState<"start" | "end">("start");

	// Single prompt state — initialized from DB, fallback to generated default
	const [prompt, setPrompt] = useState(
		scene.startFramePrompt ?? makeDefaultPrompt(scene.description, "start"),
	);
	// Track the last value saved to DB to avoid spurious saves on blur
	const savedPromptRef = useRef(
		scene.startFramePrompt ?? makeDefaultPrompt(scene.description, "start"),
	);

	// Default settings from most recent asset's modelSettings, fallback to app defaults
	const lastAssetSettings = useMemo(() => {
		const sorted = [...sceneAssets]
			.filter((a) => a.status === "done" && a.modelSettings)
			.sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			);
		return sorted[0]?.modelSettings ?? null;
	}, [sceneAssets]);

	const [settingsOverrides, setSettingsOverrides] = useState<ImageDefaults>(
		normalizeImageDefaults(lastAssetSettings),
	);
	const [expandedImageId, setExpandedImageId] = useState<string | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
	const [isSelectingAssetId, setIsSelectingAssetId] = useState<string | null>(
		null,
	);
	const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isLightboxOpen, setIsLightboxOpen] = useState(false);
	const [runStatusesByAssetId, setRunStatusesByAssetId] = useState<
		Record<string, TriggerRunSummary>
	>({});
	const cancelPollingRef = useRef(false);
	const isPollingRef = useRef(false);
	const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);

	const sceneRef = useRef(scene);
	sceneRef.current = scene;

	// Reload prompt from DB when switching lanes, resetting savedPromptRef accordingly
	useEffect(() => {
		const s = sceneRef.current;
		const lanePrompt =
			promptMode === "start"
				? (s.startFramePrompt ?? makeDefaultPrompt(s.description, "start"))
				: (s.endFramePrompt ?? makeDefaultPrompt(s.description, "end"));
		setPrompt(lanePrompt);
		savedPromptRef.current = lanePrompt;
	}, [promptMode]);

	// Reset local state when scene changes (state-based navigation, no key remount)
	// biome-ignore lint/correctness/useExhaustiveDependencies: scene.id triggers full reset; other scene props and lastAssetSettings are read from refs to avoid stale closures
	useEffect(() => {
		const initialPrompt =
			scene.startFramePrompt ?? makeDefaultPrompt(scene.description, "start");
		stopPolling();
		setPrompt(initialPrompt);
		savedPromptRef.current = initialPrompt;
		setPromptMode("start");
		setSettingsOverrides(normalizeImageDefaults(lastAssetSettings));
		setExpandedImageId(null);
		setIsGenerating(false);
		setIsGeneratingPrompt(false);
		setIsSelectingAssetId(null);
		setDeletingAssetId(null);
		setError(null);
		setRunStatusesByAssetId({});
		cancelPollingRef.current = false;
	}, [scene.id]);

	// Track mounted state to guard async operations after navigation away
	const isMountedRef = useRef(true);
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	const stopPolling = useCallback(() => {
		cancelPollingRef.current = true;
		if (pollingIntervalRef.current) {
			clearInterval(pollingIntervalRef.current);
			pollingIntervalRef.current = null;
		}
		isPollingRef.current = false;
		setIsGenerating(false);
	}, []);

	useEffect(() => {
		return () => {
			stopPolling();
		};
	}, [stopPolling]);

	const startPolling = useCallback(
		(sceneId: string) => {
			if (isPollingRef.current) return;

			cancelPollingRef.current = false;
			isPollingRef.current = true;
			setIsGenerating(true);

			const POLL_TIMEOUT_MS = 5 * 60 * 1000;
			const deadline = Date.now() + POLL_TIMEOUT_MS;

			pollingIntervalRef.current = setInterval(async () => {
				if (cancelPollingRef.current || Date.now() > deadline) {
					stopPolling();
					return;
				}

				try {
					const runStatusResult = await getSceneImageRunStatuses({
						data: { sceneId },
					});
					setRunStatusesByAssetId(
						Object.fromEntries(
							runStatusResult.runs.map((run) => [run.assetId, run]),
						),
					);

					const result = await pollSceneAssets({
						data: { sceneId },
					});

					if (!result.isGenerating) {
						stopPolling();
						setRunStatusesByAssetId({});
						await router.invalidate();
						if (result.doneCount > 0) {
							toast(
								`${result.doneCount} image${result.doneCount !== 1 ? "s" : ""} ready${result.erroredCount > 0 ? ` (${result.erroredCount} failed)` : ""}`,
								result.erroredCount > 0 ? "error" : "success",
							);
						} else if (result.erroredCount > 0) {
							toast(
								formatImageFailureToast(
									result.latestErrorMessage,
									result.erroredCount,
								),
								"error",
							);
						}
					}
				} catch {
					// Transient error, keep polling
				}
			}, 3000);
		},
		[router, stopPolling, toast],
	);

	useEffect(() => {
		const hasGeneratingAssets = sceneAssets.some(
			(asset) => asset.status === "generating",
		);

		if (!hasGeneratingAssets || isPollingRef.current) return;
		startPolling(scene.id);
	}, [scene.id, sceneAssets, startPolling]);

	// Save prompt to DB on blur — only if changed since last save
	async function handlePromptBlur() {
		if (prompt === savedPromptRef.current) return;
		try {
			await saveScenePrompt({
				data: { sceneId: scene.id, lane: promptMode, prompt },
			});
			if (!isMountedRef.current) return;
			savedPromptRef.current = prompt;
			await router.invalidate();
		} catch (err) {
			if (!isMountedRef.current) return;
			const msg = err instanceof Error ? err.message : "Failed to save prompt";
			setError(msg);
		}
	}

	// Keyboard shortcuts — guard for lightbox, contentEditable, and inputs
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const target = e.target as HTMLElement;
			const tag = target.tagName;
			if (
				tag === "INPUT" ||
				tag === "TEXTAREA" ||
				tag === "SELECT" ||
				target.isContentEditable
			)
				return;
			if (isLightboxOpen) return;

			if (e.key === "Escape") {
				onClose();
			} else if (e.key === "ArrowLeft") {
				const idx = allScenes.findIndex((s) => s.id === scene.id);
				if (idx > 0) onSceneChange(allScenes[idx - 1].id);
			} else if (e.key === "ArrowRight") {
				const idx = allScenes.findIndex((s) => s.id === scene.id);
				if (idx < allScenes.length - 1) onSceneChange(allScenes[idx + 1].id);
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [scene.id, allScenes, onSceneChange, onClose, isLightboxOpen]);

	async function handleGenerate() {
		const promptOverride = prompt.trim();
		setIsGenerating(true);
		setError(null);
		try {
			const result = await generateSceneImages({
				data: {
					sceneId: scene.id,
					lane: promptMode,
					promptOverride: promptOverride || undefined,
					settingsOverrides,
				},
			});
			await router.invalidate();
			startPolling(scene.id);
			toast(
				`Queued ${result.queuedCount} image${result.queuedCount !== 1 ? "s" : ""}`,
				"success",
			);
		} catch (err) {
			const msg =
				err instanceof Error ? err.message : "Failed to generate images";
			setError(msg);
			toast(msg, "error");
		} finally {
			// Keep generating state until polling settles.
		}
	}

	async function handleGeneratePrompt() {
		setIsGeneratingPrompt(true);
		setError(null);
		try {
			const result = await generateImagePrompt({
				data: {
					sceneId: scene.id,
					lane: promptMode,
					currentPrompt: prompt.trim() || undefined,
				},
			});
			setPrompt(result.prompt);
			await router.invalidate();
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

	async function handleDeleteAsset(assetId: string) {
		setDeletingAssetId(assetId);
		setError(null);
		try {
			await deleteAsset({ data: { assetId } });
			if (expandedImageId === assetId) setExpandedImageId(null);
			await router.invalidate();
			toast("Image deleted", "success");
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to delete image";
			setError(msg);
			toast(msg, "error");
		} finally {
			setDeletingAssetId(null);
		}
	}

	async function handleSelectAsset(assetId: string) {
		setIsSelectingAssetId(assetId);
		setError(null);
		try {
			await selectAsset({ data: { assetId } });
			await router.invalidate();
			toast("Image selected", "success");
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to select image";
			setError(msg);
			toast(msg, "error");
		} finally {
			setIsSelectingAssetId(null);
		}
	}

	return (
		<div className="fixed inset-0 z-40 bg-background flex flex-col">
			<StudioHeader
				scene={scene}
				sceneIndex={sceneIndex}
				allScenes={allScenes}
				allAssets={allAssets}
				onSceneChange={onSceneChange}
				onClose={onClose}
			/>

			{/* Error bar */}
			{error && (
				<div className="px-4 py-2 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
					<span>{error}</span>
					<button
						type="button"
						onClick={() => setError(null)}
						className="ml-auto text-destructive/50 hover:text-destructive text-xs"
					>
						dismiss
					</button>
				</div>
			)}

			<div className="flex-1 flex min-h-0">
				<StudioLeftPanel
					scene={scene}
					plan={scenePlan.get(scene.id)}
					promptMode={promptMode}
					onPromptModeChange={setPromptMode}
					prompt={prompt}
					onPromptChange={setPrompt}
					onPromptBlur={handlePromptBlur}
					onGeneratePrompt={handleGeneratePrompt}
					isGeneratingPrompt={isGeneratingPrompt}
					settingsOverrides={settingsOverrides}
					onSettingsChange={setSettingsOverrides}
					isGenerating={isGenerating}
					onGenerate={handleGenerate}
				/>

				<StudioGallery
					sceneAssets={sceneAssets}
					selectingAssetId={isSelectingAssetId}
					deletingAssetId={deletingAssetId}
					onSelectAsset={handleSelectAsset}
					onDeleteAsset={handleDeleteAsset}
					onRegenerate={handleGenerate}
					expandedImageId={expandedImageId}
					onExpandImage={setExpandedImageId}
					pendingCount={
						isGenerating
							? Math.max(
									0,
									settingsOverrides.batchCount -
										sceneAssets.filter((asset) => asset.status === "generating")
											.length,
								)
							: 0
					}
					runStatusesByAssetId={runStatusesByAssetId}
					onLightboxChange={setIsLightboxOpen}
				/>
			</div>
		</div>
	);
}
