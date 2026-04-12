import type { Shot } from "@/db/schema";
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

export function createEditorAssetLabeler({
	shots,
}: {
	shots: Shot[];
}) {
	const shotOrderById = new Map<string, number>();
	shots
		.slice()
		.sort((a, b) => a.order - b.order)
		.forEach((shot, index) => {
			shotOrderById.set(shot.id, index + 1);
		});

	const shotById = new Map(shots.map((shot) => [shot.id, shot] as const));

	const getShotLabel = (shotId: string): string => {
		const shotOrder = shotOrderById.get(shotId) ?? 1;
		return `Shot ${padOrder(shotOrder)}`;
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

			// Asset not tied to a specific shot — use a generic label
			const projectAssets = allAssets.filter(
				(candidate) => candidate.shotId == null && candidate.type === asset.type,
			);
			return `Image ${padOrder(countWithin(projectAssets, asset.id))}`;
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
			// voiceovers are project-level; label by position
			return `Voiceover ${padOrder(countWithin(allVoiceovers, audio.id))}`;
		},
		backgroundMusicLabel(
			audio: BackgroundMusicAssetSummary,
			allTracks: BackgroundMusicAssetSummary[],
		) {
			return `Music ${padOrder(countWithin(allTracks, audio.id))}`;
		},
		// Keep shotById accessible for consumers that need it
		shotById,
	};
}
