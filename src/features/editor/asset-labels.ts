import type { Scene, Shot } from "@/db/schema";
import type {
	BackgroundMusicAssetSummary,
	SceneAssetSummary,
	ShotVideoSummary,
	TransitionVideoSummary,
	VoiceoverAssetSummary,
} from "@/features/projects/project-types";

function padOrder(order: number): string {
	return String(order).padStart(2, "0");
}

function sceneDisplayLabel(scene: Scene, index: number): string {
	const title = scene.title?.trim();
	return title ? `Scene ${index + 1}: ${title}` : `Scene ${index + 1}`;
}

export function createEditorAssetLabeler({
	scenes,
	shots,
}: {
	scenes: Scene[];
	shots: Shot[];
}) {
	const sceneById = new Map(scenes.map((scene) => [scene.id, scene] as const));
	const sceneIndexById = new Map(
		scenes.map((scene, index) => [scene.id, index]),
	);
	const shotsBySceneId = new Map<string, Shot[]>();

	for (const shot of shots) {
		const existing = shotsBySceneId.get(shot.sceneId) ?? [];
		existing.push(shot);
		shotsBySceneId.set(shot.sceneId, existing);
	}

	const shotOrderById = new Map<string, number>();
	for (const sceneShots of shotsBySceneId.values()) {
		sceneShots
			.slice()
			.sort((a, b) => a.order - b.order)
			.forEach((shot, index) => {
				shotOrderById.set(shot.id, index + 1);
			});
	}

	const shotById = new Map(shots.map((shot) => [shot.id, shot] as const));

	const getSceneLabel = (sceneId: string): string => {
		const scene = sceneById.get(sceneId);
		const sceneIndex = sceneIndexById.get(sceneId) ?? 0;
		return scene
			? sceneDisplayLabel(scene, sceneIndex)
			: `Scene ${sceneIndex + 1}`;
	};

	const getShotLabel = (shotId: string): string => {
		const shot = shotById.get(shotId);
		if (!shot) return "Shot";
		const shotOrder = shotOrderById.get(shotId) ?? 1;
		return `${getSceneLabel(shot.sceneId)} · Shot ${padOrder(shotOrder)}`;
	};

	const countWithin = <T extends { id: string }>(
		items: T[],
		itemId: string,
	): number => {
		const index = items.findIndex((item) => item.id === itemId);
		return index >= 0 ? index + 1 : 1;
	};

	return {
		fileName(label: string, extension: string) {
			return `${label
				.replace(/[^\w.-]+/g, "-")
				.replace(/-+/g, "-")
				.replace(/^-|-$/g, "")}.${extension}`;
		},
		imageLabel(asset: SceneAssetSummary, allAssets: SceneAssetSummary[]) {
			if (asset.shotId) {
				const shotAssets = allAssets.filter(
					(candidate) =>
						candidate.shotId === asset.shotId && candidate.type === asset.type,
				);
				return `${getShotLabel(asset.shotId)} · Image ${padOrder(countWithin(shotAssets, asset.id))}`;
			}

			const sceneAssets = allAssets.filter(
				(candidate) =>
					candidate.sceneId === asset.sceneId &&
					candidate.shotId == null &&
					candidate.type === asset.type,
			);
			return `${getSceneLabel(asset.sceneId)} · Image ${padOrder(countWithin(sceneAssets, asset.id))}`;
		},
		shotVideoLabel(video: ShotVideoSummary, allVideos: ShotVideoSummary[]) {
			const shotVideos = allVideos.filter(
				(candidate) => candidate.shotId === video.shotId,
			);
			return `${getShotLabel(video.shotId)} · Video ${padOrder(countWithin(shotVideos, video.id))}`;
		},
		transitionVideoLabel(
			video: TransitionVideoSummary,
			allVideos: TransitionVideoSummary[],
		) {
			const pairVideos = allVideos.filter(
				(candidate) =>
					candidate.fromShotId === video.fromShotId &&
					candidate.toShotId === video.toShotId,
			);
			const toShotOrder = shotOrderById.get(video.toShotId) ?? 1;
			return `${getShotLabel(video.fromShotId)} → Shot ${padOrder(toShotOrder)} · Transition ${padOrder(countWithin(pairVideos, video.id))}`;
		},
		voiceoverLabel(
			audio: VoiceoverAssetSummary,
			allVoiceovers: VoiceoverAssetSummary[],
		) {
			const sceneVoiceovers = allVoiceovers.filter(
				(candidate) => candidate.sceneId === audio.sceneId,
			);
			return `${getSceneLabel(audio.sceneId)} · Voiceover ${padOrder(countWithin(sceneVoiceovers, audio.id))}`;
		},
		backgroundMusicLabel(
			audio: BackgroundMusicAssetSummary,
			allTracks: BackgroundMusicAssetSummary[],
		) {
			const sceneTracks = allTracks.filter(
				(candidate) => candidate.sceneId === audio.sceneId,
			);
			return `${getSceneLabel(audio.sceneId)} · Music ${padOrder(countWithin(sceneTracks, audio.id))}`;
		},
	};
}
