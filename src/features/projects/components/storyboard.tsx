import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	Copy,
	PanelLeft,
	PanelLeftClose,
	Play,
	Timer,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/toast";
import type { Shot } from "@/db/schema";
import { useImageStudio } from "../hooks/use-image-studio";
import { useShotVideoStudio } from "../hooks/use-shot-video-studio";
import { useVideoStudio } from "../hooks/use-video-studio";
import { getMotionGraphicPreviewImage } from "../motion-graphics";
import {
	createShotMotionGraphic,
	deleteShotMotionGraphic,
	importShotMotionGraphicToEditor,
} from "../motion-graphics-actions";
import type {
	MotionGraphicPreset,
	MotionGraphicSummary,
	ProjectSettings,
	SceneAssetSummary,
	ShotVideoSummary,
	TransitionVideoSummary,
} from "../project-types";
import { projectKeys } from "../query-keys";
import { cloneShot, deleteShot, reorderShot } from "../shot-actions";
import { beginBatchGenerationToast } from "../generation-toast";
import { generateAllTransitionVideos } from "../transition-actions";
import { isPendingVideoStatus } from "../video-status";
import { ShotContextSection } from "./studio/shot-context-section";
import { type ShotMediaTab, ShotMediaTabs } from "./studio/shot-media-tabs";
import { ShotMotionGraphicsPanel } from "./studio/shot-motion-graphics-panel";
import { ShotStudioLeftPanel } from "./studio/shot-studio-left-panel";
import { StudioGallery } from "./studio/studio-gallery";
import {
	TransitionContextSection,
	VideoControlsPanel,
} from "./studio/video-controls-panel";
import { VideoGrid } from "./studio/video-grid";

type ProjectCacheData = {
	shots: Shot[];
	[key: string]: unknown;
};


