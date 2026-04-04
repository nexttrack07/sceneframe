import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
	AlertCircle,
	CheckCircle2,
	Copy,
	Download,
	Film,
	Info,
	Loader2,
	Mic,
	Play,
	Plus,
	Timer,
	Trash2,
	Users,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { Scene, Shot } from "@/db/schema";
import { useImageStudio } from "../hooks/use-image-studio";
import { useShotVideoStudio } from "../hooks/use-shot-video-studio";
import { useVideoStudio } from "../hooks/use-video-studio";
import { getMotionGraphicPreviewImage } from "../motion-graphics";
import {
	createShotMotionGraphic,
	deleteShotMotionGraphic,
	importShotMotionGraphicToEditor,
} from "../motion-graphics-actions";
import { resetWorkshop } from "../project-mutations";
import { exportProjectHandoff } from "../project-queries";
import type {
	BackgroundMusicAssetSummary,
	MotionGraphicPreset,
	MotionGraphicSummary,
	ProjectSettings,
	SceneAssetSummary,
	ScenePlanEntry,
	ScriptEditDraft,
	ScriptEditSelection,
	ShotVideoSummary,
	TransitionVideoSummary,
	VoiceoverAssetSummary,
} from "../project-types";
import { projectKeys } from "../query-keys";
import {
	addScene,
	addShot,
	cloneShot,
	deleteScene,
	deleteShot,
	reorderScene,
	reorderShot,
} from "../scene-actions";
import { isPendingVideoStatus } from "../video-status";
import { CharactersPanel } from "./characters";
import { ResetDialog } from "./reset-dialog";
import { SceneHeader } from "./scene-header";
import { SceneImageStudio } from "./scene-image-studio";
import { ShotCard } from "./shot-card";
import { StoryboardCard } from "./storyboard-card";
import { AudioGrid } from "./studio/audio-grid";
import { SceneContextSection } from "./studio/scene-context-section";
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
import { VoiceoverPanel } from "./voiceover-panel";

type ProjectCacheData = {
	shots: Shot[];
	scenes: Scene[];
	[key: string]: unknown;
};