export function Storyboard({
	projectId,
	shots: storyShots,
	assets: sceneAssets,
	projectSettings,
	transitionVideos: allTransitionVideos,
	shotVideoAssets: allShotVideoAssets,
	motionGraphics: allMotionGraphics,
	initialShotId,
	initialFromShotId,
	initialToShotId,
	initialMediaTab,
}: {
	projectId: string;
	shots: Shot[];
	assets: SceneAssetSummary[];
	projectSettings: ProjectSettings | null;
	transitionVideos: TransitionVideoSummary[];
	shotVideoAssets: ShotVideoSummary[];
	motionGraphics: MotionGraphicSummary[];
	initialShotId?: string;
	initialFromShotId?: string;
	initialToShotId?: string;
	initialMediaTab?: ShotMediaTab;
}) {
	const queryClient = useQueryClient();
	const navigate = useNavigate({ from: "/projects/$projectId" });
	const { toast } = useToast();
	const [isGeneratingAllTransitions, setIsGeneratingAllTransitions] = useState(false);
	const [regenerateExisting, setRegenerateExisting] = useState(false);
	const [, setError] = useState<string | null>(null);
	const [selectedShotId, setSelectedShotIdState] = useState<string | null>(
		initialShotId ?? null,
	);
	const [selectedTransitionPair, setSelectedTransitionPairState] = useState<{
		fromShotId: string;
		toShotId: string;
	} | null>(
		initialFromShotId && initialToShotId
			? { fromShotId: initialFromShotId, toShotId: initialToShotId }
			: null,
	);

	// Tab state for shot media (images vs video)
	const [shotMediaTab, setShotMediaTab] = useState<ShotMediaTab>(
		initialMediaTab ?? "images",
	);

	// Drag-to-reorder state for shots
	const [draggedShotId, setDraggedShotId] = useState<string | null>(null);
	const [dragOverShotIndex, setDragOverShotIndex] = useState<number | null>(
		null,
	);
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

	const [cloneMenuShotId, setCloneMenuShotId] = useState<string | null>(null);

	const previewShots = useMemo(
		() => storyShots,
		[storyShots],
	);

	const assetsByShotId = useMemo(() => {
		const grouped = new Map<string, SceneAssetSummary[]>();
		for (const asset of sceneAssets) {
			if (asset.shotId) {
				const existing = grouped.get(asset.shotId) ?? [];
				existing.push(asset);
				grouped.set(asset.shotId, existing);
			}
		}
		return grouped;
	}, [sceneAssets]);

	const motionGraphicsByShotId = useMemo(() => {
		const grouped = new Map<string, MotionGraphicSummary[]>();
		for (const graphic of allMotionGraphics) {
			const existing = grouped.get(graphic.shotId) ?? [];
			existing.push(graphic);
			grouped.set(graphic.shotId, existing);
		}
		return grouped;
	}, [allMotionGraphics]);

	const [isGeneratingMotionGraphicPreset, setIsGeneratingMotionGraphicPreset] =
		useState<MotionGraphicPreset | null>(null);
	const [importingMotionGraphicId, setImportingMotionGraphicId] = useState<
		string | null
	>(null);
	const [deletingMotionGraphicId, setDeletingMotionGraphicId] = useState<
		string | null
	>(null);

	useEffect(() => {
		setSelectedShotIdState(initialShotId ?? null);
	}, [initialShotId]);

	useEffect(() => {
		setSelectedTransitionPairState(
			initialFromShotId && initialToShotId
				? { fromShotId: initialFromShotId, toShotId: initialToShotId }
				: null,
		);
	}, [initialFromShotId, initialToShotId]);

	useEffect(() => {
		setShotMediaTab(initialMediaTab ?? "images");
	}, [initialMediaTab]);

	const imageStudio = useImageStudio({
		projectId,
		selectedShotId,
		storyShots: previewShots,
		assetsByShotId,
		projectSettings,
		toast,
		setError,
	});

	const videoStudio = useVideoStudio({
		projectId,
		selectedTransitionPair,
		storyShots: previewShots,
		allTransitionVideos,
		toast,
		setError,
	});

	const shotVideoStudio = useShotVideoStudio({
		projectId,
		selectedShotId,
		storyShots: previewShots,
		assetsByShotId,
		allShotVideos: allShotVideoAssets,
		projectSettings,
		toast,
		setError,
	});

	function selectShot(id: string | null) {
		setSelectedShotIdState(id);
		setSelectedTransitionPairState(null);
		setShotMediaTab("images");
		imageStudio.resetForShot(false);
		if (id) {
			void navigate({
				search: {
					shot: id,
					from: undefined,
					to: undefined,
					mediaTab: "images",
				},
			});
		} else {
			void navigate({
				search: {
					shot: undefined,
					from: undefined,
					to: undefined,
					mediaTab: undefined,
				},
			});
		}
	}

	function selectTransition(
		pair: { fromShotId: string; toShotId: string } | null,
	) {
		setSelectedTransitionPairState(pair);
		setSelectedShotIdState(null);
		setShotMediaTab("video");
		if (pair) {
			void navigate({
				search: {
					from: pair.fromShotId,
					to: pair.toShotId,
					shot: undefined,
					mediaTab: "video",
				},
			});
		} else {
			void navigate({
				search: {
					from: undefined,
					to: undefined,
					shot: undefined,
					mediaTab: undefined,
				},
			});
		}
	}

	const handleShotMediaTabChange = useCallback(
		(tab: ShotMediaTab) => {
			setShotMediaTab(tab);
			if (!selectedShotId) return;
			void navigate({
				search: {
					shot: selectedShotId,
					from: undefined,
					to: undefined,
					mediaTab: tab,
				},
			});
		},
		[navigate, selectedShotId],
	);

	async function handleGenerateMotionGraphic(preset: MotionGraphicPreset) {
		if (!selectedShotId) return;
		setIsGeneratingMotionGraphicPreset(preset);
		try {
			await createShotMotionGraphic({
				data: {
					projectId,
					shotId: selectedShotId,
					preset,
				},
			});
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			toast(
				`Motion graphic created. ${
					preset === "lower_third"
						? "A lower-third overlay pack was created for this shot."
						: "A callout overlay pack was created for this shot."
				}`,
				"success",
			);
		} catch (err) {
			toast(
				err instanceof Error ? err.message : "Unable to create motion graphic.",
				"error",
			);
		} finally {
			setIsGeneratingMotionGraphicPreset(null);
		}
	}

	async function handleImportMotionGraphic(motionGraphicId: string) {
		setImportingMotionGraphicId(motionGraphicId);
		try {
			const result = await importShotMotionGraphicToEditor({
				data: {
					projectId,
					motionGraphicId,
				},
			});
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			toast(
				`Added to editor. Imported ${result.importedCount} text layer${result.importedCount === 1 ? "" : "s"} into the editor timeline.`,
				"success",
			);
		} catch (err) {
			toast(
				err instanceof Error ? err.message : "Unable to add graphic to editor.",
				"error",
			);
		} finally {
			setImportingMotionGraphicId(null);
		}
	}

	async function handleDeleteMotionGraphic(motionGraphicId: string) {
		setDeletingMotionGraphicId(motionGraphicId);
		try {
			await deleteShotMotionGraphic({
				data: {
					projectId,
					motionGraphicId,
				},
			});
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			toast("Motion graphic deleted.", "success");
		} catch (err) {
			toast(
				err instanceof Error ? err.message : "Unable to delete motion graphic.",
				"error",
			);
		} finally {
			setDeletingMotionGraphicId(null);
		}
	}

	const selectShotRef = useRef(selectShot);
	selectShotRef.current = selectShot;

	const hasPendingProjectMedia =
		sceneAssets.some((asset) => asset.status === "generating") ||
		allShotVideoAssets.some((video) => isPendingVideoStatus(video.status)) ||
		allTransitionVideos.some((video) => isPendingVideoStatus(video.status));

	useEffect(() => {
		if (!hasPendingProjectMedia) return;
		const interval = setInterval(() => {
			void queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		}, 2500);
		return () => clearInterval(interval);
	}, [hasPendingProjectMedia, queryClient, projectId]);

	// Keyboard shortcut: Escape closes studio
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
			if (imageStudio.isLightboxOpen) return;
			if (e.key === "Escape") {
				selectShotRef.current(null);
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [imageStudio.isLightboxOpen]);

	// Dismiss clone menu on outside click
	useEffect(() => {
		if (!cloneMenuShotId) return;
		function handleClick() {
			setCloneMenuShotId(null);
		}
		window.addEventListener("click", handleClick);
		return () => window.removeEventListener("click", handleClick);
	}, [cloneMenuShotId]);

	// Global shot index map (1-based)
	const globalShotIndex = useMemo(() => {
		const indexMap = new Map<string, number>();
		previewShots.forEach((shot, i) => {
			indexMap.set(shot.id, i + 1);
		});
		return indexMap;
	}, [previewShots]);

	async function handleGenerateAllTransitions() {
		setIsGeneratingAllTransitions(true);
		setError(null);
		try {
			const result = await generateAllTransitionVideos({
				data: { projectId, regenerateExisting },
			});
			if (result.queued > 0 && result.details?.results && result.batchId) {
				const videoIds = result.details.results.map((r) => r.transitionVideoId);
				beginBatchGenerationToast({
					id: `batch-transitions-${projectId}-${Date.now()}`,
					projectId,
					batchId: result.batchId,
					videoIds,
					skipped: result.skipped,
				});
			} else if (result.skipped > 0) {
				toast("All transitions already have videos or are missing images", "info");
			} else {
				toast(result.message, "info");
			}
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to generate transitions");
		} finally {
			setIsGeneratingAllTransitions(false);
		}
	}

	async function handleDeleteShot(shotId: string) {
		setError(null);
		try {
			await deleteShot({ data: { shotId } });
			if (selectedShotId === shotId) {
				const idx = previewShots.findIndex((s) => s.id === shotId);
				const adjacent = previewShots[idx - 1] ?? previewShots[idx + 1] ?? null;
				if (adjacent) {
					selectShot(adjacent.id);
				} else {
					selectShot(null);
				}
			}
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			toast("Shot deleted", "success");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete shot");
		}
	}

	async function handleCloneShot(
		shotId: string,
		placement: "before" | "after",
	) {
		setError(null);
		setCloneMenuShotId(null);
		try {
			await cloneShot({ data: { shotId, placement } });
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
			toast(`Shot cloned ${placement}`, "success");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to clone shot");
		}
	}

	// Shot drag-and-drop handlers (flat list)
	function handleShotDragStart(e: React.DragEvent, shotId: string) {
		setDraggedShotId(shotId);
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", shotId);
	}

	function handleShotDragOver(e: React.DragEvent, index: number) {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		if (draggedShotId) {
			setDragOverShotIndex(index);
		}
	}

	async function handleShotDrop(e: React.DragEvent, dropIndex: number) {
		e.preventDefault();
		setDragOverShotIndex(null);

		const shotId = draggedShotId;
		setDraggedShotId(null);
		if (!shotId) return;

		const draggedIndex = previewShots.findIndex((s) => s.id === shotId);
		if (draggedIndex === -1 || draggedIndex === dropIndex) return;

		let newOrder: number;
		if (dropIndex === 0) {
			newOrder = previewShots[0].order - 1;
		} else if (dropIndex >= previewShots.length) {
			newOrder = previewShots[previewShots.length - 1].order + 1;
		} else {
			const prev = previewShots[dropIndex - 1];
			const next = previewShots[dropIndex];
			newOrder = (prev.order + next.order) / 2;
		}

		setError(null);
		try {
			await reorderShot({ data: { shotId, newOrder } });
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to reorder shot");
		}
	}

	function handleShotDragEnd() {
		setDraggedShotId(null);
		setDragOverShotIndex(null);
	}

	// Determine studio mode
	const studioMode: "image" | "video" = selectedTransitionPair
		? "video"
		: "image";
	const selectedShot = selectedShotId
		? (previewShots.find((s) => s.id === selectedShotId) ?? null)
		: null;
	const fromShot = selectedTransitionPair
		? (previewShots.find((s) => s.id === selectedTransitionPair.fromShotId) ??
			null)
		: null;
	const toShot = selectedTransitionPair
		? (previewShots.find((s) => s.id === selectedTransitionPair.toShotId) ??
			null)
		: null;

	// 3-column layout for shot / transition detail
	return (
		<div className="flex h-full min-h-0 overflow-hidden">
			{/* Col 1: Storyboard sidebar — flat shot list */}
				<div className={`${sidebarCollapsed ? "w-10" : "w-[240px]"} border-r flex-shrink-0 overflow-hidden bg-card transition-all duration-200 flex flex-col`}>
					{/* Sidebar toggle */}
					<div className={`flex items-center ${sidebarCollapsed ? "justify-center" : "justify-end"} p-2 border-b`}>
						<button
							type="button"
							onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
							className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
							aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
						>
							{sidebarCollapsed ? <PanelLeft size={16} /> : <PanelLeftClose size={16} />}
						</button>
					</div>
					<div className={`flex-1 overflow-y-auto ${sidebarCollapsed ? "hidden" : ""}`}>
					<div className="p-3 space-y-2">
						{previewShots.map((shot, shotIdx) => {
							const nextShot = previewShots[shotIdx + 1] ?? null;
							const isSelectedShot = selectedShotId === shot.id;
							const isInTransition =
								selectedTransitionPair?.fromShotId === shot.id ||
								selectedTransitionPair?.toShotId === shot.id;
							const shotAssetsList = assetsByShotId.get(shot.id) ?? [];
							const hasSelectedImage = shotAssetsList.some(
								(a) => a.isSelected && a.status === "done",
							);
							const nextHasSelectedImage = nextShot
								? (assetsByShotId.get(nextShot.id) ?? []).some(
										(a) => a.isSelected && a.status === "done",
									)
								: false;
							const selectedImageUrl =
								shotAssetsList.find(
									(a) => a.isSelected && a.status === "done",
								)?.url ?? null;

							return (
								// biome-ignore lint/a11y/noStaticElementInteractions: draggable shot row; native HTML5 DnD on structural container
								<div
									key={shot.id}
									draggable
									onDragStart={(e) => handleShotDragStart(e, shot.id)}
									onDragOver={(e) => handleShotDragOver(e, shotIdx)}
									onDrop={(e) => handleShotDrop(e, shotIdx)}
									onDragEnd={handleShotDragEnd}
									className={draggedShotId === shot.id ? "opacity-50" : ""}
								>
									{/* Drop indicator */}
									{dragOverShotIndex === shotIdx &&
										draggedShotId !== shot.id && (
											<div className="h-0.5 bg-primary rounded-full mb-1" />
										)}
									{/* Shot card */}
									<div className="relative group/shot mb-1">
										<button
											type="button"
											onClick={() => {
												selectShot(shot.id);
											}}
											className={`w-full rounded-lg border p-2 text-left transition-colors ${
												isSelectedShot || isInTransition
													? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
													: "border-border hover:border-border/80 hover:bg-muted/30"
											}`}
										>
											<div className="flex items-start gap-2">
												{selectedImageUrl ? (
													<img
														src={selectedImageUrl}
														alt=""
														className="w-12 h-8 object-cover rounded flex-shrink-0"
													/>
												) : (
													<div className="w-12 h-8 bg-muted rounded flex-shrink-0" />
												)}
												<div className="flex-1 min-w-0">
													<p className="text-[10px] font-medium text-muted-foreground">
														Shot {globalShotIndex.get(shot.id)}
													</p>
													<p className="text-xs text-foreground line-clamp-2 leading-tight">
														{shot.description}
													</p>
												</div>
											</div>
										</button>

										{/* Shot action buttons */}
										<div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover/shot:opacity-100 transition-opacity">
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													setCloneMenuShotId(
														cloneMenuShotId === shot.id ? null : shot.id,
													);
												}}
												className="p-1 rounded bg-card border border-border text-muted-foreground hover:text-foreground transition-colors"
												title="Clone shot"
											>
												<Copy size={10} />
											</button>
											<AlertDialog>
												<AlertDialogTrigger asChild>
													<button
														type="button"
														onClick={(e) => e.stopPropagation()}
														className="p-1 rounded bg-card border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
														title="Delete shot"
													>
														<Trash2 size={10} />
													</button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>Delete shot?</AlertDialogTitle>
														<AlertDialogDescription>
															This will remove Shot{" "}
															{globalShotIndex.get(shot.id)} and all its
															associated assets. This action cannot be undone.
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel>Cancel</AlertDialogCancel>
														<AlertDialogAction
															onClick={() => handleDeleteShot(shot.id)}
															variant="destructive"
														>
															Delete
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
										</div>

										{/* Clone placement menu */}
										{cloneMenuShotId === shot.id && (
											<div className="absolute top-6 right-1 z-20 bg-card border border-border rounded-md shadow-lg py-1 min-w-[100px]">
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														handleCloneShot(shot.id, "before");
													}}
													className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
												>
													Insert before
												</button>
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														handleCloneShot(shot.id, "after");
													}}
													className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors"
												>
													Insert after
												</button>
											</div>
										)}
									</div>

									{/* Video connector pill between shots */}
									{nextShot && hasSelectedImage && nextHasSelectedImage && (
										<button
											type="button"
											onClick={() => {
												selectTransition({
													fromShotId: shot.id,
													toShotId: nextShot.id,
												});
											}}
											className="w-full relative flex items-center py-1.5 px-2 mb-1 group"
										>
											{/* Line */}
											<div
												className={`absolute left-2 right-2 top-1/2 -translate-y-1/2 h-px transition-colors ${
													selectedTransitionPair?.fromShotId === shot.id &&
													selectedTransitionPair?.toShotId === nextShot.id
														? "bg-primary/40"
														: "bg-border/50 group-hover:bg-border"
												}`}
											/>
											{/* Centered pill */}
											<div
												className={`relative z-10 mx-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
													selectedTransitionPair?.fromShotId === shot.id &&
													selectedTransitionPair?.toShotId === nextShot.id
														? "bg-card border-primary/40 text-primary shadow-sm"
														: "bg-card border-border/60 text-muted-foreground group-hover:border-border group-hover:text-foreground"
												}`}
											>
												<Play size={8} className="fill-current" />
												Video
											</div>
										</button>
									)}
								</div>
							);
						})}

						{/* Drop zone at end of list */}
						{draggedShotId && (
							// biome-ignore lint/a11y/noStaticElementInteractions: HTML5 DnD drop zone
							<div
								className="h-6"
								onDragOver={(e) =>
									handleShotDragOver(e, previewShots.length)
								}
								onDrop={(e) => handleShotDrop(e, previewShots.length)}
							/>
						)}
						{dragOverShotIndex !== null &&
							dragOverShotIndex >= previewShots.length && (
								<div className="h-0.5 bg-primary rounded-full mb-1" />
							)}
					</div>
					</div>
					{/* Mini-timeline showing total duration */}
					{!sidebarCollapsed && (
						<div className="flex-shrink-0 border-t px-3 py-2 bg-muted/30">
							<div className="flex items-center justify-between text-xs text-muted-foreground">
								<div className="flex items-center gap-1.5">
									<Timer size={12} />
									<span>Total</span>
								</div>
								<span className="font-mono font-medium text-foreground">
									{Math.floor(previewShots.reduce((acc, shot) => {
										const dur = shot.timestampEnd != null && shot.timestampStart != null
											? shot.timestampEnd - shot.timestampStart
											: shot.durationSec ?? 0;
										return acc + dur;
									}, 0) / 60)}:{String(Math.floor(previewShots.reduce((acc, shot) => {
										const dur = shot.timestampEnd != null && shot.timestampStart != null
											? shot.timestampEnd - shot.timestampStart
											: shot.durationSec ?? 0;
										return acc + dur;
									}, 0) % 60)).padStart(2, '0')}
								</span>
							</div>
							<div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
								<span>{previewShots.length} shots</span>
							</div>
						</div>
					)}
				</div>

				{/* Col 2: Controls panel */}
				<div className="w-[360px] border-r flex-shrink-0 flex flex-col bg-card overflow-hidden">
					{/* Context + tabs for shot image studio */}
					{studioMode === "image" && selectedShot && (
						<div className="p-4 border-b flex-shrink-0 space-y-4">
							<ShotContextSection
								shot={selectedShot}
								onDescriptionSaved={async (newDescription) => {
									queryClient.setQueryData(
										projectKeys.project(projectId),
										(oldData: ProjectCacheData | undefined) => {
											if (!oldData) return oldData;
											return {
												...oldData,
												shots: oldData.shots.map((s: Shot) =>
													s.id === selectedShot.id
														? { ...s, description: newDescription }
														: s,
												),
											};
										},
									);
								}}
							/>
						</div>
					)}

					{studioMode === "image" && selectedShot && (
						<div className="p-3 border-b flex-shrink-0">
							<ShotMediaTabs
								activeTab={shotMediaTab}
								onTabChange={handleShotMediaTabChange}
							/>
						</div>
					)}

					{studioMode === "image" &&
					selectedShot &&
					shotMediaTab === "images" ? (
						<div className="flex-1 min-h-0 overflow-hidden">
							<ShotStudioLeftPanel
								shot={selectedShot}
								prompt={imageStudio.prompt}
								onPromptChange={imageStudio.setPrompt}
								onGeneratePrompt={imageStudio.handleGeneratePrompt}
								onEnhancePrompt={imageStudio.handleEnhancePrompt}
								isEnhancingPrompt={imageStudio.isEnhancingPrompt}
								detectedPromptAssetType={imageStudio.detectedPromptAssetType}
								promptTypeSelection={imageStudio.promptTypeSelection}
								onPromptTypeSelectionChange={imageStudio.setPromptTypeSelection}
								refImageUrl={imageStudio.prevShotSelectedImageUrl}
								useRefImage={imageStudio.useRefImage}
								onUseRefImageChange={imageStudio.setUseRefImage}
								useProjectContext={imageStudio.useProjectContext}
								onUseProjectContextChange={imageStudio.setUseProjectContext}
								usePrevShotContext={imageStudio.usePrevShotContext}
								onUsePrevShotContextChange={imageStudio.setUsePrevShotContext}
								projectId={projectId}
								selectedCharacterIds={imageStudio.selectedCharacterIds}
								onSelectedCharacterIdsChange={
									imageStudio.setSelectedCharacterIds
								}
								projectCharacterCount={projectSettings?.characters?.length ?? 0}
								selectedLocationIds={imageStudio.selectedLocationIds}
								onSelectedLocationIdsChange={imageStudio.setSelectedLocationIds}
								projectLocationCount={projectSettings?.locations?.length ?? 0}
								isGeneratingPrompt={imageStudio.isGeneratingPrompt}
								settingsOverrides={imageStudio.settingsOverrides}
								onSettingsChange={imageStudio.setSettingsOverrides}
								isQueueing={imageStudio.isQueueing}
								onGenerate={imageStudio.handleGenerate}
								editingReferenceUrl={imageStudio.editingReferenceUrl}
								onClearEditingReference={() =>
									imageStudio.setEditingReferenceUrl(null)
								}
								userReferenceUrls={imageStudio.userReferenceUrls}
								isUploadingReference={imageStudio.isUploadingReference}
								onUploadReference={imageStudio.handleUploadReference}
								onRemoveReference={imageStudio.handleRemoveReference}
								hideContext
							/>
						</div>
					) : studioMode === "image" &&
						selectedShot &&
						shotMediaTab === "video" ? (
						<div className="flex-1 min-h-0 overflow-hidden">
							<VideoControlsPanel
								contextSection={null}
								videoPrompt={shotVideoStudio.videoPrompt}
								onVideoPromptChange={shotVideoStudio.setVideoPrompt}
								onGeneratePrompt={shotVideoStudio.handleGenerateVideoPrompt}
								isGeneratingPrompt={shotVideoStudio.isGeneratingVideoPrompt}
								onEnhancePrompt={shotVideoStudio.handleEnhanceVideoPrompt}
								isEnhancingPrompt={shotVideoStudio.isEnhancingVideoPrompt}
								detectedPromptAssetType={
									shotVideoStudio.detectedPromptAssetType
								}
								promptTypeSelection={shotVideoStudio.promptTypeSelection}
								onPromptTypeSelectionChange={
									shotVideoStudio.setPromptTypeSelection
								}
								videoSettings={shotVideoStudio.videoSettings}
								onVideoSettingsChange={shotVideoStudio.setVideoSettings}
								useProjectContext={shotVideoStudio.useProjectContext}
								onUseProjectContextChange={shotVideoStudio.setUseProjectContext}
								usePrevShotContext={shotVideoStudio.usePrevShotContext}
								onUsePrevShotContextChange={
									shotVideoStudio.setUsePrevShotContext
								}
								projectId={projectId}
								selectedCharacterIds={shotVideoStudio.selectedCharacterIds}
								onSelectedCharacterIdsChange={
									shotVideoStudio.setSelectedCharacterIds
								}
								projectCharacterCount={projectSettings?.characters?.length ?? 0}
								selectedLocationIds={shotVideoStudio.selectedLocationIds}
								onSelectedLocationIdsChange={
									shotVideoStudio.setSelectedLocationIds
								}
								projectLocationCount={projectSettings?.locations?.length ?? 0}
								isGenerating={shotVideoStudio.isGeneratingVideo}
								isQueueing={shotVideoStudio.isQueueingVideo}
								onGenerate={shotVideoStudio.handleGenerateVideo}
								generateButtonLabel="Generate shot video"
								generatingButtonLabel="Generating shot video..."
								availableImages={(assetsByShotId.get(selectedShot.id) ?? [])
									.filter(
										(
											a,
										): a is typeof a & {
											url: string;
										} => a.status === "done" && typeof a.url === "string",
									)
									.map((a) => ({
										id: a.id,
										url: a.url,
										isSelected: a.isSelected,
									}))}
								prevShotReferenceImage={
									shotVideoStudio.prevShotSelectedImage?.url
										? {
												id: shotVideoStudio.prevShotSelectedImage.id,
												url: shotVideoStudio.prevShotSelectedImage.url,
												isSelected:
													shotVideoStudio.prevShotSelectedImage.isSelected,
											}
										: null
								}
								usePrevShotReferenceImage={shotVideoStudio.usePrevShotImage}
								onUsePrevShotReferenceImageChange={
									shotVideoStudio.setUsePrevShotImage
								}
								referenceImageIds={shotVideoStudio.referenceImageIds}
								onReferenceImageIdsChange={shotVideoStudio.setReferenceImageIds}
							/>
						</div>
					) : studioMode === "image" &&
						selectedShot &&
						shotMediaTab === "graphics" ? (
						<div className="flex-1 min-h-0 overflow-hidden">
							<ShotMotionGraphicsPanel
								graphics={motionGraphicsByShotId.get(selectedShot.id) ?? []}
								previewImageUrl={getMotionGraphicPreviewImage(
									motionGraphicsByShotId.get(selectedShot.id) ?? [],
									assetsByShotId.get(selectedShot.id) ?? [],
								)}
								onGenerate={handleGenerateMotionGraphic}
								onImport={handleImportMotionGraphic}
								onDelete={handleDeleteMotionGraphic}
								isGeneratingPreset={isGeneratingMotionGraphicPreset}
								importingGraphicId={importingMotionGraphicId}
								deletingGraphicId={deletingMotionGraphicId}
							/>
						</div>
					) : studioMode === "video" && fromShot && toShot ? (
						<VideoControlsPanel
							contextSection={
								<TransitionContextSection
									fromShot={fromShot}
									toShot={toShot}
									fromImageUrl={
										(assetsByShotId.get(fromShot.id) ?? []).find(
											(asset) =>
												asset.isSelected &&
												asset.status === "done" &&
												asset.url,
										)?.url ?? null
									}
									toImageUrl={
										(assetsByShotId.get(toShot.id) ?? []).find(
											(asset) =>
												asset.isSelected &&
												asset.status === "done" &&
												asset.url,
										)?.url ?? null
									}
								/>
							}
							videoPrompt={videoStudio.videoPrompt}
							onVideoPromptChange={videoStudio.setVideoPrompt}
							onGeneratePrompt={videoStudio.handleGenerateVideoPrompt}
							isGeneratingPrompt={videoStudio.isGeneratingVideoPrompt}
							onEnhancePrompt={videoStudio.handleEnhanceVideoPrompt}
							isEnhancingPrompt={videoStudio.isEnhancingVideoPrompt}
							detectedPromptAssetType={videoStudio.detectedPromptAssetType}
							promptTypeSelection={videoStudio.promptTypeSelection}
							onPromptTypeSelectionChange={videoStudio.setPromptTypeSelection}
							videoSettings={videoStudio.videoSettings}
							onVideoSettingsChange={videoStudio.setVideoSettings}
							useProjectContext={videoStudio.useProjectContext}
							onUseProjectContextChange={videoStudio.setUseProjectContext}
							usePrevShotContext={videoStudio.usePrevShotContext}
							onUsePrevShotContextChange={videoStudio.setUsePrevShotContext}
							projectId={projectId}
							isGenerating={videoStudio.isGeneratingVideo}
							isQueueing={videoStudio.isQueueingVideo}
							onGenerate={videoStudio.handleGenerateVideo}
							showBatchGenerate
							onBatchGenerate={handleGenerateAllTransitions}
							isBatchGenerating={isGeneratingAllTransitions}
							batchRegenerateExisting={regenerateExisting}
							onBatchRegenerateExistingChange={setRegenerateExisting}
							batchDisabled={storyShots.length < 2}
						/>
					) : null}
				</div>

				{/* Col 3: Gallery / Video grid */}
				<div className="flex-1 min-w-0 flex flex-col overflow-hidden">
					{studioMode === "image" &&
					selectedShot &&
					shotMediaTab === "images" ? (
						(() => {
							const shotAssets = assetsByShotId.get(selectedShot.id) ?? [];
							const generatingCount = shotAssets.filter(
								(asset) => asset.status === "generating",
							).length;
							return (
								<StudioGallery
									sceneAssets={shotAssets}
									selectingAssetId={imageStudio.isSelectingAssetId}
									deletingAssetId={imageStudio.deletingAssetId}
									onSelectAsset={imageStudio.handleSelectAsset}
									onDeleteAsset={imageStudio.handleDeleteAsset}
									onRegenerate={imageStudio.handleGenerate}
									expandedImageId={imageStudio.expandedImageId}
									onExpandImage={imageStudio.setExpandedImageId}
									pendingCount={
										imageStudio.isQueueing
											? Math.max(
													0,
													imageStudio.settingsOverrides.batchCount -
														generatingCount,
												)
											: 0
									}
									runStatusesByAssetId={imageStudio.runStatusesByAssetId}
									onLightboxChange={imageStudio.setIsLightboxOpen}
									onEditImage={(_assetId, url) =>
										imageStudio.setEditingReferenceUrl(url)
									}
								/>
							);
						})()
					) : studioMode === "image" &&
						selectedShot &&
						shotMediaTab === "video" ? (
						<VideoGrid
							videos={allShotVideoAssets.filter(
								(v) => v.shotId === selectedShot.id,
							)}
							deletingVideoId={shotVideoStudio.deletingVideoId}
							onDelete={shotVideoStudio.handleDeleteShotVideo}
							onSelect={shotVideoStudio.handleSelectShotVideo}
							isGenerating={shotVideoStudio.isGeneratingVideo}
							runStatusesByVideoId={shotVideoStudio.runStatusesByVideoId}
							emptyMessage="No shot videos yet"
						/>
					) : studioMode === "video" && selectedTransitionPair ? (
						<VideoGrid
							videos={allTransitionVideos.filter(
								(tv) =>
									tv.fromShotId === selectedTransitionPair.fromShotId &&
									tv.toShotId === selectedTransitionPair.toShotId,
							)}
							deletingVideoId={videoStudio.deletingVideoId}
							onDelete={videoStudio.handleDeleteTransitionVideo}
							onSelect={videoStudio.handleSelectTransitionVideo}
							isGenerating={videoStudio.isGeneratingVideo}
							runStatusesByVideoId={videoStudio.runStatusesByVideoId}
							emptyMessage="No transition videos yet"
						/>
					) : null}
				</div>
			</div>
		);
}