function formatTimestamp(seconds: number | null): string {
	if (seconds == null) return "--:--";
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function Storyboard({
	projectId,
	scenes: storyScenes,
	shots: storyShots,
	assets: sceneAssets,
	projectSettings,
	scenePlan,
	transitionVideos: allTransitionVideos,
	shotVideoAssets: allShotVideoAssets,
	motionGraphics: allMotionGraphics,
	voiceovers: allVoiceovers,
	backgroundMusic: allBackgroundMusic,
	initialSceneId,
	initialShotId,
	initialFromShotId,
	initialToShotId,
	initialMediaTab,
	editSelection,
	onEditSelectionChange,
	stagedEditDraft,
	committedEditDraft,
	approvedEditHighlight,
	pendingEditApply,
}: {
	projectId: string;
	scenes: Scene[];
	shots: Shot[];
	assets: SceneAssetSummary[];
	projectSettings: ProjectSettings | null;
	scenePlan: ScenePlanEntry[];
	transitionVideos: TransitionVideoSummary[];
	shotVideoAssets: ShotVideoSummary[];
	motionGraphics: MotionGraphicSummary[];
	voiceovers: VoiceoverAssetSummary[];
	backgroundMusic: BackgroundMusicAssetSummary[];
	initialSceneId?: string;
	initialShotId?: string;
	initialFromShotId?: string;
	initialToShotId?: string;
	initialMediaTab?: ShotMediaTab;
	editSelection?: ScriptEditSelection | null;
	onEditSelectionChange?: (selection: ScriptEditSelection) => void;
	stagedEditDraft?: ScriptEditDraft | null;
	committedEditDraft?: ScriptEditDraft | null;
	approvedEditHighlight?: {
		sceneIds: string[];
		shotIds: string[];
	} | null;
	pendingEditApply?: {
		sceneIds: string[];
		shotIds: string[];
	} | null;
}) {
	const queryClient = useQueryClient();
	const navigate = useNavigate({ from: "/projects/$projectId" });
	const { toast } = useToast();
	const [isResetting, setIsResetting] = useState(false);
	const [isExporting, setIsExporting] = useState(false);
	const [isCopyingScript, setIsCopyingScript] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedSceneId, setSelectedSceneId] = useState<string | null>(
		initialSceneId ?? null,
	);
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

	// Drag-to-reorder state for scenes
	const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null);
	const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

	// Drag-to-reorder state for shots (within a scene)
	const [draggedShotId, setDraggedShotId] = useState<string | null>(null);
	const [dragOverShotIndex, setDragOverShotIndex] = useState<{
		sceneId: string;
		index: number;
	} | null>(null);

	// Add scene form state
	const [showAddForm, setShowAddForm] = useState(false);
	const [newSceneDescription, setNewSceneDescription] = useState("");
	const [isAddingScene, setIsAddingScene] = useState(false);
	const [cloneMenuShotId, setCloneMenuShotId] = useState<string | null>(null);
	const [activeHighlight, setActiveHighlight] = useState<{
		sceneIds: string[];
		shotIds: string[];
	} | null>(null);

	const hasShotsMode = storyShots.length > 0;
	const showEditSelectionControls = Boolean(onEditSelectionChange);
	const stagedSceneDescriptionMap = useMemo(
		() =>
			new Map(
				(
					stagedEditDraft?.sceneUpdates ??
					committedEditDraft?.sceneUpdates ??
					[]
				).map((update) => [update.sceneId, update.description]),
			),
		[stagedEditDraft, committedEditDraft],
	);
	const stagedShotDescriptionMap = useMemo(
		() =>
			new Map(
				(
					stagedEditDraft?.shotUpdates ??
					committedEditDraft?.shotUpdates ??
					[]
				).map((update) => [update.shotId, update.description]),
			),
		[stagedEditDraft, committedEditDraft],
	);
	const previewScenes = useMemo(
		() =>
			storyScenes.map((scene) => ({
				...scene,
				description:
					stagedSceneDescriptionMap.get(scene.id) ?? scene.description,
			})),
		[storyScenes, stagedSceneDescriptionMap],
	);
	const previewShots = useMemo(
		() =>
			storyShots.map((shot) => ({
				...shot,
				description: stagedShotDescriptionMap.get(shot.id) ?? shot.description,
			})),
		[storyShots, stagedShotDescriptionMap],
	);

	useEffect(() => {
		if (!approvedEditHighlight) return;
		setActiveHighlight(approvedEditHighlight);
		const timeout = window.setTimeout(() => {
			setActiveHighlight((current) =>
				current === approvedEditHighlight ? null : current,
			);
		}, 3500);
		return () => window.clearTimeout(timeout);
	}, [approvedEditHighlight]);

	// Collapse state: scenes with >10 shots start collapsed
	const [collapseState, setCollapseState] = useState<Map<string, boolean>>(
		() => {
			const initial = new Map<string, boolean>();
			if (hasShotsMode) {
				const shotsByScene = new Map<string, number>();
				for (const shot of previewShots) {
					shotsByScene.set(
						shot.sceneId,
						(shotsByScene.get(shot.sceneId) ?? 0) + 1,
					);
				}
				for (const scene of previewScenes) {
					const count = shotsByScene.get(scene.id) ?? 0;
					if (count > 10) initial.set(scene.id, true);
				}
			}
			return initial;
		},
	);

	const selectedScene =
		previewScenes.find((s) => s.id === selectedSceneId) ?? null;
	const planBySceneId = useMemo(
		() => new Map(previewScenes.map((scene, i) => [scene.id, scenePlan[i]])),
		[previewScenes, scenePlan],
	);
	const assetsBySceneId = useMemo(() => {
		const grouped = new Map<string, SceneAssetSummary[]>();
		for (const asset of sceneAssets) {
			const existing = grouped.get(asset.sceneId) ?? [];
			existing.push(asset);
			grouped.set(asset.sceneId, existing);
		}
		return grouped;
	}, [sceneAssets]);

	const shotsBySceneId = useMemo(() => {
		const grouped = new Map<string, Shot[]>();
		for (const shot of previewShots) {
			const existing = grouped.get(shot.sceneId) ?? [];
			existing.push(shot);
			grouped.set(shot.sceneId, existing);
		}
		return grouped;
	}, [previewShots]);

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

	const voiceoversBySceneId = useMemo(() => {
		const grouped = new Map<string, VoiceoverAssetSummary[]>();
		for (const vo of allVoiceovers) {
			const existing = grouped.get(vo.sceneId) ?? [];
			existing.push(vo);
			grouped.set(vo.sceneId, existing);
		}
		return grouped;
	}, [allVoiceovers]);

	const backgroundMusicBySceneId = useMemo(() => {
		const grouped = new Map<string, BackgroundMusicAssetSummary[]>();
		for (const bm of allBackgroundMusic) {
			const existing = grouped.get(bm.sceneId) ?? [];
			existing.push(bm);
			grouped.set(bm.sceneId, existing);
		}
		return grouped;
	}, [allBackgroundMusic]);

	const motionGraphicsByShotId = useMemo(() => {
		const grouped = new Map<string, MotionGraphicSummary[]>();
		for (const graphic of allMotionGraphics) {
			const existing = grouped.get(graphic.shotId) ?? [];
			existing.push(graphic);
			grouped.set(graphic.shotId, existing);
		}
		return grouped;
	}, [allMotionGraphics]);

	const [voiceoverSceneId, setVoiceoverSceneId] = useState<string | null>(null);
	const [showCharactersPanel, setShowCharactersPanel] = useState(false);
	const [isGeneratingMotionGraphicPreset, setIsGeneratingMotionGraphicPreset] =
		useState<MotionGraphicPreset | null>(null);
	const [importingMotionGraphicId, setImportingMotionGraphicId] = useState<
		string | null
	>(null);
	const [deletingMotionGraphicId, setDeletingMotionGraphicId] = useState<
		string | null
	>(null);

	useEffect(() => {
		setSelectedSceneId(initialSceneId ?? null);
	}, [initialSceneId]);

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
		toast,
		setError,
	});

	function selectShot(id: string | null) {
		const sceneId = id
			? (previewShots.find((shot) => shot.id === id)?.sceneId ?? null)
			: null;
		setSelectedShotIdState(id);
		setSelectedTransitionPairState(null);
		setVoiceoverSceneId(null);
		setSelectedSceneId(sceneId);
		setShotMediaTab("images");
		imageStudio.resetForShot(false);
		if (id) {
			void navigate({
				search: {
					scene: sceneId ?? undefined,
					shot: id,
					from: undefined,
					to: undefined,
					mediaTab: "images",
				},
			});
		} else {
			void navigate({
				search: {
					scene: undefined,
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
		const fromSceneId = pair
			? (previewShots.find((shot) => shot.id === pair.fromShotId)?.sceneId ??
				null)
			: null;
		setSelectedTransitionPairState(pair);
		setSelectedShotIdState(null);
		setSelectedSceneId(fromSceneId);
		setShotMediaTab("video");
		if (pair) {
			void navigate({
				search: {
					scene: fromSceneId ?? undefined,
					from: pair.fromShotId,
					to: pair.toShotId,
					shot: undefined,
					mediaTab: "video",
				},
			});
		} else {
			void navigate({
				search: {
					scene: undefined,
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
			const sceneId =
				previewShots.find((shot) => shot.id === selectedShotId)?.sceneId ??
				null;
			void navigate({
				search: {
					scene: sceneId ?? undefined,
					shot: selectedShotId,
					from: undefined,
					to: undefined,
					mediaTab: tab,
				},
			});
		},
		[navigate, previewShots, selectedShotId],
	);

	const selectScene = useCallback(
		(sceneId: string | null) => {
			setSelectedSceneId(sceneId);
			setSelectedShotIdState(null);
			setSelectedTransitionPairState(null);
			setVoiceoverSceneId(null);
			void navigate({
				search: {
					scene: sceneId ?? undefined,
					shot: undefined,
					from: undefined,
					to: undefined,
					mediaTab: undefined,
				},
			});
		},
		[navigate],
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
				selectScene(null);
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [imageStudio.isLightboxOpen, selectScene]);

	// Dismiss clone menu on outside click
	useEffect(() => {
		if (!cloneMenuShotId) return;
		function handleClick() {
			setCloneMenuShotId(null);
		}
		window.addEventListener("click", handleClick);
		return () => window.removeEventListener("click", handleClick);
	}, [cloneMenuShotId]);

	const filteredScenes = previewScenes;

	const totalDuration = hasShotsMode
		? previewShots.reduce((sum, shot) => sum + shot.durationSec, 0)
		: scenePlan.reduce((sum, scene) => sum + (scene.durationSec ?? 0), 0);

	// Progress: shot-based or scene-based
	const { readyCount, totalCount, allReady } = useMemo(() => {
		if (hasShotsMode) {
			const count = previewShots.filter((shot) => {
				const shotAssets = assetsByShotId.get(shot.id) ?? [];
				return shotAssets.some((a) => a.isSelected);
			}).length;
			return {
				readyCount: count,
				totalCount: previewShots.length,
				allReady: count === previewShots.length && previewShots.length > 0,
			};
		}
		const count = previewScenes.filter((scene) => {
			const sceneAssetList = assetsBySceneId.get(scene.id) ?? [];
			return sceneAssetList.some((a) => a.isSelected);
		}).length;
		return {
			readyCount: count,
			totalCount: previewScenes.length,
			allReady: count === previewScenes.length && previewScenes.length > 0,
		};
	}, [
		hasShotsMode,
		previewShots,
		previewScenes,
		assetsByShotId,
		assetsBySceneId,
	]);

	// Build global shot index map
	const globalShotIndex = useMemo(() => {
		const indexMap = new Map<string, number>();
		let counter = 1;
		for (const scene of previewScenes) {
			const shots = shotsBySceneId.get(scene.id) ?? [];
			for (const shot of shots) {
				indexMap.set(shot.id, counter++);
			}
		}
		return indexMap;
	}, [previewScenes, shotsBySceneId]);

	async function handleReset() {
		setIsResetting(true);
		setError(null);
		try {
			await resetWorkshop({ data: projectId });
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to restart brief and chat",
			);
		} finally {
			setIsResetting(false);
		}
	}

	async function handleExport(format: "json" | "markdown") {
		setIsExporting(true);
		setError(null);
		try {
			const result = await exportProjectHandoff({
				data: { projectId, format },
			});
			const blob = new Blob([result.content], { type: result.mimeType });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = result.filename;
			a.click();
			URL.revokeObjectURL(url);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to export handoff");
		} finally {
			setIsExporting(false);
		}
	}

	async function handleCopyScript() {
		setIsCopyingScript(true);
		setError(null);
		try {
			const result = await exportProjectHandoff({
				data: { projectId, format: "markdown" },
			});
			await navigator.clipboard.writeText(result.content);
			toast("Script copied to clipboard", "success");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to copy script");
		} finally {
			setIsCopyingScript(false);
		}
	}

	async function handleDeleteScene(sceneId: string) {
		setError(null);
		try {
			await deleteScene({ data: { sceneId } });
			if (selectedSceneId === sceneId) {
				selectScene(null);
				selectShot(null);
			}
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete scene");
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
					selectScene(null);
				}
			}
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to delete shot");
		}
	}

	async function handleAddShot(sceneId: string) {
		setError(null);
		try {
			const sceneShots = shotsBySceneId.get(sceneId) ?? [];
			const afterOrder =
				sceneShots.length > 0 ? sceneShots[sceneShots.length - 1].order : 0;
			await addShot({
				data: {
					sceneId,
					description: "New shot",
					shotType: "visual",
					afterOrder,
				},
			});
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add shot");
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

	async function handleAddScene() {
		if (!newSceneDescription.trim()) return;
		setIsAddingScene(true);
		setError(null);
		try {
			const afterOrder =
				filteredScenes.length > 0
					? filteredScenes[filteredScenes.length - 1].order
					: 0;
			await addScene({
				data: {
					projectId,
					description: newSceneDescription.trim(),
					afterOrder,
				},
			});
			setNewSceneDescription("");
			setShowAddForm(false);
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to add scene");
		} finally {
			setIsAddingScene(false);
		}
	}

	function handleDragStart(e: React.DragEvent, sceneId: string) {
		setDraggedSceneId(sceneId);
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", sceneId);
	}

	function handleDragOver(e: React.DragEvent, index: number) {
		e.preventDefault();
		e.dataTransfer.dropEffect = "move";
		if (draggedSceneId) {
			setDragOverIndex(index);
		}
	}

	async function handleDrop(e: React.DragEvent, dropIndex: number) {
		e.preventDefault();
		setDragOverIndex(null);

		const sceneId = draggedSceneId;
		setDraggedSceneId(null);
		if (!sceneId) return;

		const draggedIndex = filteredScenes.findIndex((s) => s.id === sceneId);
		if (draggedIndex === -1 || draggedIndex === dropIndex) return;

		let newOrder: number;
		if (dropIndex === 0) {
			newOrder = filteredScenes[0].order - 1;
		} else if (dropIndex >= filteredScenes.length) {
			newOrder = filteredScenes[filteredScenes.length - 1].order + 1;
		} else {
			const prev = filteredScenes[dropIndex - 1];
			const next = filteredScenes[dropIndex];
			newOrder = (prev.order + next.order) / 2;
		}

		setError(null);
		try {
			await reorderScene({ data: { sceneId, newOrder } });
			await queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			});
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to reorder scene");
		}
	}

	function handleDragEnd() {
		setDraggedSceneId(null);
		setDragOverIndex(null);
	}

	// Shot drag-and-drop handlers
	function handleShotDragStart(e: React.DragEvent, shotId: string) {
		e.stopPropagation(); // Prevent scene drag
		setDraggedShotId(shotId);
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("text/plain", shotId);
	}

	function handleShotDragOver(
		e: React.DragEvent,
		sceneId: string,
		index: number,
	) {
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer.dropEffect = "move";
		if (draggedShotId) {
			// Only allow drops within the same scene
			const draggedShot = previewShots.find((s) => s.id === draggedShotId);
			if (draggedShot?.sceneId === sceneId) {
				setDragOverShotIndex({ sceneId, index });
			}
		}
	}

	async function handleShotDrop(
		e: React.DragEvent,
		sceneId: string,
		dropIndex: number,
	) {
		e.preventDefault();
		e.stopPropagation();
		setDragOverShotIndex(null);

		const shotId = draggedShotId;
		setDraggedShotId(null);
		if (!shotId) return;

		const sceneShots = shotsBySceneId.get(sceneId) ?? [];
		const draggedIndex = sceneShots.findIndex((s) => s.id === shotId);
		if (draggedIndex === -1 || draggedIndex === dropIndex) return;

		let newOrder: number;
		if (dropIndex === 0) {
			newOrder = sceneShots[0].order - 1;
		} else if (dropIndex >= sceneShots.length) {
			newOrder = sceneShots[sceneShots.length - 1].order + 1;
		} else {
			const prev = sceneShots[dropIndex - 1];
			const next = sceneShots[dropIndex];
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

	function toggleCollapse(sceneId: string) {
		setCollapseState((prev) => {
			const next = new Map(prev);
			next.set(sceneId, !prev.get(sceneId));
			return next;
		});
	}

	function isSceneEditSelected(sceneId: string) {
		return (
			Boolean(editSelection?.project) ||
			Boolean(editSelection?.sceneIds.includes(sceneId))
		);
	}

	function isShotEditSelected(sceneId: string, shotId: string) {
		return (
			Boolean(editSelection?.project) ||
			Boolean(editSelection?.sceneIds.includes(sceneId)) ||
			Boolean(editSelection?.shotIds.includes(shotId))
		);
	}

	function toggleProjectEditSelection(checked: boolean) {
		if (!onEditSelectionChange) return;
		onEditSelectionChange({
			project: checked,
			sceneIds: checked ? [] : (editSelection?.sceneIds ?? []),
			shotIds: checked ? [] : (editSelection?.shotIds ?? []),
		});
	}

	function toggleSceneEditSelection(sceneId: string, checked: boolean) {
		if (!onEditSelectionChange) return;
		const nextSceneIds = new Set(editSelection?.sceneIds ?? []);
		const nextShotIds = new Set(editSelection?.shotIds ?? []);
		if (checked) {
			nextSceneIds.add(sceneId);
		} else {
			nextSceneIds.delete(sceneId);
		}
		onEditSelectionChange({
			project: false,
			sceneIds: [...nextSceneIds],
			shotIds: [...nextShotIds],
		});
	}

	function toggleShotEditSelection(shotId: string, checked: boolean) {
		if (!onEditSelectionChange) return;
		const nextShotIds = new Set(editSelection?.shotIds ?? []);
		if (checked) {
			nextShotIds.add(shotId);
		} else {
			nextShotIds.delete(shotId);
		}
		onEditSelectionChange({
			project: false,
			sceneIds: editSelection?.sceneIds ?? [],
			shotIds: [...nextShotIds],
		});
	}

	function getSceneTimeRange(sceneId: string): string {
		const shots = shotsBySceneId.get(sceneId) ?? [];
		if (shots.length === 0) return "";
		const first = shots[0];
		const last = shots[shots.length - 1];
		return `${formatTimestamp(first.timestampStart)}-${formatTimestamp(last.timestampEnd)}`;
	}

	// Determine studio mode
	const studioMode: "image" | "video" | "voiceover" = voiceoverSceneId
		? "voiceover"
		: selectedTransitionPair
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
	const shotParentScene = selectedShot
		? (previewScenes.find((s) => s.id === selectedShot.sceneId) ?? null)
		: null;
	const voiceoverScene = voiceoverSceneId
		? (previewScenes.find((s) => s.id === voiceoverSceneId) ?? null)
		: null;

	// 3-column layout when shot, transition, or voiceover is selected
	if (selectedShotId || selectedTransitionPair || voiceoverSceneId) {
		return (
			<div className="flex h-full min-h-0 overflow-hidden">
				{/* Col 1: Storyboard sidebar */}
				<div className="w-[240px] border-r flex-shrink-0 overflow-y-auto bg-card">
					<div className="p-3 space-y-2">
						{showEditSelectionControls && (
							<label className="flex items-center gap-2 rounded-md border bg-background px-2 py-2 text-xs text-foreground">
								<input
									type="checkbox"
									checked={Boolean(editSelection?.project)}
									onChange={(e) => toggleProjectEditSelection(e.target.checked)}
									className="h-3 w-3 accent-foreground"
								/>
								<span>Edit entire project</span>
							</label>
						)}

						{/* Scenes + shots */}
						{filteredScenes.map((scene, sceneIdx) => {
							const sceneShots = shotsBySceneId.get(scene.id) ?? [];
							const nextScene = filteredScenes[sceneIdx + 1] ?? null;
							const nextSceneFirstShot = nextScene
								? ((shotsBySceneId.get(nextScene.id) ?? [])[0] ?? null)
								: null;
							return (
								<div key={scene.id}>
									<div className="flex items-center justify-between px-1 py-1">
										<div className="flex items-center gap-2">
											{showEditSelectionControls && (
												<input
													type="checkbox"
													checked={isSceneEditSelected(scene.id)}
													onChange={(e) =>
														toggleSceneEditSelection(scene.id, e.target.checked)
													}
													className="h-3 w-3 accent-foreground"
													aria-label={`Select ${scene.title || `Scene ${previewScenes.indexOf(scene) + 1}`} for editing`}
												/>
											)}
											<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
												{scene.title ||
													`Scene ${previewScenes.indexOf(scene) + 1}`}
											</p>
										</div>
										<button
											type="button"
											onClick={() => {
												setVoiceoverSceneId(
													voiceoverSceneId === scene.id ? null : scene.id,
												);
											}}
											className={`p-0.5 rounded transition-colors ${
												voiceoverSceneId === scene.id
													? "text-primary bg-primary/10"
													: "text-muted-foreground hover:text-foreground"
											}`}
											title="Voiceover"
										>
											<Mic size={10} />
										</button>
									</div>
									{sceneShots.map((shot, shotIdx) => {
										const isLastInScene = shotIdx === sceneShots.length - 1;
										const nextShot =
											sceneShots[shotIdx + 1] ??
											(isLastInScene ? nextSceneFirstShot : null);
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
												onDragOver={(e) =>
													handleShotDragOver(e, scene.id, shotIdx)
												}
												onDrop={(e) => handleShotDrop(e, scene.id, shotIdx)}
												onDragEnd={handleShotDragEnd}
												className={
													draggedShotId === shot.id ? "opacity-50" : ""
												}
											>
												{/* Drop indicator */}
												{dragOverShotIndex?.sceneId === scene.id &&
													dragOverShotIndex.index === shotIdx &&
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
															{showEditSelectionControls && (
																<input
																	type="checkbox"
																	checked={isShotEditSelected(
																		scene.id,
																		shot.id,
																	)}
																	onChange={(e) =>
																		toggleShotEditSelection(
																			shot.id,
																			e.target.checked,
																		)
																	}
																	onClick={(e) => e.stopPropagation()}
																	className="mt-0.5 h-3 w-3 shrink-0 accent-foreground"
																	aria-label={`Select shot ${globalShotIndex.get(shot.id)} for editing`}
																/>
															)}
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
																	<AlertDialogTitle>
																		Delete shot?
																	</AlertDialogTitle>
																	<AlertDialogDescription>
																		This will remove Shot{" "}
																		{globalShotIndex.get(shot.id)} and all its
																		associated assets. This action cannot be
																		undone.
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
												{nextShot &&
													hasSelectedImage &&
													nextHasSelectedImage && (
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
																	selectedTransitionPair?.fromShotId ===
																		shot.id &&
																	selectedTransitionPair?.toShotId ===
																		nextShot.id
																		? "bg-primary/40"
																		: "bg-border/50 group-hover:bg-border"
																}`}
															/>
															{/* Centered pill */}
															<div
																className={`relative z-10 mx-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
																	selectedTransitionPair?.fromShotId ===
																		shot.id &&
																	selectedTransitionPair?.toShotId ===
																		nextShot.id
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

									{/* Drop zone at end of shots */}
									{draggedShotId && (
										// biome-ignore lint/a11y/noStaticElementInteractions: HTML5 DnD drop zone
										<div
											className="h-6"
											onDragOver={(e) =>
												handleShotDragOver(e, scene.id, sceneShots.length)
											}
											onDrop={(e) =>
												handleShotDrop(e, scene.id, sceneShots.length)
											}
										/>
									)}
									{dragOverShotIndex?.sceneId === scene.id &&
										dragOverShotIndex.index >= sceneShots.length && (
											<div className="h-0.5 bg-primary rounded-full mb-1" />
										)}
								</div>
							);
						})}
					</div>
				</div>

				{/* Col 2: Controls panel */}
				<div className="w-[360px] border-r flex-shrink-0 flex flex-col bg-card overflow-hidden">
					{/* Shared context section for shot studio (above tabs) */}
					{studioMode === "image" && selectedShot && shotParentScene && (
						<div className="p-4 border-b flex-shrink-0 space-y-4">
							<SceneContextSection
								scene={shotParentScene}
								plan={planBySceneId.get(shotParentScene.id)}
								shotCount={shotsBySceneId.get(shotParentScene.id)?.length ?? 0}
								onDescriptionSaved={async (newDescription) => {
									queryClient.setQueryData(
										projectKeys.project(projectId),
										(oldData: ProjectCacheData | undefined) => {
											if (!oldData) return oldData;
											return {
												...oldData,
												scenes: oldData.scenes.map((s: Scene) =>
													s.id === shotParentScene.id
														? { ...s, description: newDescription }
														: s,
												),
											};
										},
									);
								}}
							/>
							<ShotContextSection
								shot={selectedShot}
								parentScene={shotParentScene}
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

					{/* Tab bar for shot media types */}
					{studioMode === "image" && selectedShot && shotParentScene && (
						<div className="p-3 border-b flex-shrink-0">
							<ShotMediaTabs
								activeTab={shotMediaTab}
								onTabChange={handleShotMediaTabChange}
							/>
						</div>
					)}

					{studioMode === "image" &&
					selectedShot &&
					shotParentScene &&
					shotMediaTab === "images" ? (
						<div className="flex-1 min-h-0 overflow-hidden">
							<ShotStudioLeftPanel
								shot={selectedShot}
								parentScene={shotParentScene}
								scenePlan={planBySceneId.get(shotParentScene.id)}
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
						shotParentScene &&
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
						shotParentScene &&
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
					) : studioMode === "voiceover" && voiceoverScene ? (
						<div className="flex flex-col h-full overflow-y-auto">
							<div className="p-4 border-b">
								<div className="flex items-center justify-between">
									<h3 className="text-sm font-medium flex items-center gap-1.5">
										<Mic size={14} />
										Scene Voiceover
									</h3>
									<button
										type="button"
										onClick={() => setVoiceoverSceneId(null)}
										className="text-xs text-muted-foreground hover:text-foreground"
									>
										Close
									</button>
								</div>
								<p className="text-xs text-muted-foreground mt-1">
									{voiceoverScene.title ??
										`Scene ${previewScenes.indexOf(voiceoverScene) + 1}`}
								</p>
							</div>
							<div className="p-4 flex-1">
								<VoiceoverPanel
									scene={voiceoverScene}
									projectId={projectId}
									voiceovers={voiceoversBySceneId.get(voiceoverScene.id) ?? []}
									backgroundMusic={
										backgroundMusicBySceneId.get(voiceoverScene.id) ?? []
									}
									showAssetList={false}
									sceneVideoDurationSec={allTransitionVideos
										.filter(
											(tv) => tv.sceneId === voiceoverScene.id && tv.isSelected,
										)
										.reduce(
											(sum, tv) =>
												sum + (Number(tv.modelSettings?.duration) || 0),
											0,
										)}
								/>
							</div>
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
							isGenerating={videoStudio.isGeneratingVideo}
							isQueueing={videoStudio.isQueueingVideo}
							onGenerate={videoStudio.handleGenerateVideo}
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
					) : studioMode === "voiceover" && voiceoverScene ? (
						<AudioGrid
							projectId={projectId}
							voiceovers={voiceoversBySceneId.get(voiceoverScene.id) ?? []}
							backgroundMusic={
								backgroundMusicBySceneId.get(voiceoverScene.id) ?? []
							}
						/>
					) : null}
				</div>
			</div>
		);
	}

	return (
		<div className="h-full min-h-0 flex">
			{/* Scene list */}
			<div className="flex-1 overflow-y-auto p-6">
				<div className="flex items-center justify-between mb-4">
					<div className="space-y-1">
						<h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
							Storyboard
						</h2>
						<div className="flex items-center gap-2 flex-wrap">
							{projectSettings?.intake?.audience && (
								<Badge variant="outline">
									Audience: {projectSettings.intake.audience}
								</Badge>
							)}
							{projectSettings?.intake?.viewerAction && (
								<Badge variant="outline">
									Goal: {projectSettings.intake.viewerAction}
								</Badge>
							)}
							{totalDuration > 0 && (
								<Badge variant="outline" className="gap-1">
									<Timer size={11} /> {totalDuration}s total
								</Badge>
							)}
							{totalCount > 0 && (
								<Badge
									variant="outline"
									className={`gap-1 ${allReady ? "text-emerald-600 border-emerald-600/30" : ""}`}
								>
									<CheckCircle2 size={11} />
									{hasShotsMode
										? `${readyCount} / ${totalCount} shots have selected images`
										: `${readyCount} / ${totalCount} scenes ready`}
								</Badge>
							)}
						</div>
					</div>
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							variant={showCharactersPanel ? "default" : "outline"}
							onClick={() => setShowCharactersPanel(!showCharactersPanel)}
							className="gap-1.5"
						>
							<Users size={12} />
							Characters
							{projectSettings?.characters?.length ? (
								<Badge
									variant="secondary"
									className="ml-1 h-4 px-1 text-[10px]"
								>
									{projectSettings.characters.length}
								</Badge>
							) : null}
						</Button>
						<Link
							to="/projects/$projectId/editor"
							params={{ projectId }}
							search={{ shot: undefined, from: undefined, to: undefined }}
						>
							<Button size="sm" variant="outline" className="gap-1.5">
								<Film size={12} />
								Editor
							</Button>
						</Link>
						<Button
							size="sm"
							variant="outline"
							disabled={isExporting}
							onClick={() => handleExport("markdown")}
							className="gap-1.5"
						>
							<Download size={12} />
							Export .md
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={isExporting}
							onClick={() => handleExport("json")}
							className="gap-1.5"
						>
							<Download size={12} />
							Export .json
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={isCopyingScript}
							onClick={handleCopyScript}
							className="gap-1.5"
						>
							{isCopyingScript ? (
								<Loader2 size={12} className="animate-spin" />
							) : (
								<Copy size={12} />
							)}
							Copy script
						</Button>
						<ResetDialog isResetting={isResetting} onConfirm={handleReset} />
					</div>
				</div>

				{showEditSelectionControls && (
					<div className="mb-4 rounded-xl border bg-card px-4 py-3">
						<div className="flex items-center justify-between gap-4">
							<div>
								<p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
									Chat Edit Scope
								</p>
								<p className="text-sm text-muted-foreground">
									Select the project, a scene, or a shot before editing from the
									chat rail.
								</p>
							</div>
							<label className="flex items-center gap-2 text-sm text-foreground">
								<input
									type="checkbox"
									checked={Boolean(editSelection?.project)}
									onChange={(e) => toggleProjectEditSelection(e.target.checked)}
									className="h-4 w-4 accent-foreground"
								/>
								<span>Edit entire project</span>
							</label>
						</div>
						{stagedEditDraft && (
							<p className="mt-2 text-xs text-muted-foreground">
								Draft preview active: {stagedEditDraft.summary}
							</p>
						)}
					</div>
				)}

				{error && (
					<div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
						<AlertCircle size={14} className="shrink-0" />
						<span>{error}</span>
						<button
							type="button"
							onClick={() => setError(null)}
							className="ml-auto text-destructive/50 hover:text-destructive"
						>
							✕
						</button>
					</div>
				)}

				{showCharactersPanel && (
					<div className="mb-4 p-4 rounded-lg border bg-card">
						<CharactersPanel
							projectId={projectId}
							characters={projectSettings?.characters ?? []}
							onCharactersChanged={() => {
								queryClient.invalidateQueries({
									queryKey: projectKeys.project(projectId),
								});
							}}
						/>
					</div>
				)}

				{/* Legacy banner when no shots exist */}
				{!hasShotsMode && previewScenes.length > 0 && (
					<div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-muted/50 border border-border text-sm text-muted-foreground">
						<Info size={14} className="shrink-0" />
						<span>
							This project uses the legacy scene layout. Re-approve the script
							to generate shots.
						</span>
					</div>
				)}

				{hasShotsMode ? (
					/* ---- Shot-based layout: shots grouped under collapsible scenes ---- */
					<div className="space-y-4">
						{filteredScenes.map((scene, i) => {
							const sceneShots = shotsBySceneId.get(scene.id) ?? [];
							const isCollapsed = collapseState.get(scene.id) ?? false;

							return (
								<div key={scene.id}>
									{/* Drop indicator before this scene */}
									{dragOverIndex === i && draggedSceneId !== scene.id && (
										<div className="h-0.5 bg-primary rounded-full mb-2 mx-2 transition-all" />
									)}

									<SceneHeader
										scene={scene}
										sceneIndex={i}
										shotCount={sceneShots.length}
										timeRange={getSceneTimeRange(scene.id)}
										isCollapsed={isCollapsed}
										isEditSelected={isSceneEditSelected(scene.id)}
										isRecentlyEdited={Boolean(
											activeHighlight?.sceneIds.includes(scene.id),
										)}
										isApplyingEdit={Boolean(
											pendingEditApply?.sceneIds.includes(scene.id),
										)}
										onToggleCollapse={() => toggleCollapse(scene.id)}
										onSelectForEdit={
											showEditSelectionControls
												? () =>
														toggleSceneEditSelection(
															scene.id,
															!isSceneEditSelected(scene.id),
														)
												: undefined
										}
										onDelete={() => handleDeleteScene(scene.id)}
										onDragStart={(e) => handleDragStart(e, scene.id)}
										onDragOver={(e) => handleDragOver(e, i)}
										onDrop={(e) => handleDrop(e, i)}
										onDragEnd={handleDragEnd}
									/>

									{!isCollapsed && (
										<div className="ml-6 mt-2 space-y-2">
											{sceneShots.map((shot, shotIdx) => {
												return (
													// biome-ignore lint/a11y/noStaticElementInteractions: draggable shot row; native HTML5 DnD on structural container
													<div
														key={shot.id}
														draggable
														onDragStart={(e) => handleShotDragStart(e, shot.id)}
														onDragOver={(e) =>
															handleShotDragOver(e, scene.id, shotIdx)
														}
														onDrop={(e) => handleShotDrop(e, scene.id, shotIdx)}
														onDragEnd={handleShotDragEnd}
														className={
															draggedShotId === shot.id ? "opacity-50" : ""
														}
													>
														{/* Drop indicator before this shot */}
														{dragOverShotIndex?.sceneId === scene.id &&
															dragOverShotIndex.index === shotIdx &&
															draggedShotId !== shot.id && (
																<div className="h-0.5 bg-primary rounded-full mb-1 transition-all" />
															)}
														<ShotCard
															shot={shot}
															globalIndex={globalShotIndex.get(shot.id) ?? 0}
															assets={assetsByShotId.get(shot.id) ?? []}
															isSelected={selectedShotId === shot.id}
															isEditSelected={isShotEditSelected(
																scene.id,
																shot.id,
															)}
															isRecentlyEdited={Boolean(
																activeHighlight?.shotIds.includes(shot.id),
															)}
															isApplyingEdit={Boolean(
																pendingEditApply?.shotIds.includes(shot.id),
															)}
															onSelect={() => {
																selectShot(shot.id);
															}}
															onSelectForEdit={
																showEditSelectionControls
																	? () =>
																			toggleShotEditSelection(
																				shot.id,
																				!isShotEditSelected(scene.id, shot.id),
																			)
																	: undefined
															}
															onDelete={() => handleDeleteShot(shot.id)}
														/>
													</div>
												);
											})}
											{/* Drop zone at end of shots */}
											{draggedShotId && (
												// biome-ignore lint/a11y/noStaticElementInteractions: HTML5 DnD drop zone
												<div
													className="h-8"
													onDragOver={(e) =>
														handleShotDragOver(e, scene.id, sceneShots.length)
													}
													onDrop={(e) =>
														handleShotDrop(e, scene.id, sceneShots.length)
													}
												/>
											)}
											{/* Drop indicator at end */}
											{dragOverShotIndex?.sceneId === scene.id &&
												dragOverShotIndex.index >= sceneShots.length && (
													<div className="h-0.5 bg-primary rounded-full mb-1 transition-all" />
												)}

											{/* Add Shot button */}
											<button
												type="button"
												onClick={() => handleAddShot(scene.id)}
												className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md hover:border-border/80 transition-colors"
											>
												<Plus size={12} />
												Add Shot
											</button>
										</div>
									)}
								</div>
							);
						})}

						{/* Drop indicator at the end */}
						{dragOverIndex !== null &&
							dragOverIndex >= filteredScenes.length && (
								<div className="h-0.5 bg-primary rounded-full mx-2 transition-all" />
							)}
						{/* Drop zone at the end of the list */}
						{draggedSceneId && (
							// biome-ignore lint/a11y/noStaticElementInteractions: HTML5 DnD drop zone target — not a user-interactive element
							<div
								className="h-12"
								onDragOver={(e) => {
									e.preventDefault();
									e.dataTransfer.dropEffect = "move";
									setDragOverIndex(filteredScenes.length);
								}}
								onDrop={(e) => handleDrop(e, filteredScenes.length)}
							/>
						)}
					</div>
				) : (
					/* ---- Legacy scene-card layout ---- */
					<div className="grid gap-3">
						{filteredScenes.map((scene, i) => (
							<div key={scene.id}>
								{/* Drop indicator before this card */}
								{dragOverIndex === i && draggedSceneId !== scene.id && (
									<div className="h-0.5 bg-primary rounded-full mb-2 mx-2 transition-all" />
								)}
								<StoryboardCard
									scene={scene}
									index={i}
									plan={planBySceneId.get(scene.id)}
									imageAssets={assetsBySceneId.get(scene.id) ?? []}
									isSelected={scene.id === selectedSceneId}
									isDragging={draggedSceneId === scene.id}
									onSelect={() =>
										selectScene(scene.id === selectedSceneId ? null : scene.id)
									}
									onDelete={() => handleDeleteScene(scene.id)}
									onDragStart={(e) => handleDragStart(e, scene.id)}
									onDragOver={(e) => handleDragOver(e, i)}
									onDrop={(e) => handleDrop(e, i)}
									onDragEnd={handleDragEnd}
								/>
							</div>
						))}
						{/* Drop indicator at the end */}
						{dragOverIndex !== null &&
							dragOverIndex >= filteredScenes.length && (
								<div className="h-0.5 bg-primary rounded-full mx-2 transition-all" />
							)}
						{/* Drop zone at the end of the list */}
						{draggedSceneId && (
							// biome-ignore lint/a11y/noStaticElementInteractions: HTML5 DnD drop zone target — not a user-interactive element
							<div
								className="h-12"
								onDragOver={(e) => {
									e.preventDefault();
									e.dataTransfer.dropEffect = "move";
									setDragOverIndex(filteredScenes.length);
								}}
								onDrop={(e) => handleDrop(e, filteredScenes.length)}
							/>
						)}
					</div>
				)}

				{/* Add Scene */}
				<div className="mt-4">
					{showAddForm ? (
						<div className="bg-card rounded-xl border-2 border-dashed border-border p-4 space-y-3">
							<textarea
								value={newSceneDescription}
								onChange={(e) => setNewSceneDescription(e.target.value)}
								placeholder="Describe the new scene..."
								rows={3}
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
							/>
							<div className="flex items-center gap-2">
								<Button
									size="sm"
									disabled={isAddingScene || !newSceneDescription.trim()}
									onClick={handleAddScene}
									className="gap-1.5"
								>
									<Plus size={12} />
									{isAddingScene ? "Adding..." : "Add"}
								</Button>
								<Button
									size="sm"
									variant="ghost"
									disabled={isAddingScene}
									onClick={() => {
										setShowAddForm(false);
										setNewSceneDescription("");
									}}
								>
									Cancel
								</Button>
							</div>
						</div>
					) : (
						<Button
							variant="outline"
							className="w-full border-dashed gap-1.5"
							onClick={() => setShowAddForm(true)}
						>
							<Plus size={14} />
							Add Scene
						</Button>
					)}
				</div>
			</div>

			{/* Full-screen scene studio (legacy — no shots) */}
			{selectedScene && !selectedShotId && (
				<SceneImageStudio
					key={selectedScene.id}
					scene={selectedScene}
					sceneIndex={previewScenes.indexOf(selectedScene)}
					allScenes={previewScenes}
					allAssets={sceneAssets}
					scenePlan={planBySceneId}
					sceneAssets={assetsBySceneId.get(selectedScene.id) ?? []}
					onSceneChange={selectScene}
					onClose={() => {
						selectScene(null);
						selectShot(null);
					}}
				/>
			)}
		</div>
	);
}
