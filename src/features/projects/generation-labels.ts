import type { Shot } from "@/db/schema";

export function buildShotLabelMap(storyShots: Pick<Shot, "id" | "sceneId">[]) {
	const labelMap = new Map<
		string,
		{
			sceneNumber: number;
			shotNumber: number;
		}
	>();
	const sceneNumberById = new Map<string, number>();
	const shotCountBySceneId = new Map<string, number>();

	for (const shot of storyShots) {
		if (!sceneNumberById.has(shot.sceneId)) {
			sceneNumberById.set(shot.sceneId, sceneNumberById.size + 1);
		}
		const shotNumber = (shotCountBySceneId.get(shot.sceneId) ?? 0) + 1;
		shotCountBySceneId.set(shot.sceneId, shotNumber);
		labelMap.set(shot.id, {
			sceneNumber: sceneNumberById.get(shot.sceneId) ?? 1,
			shotNumber,
		});
	}

	return labelMap;
}

export function formatShotLocation(args: {
	sceneNumber: number;
	shotNumber: number;
}) {
	return `Scene ${args.sceneNumber} · Shot ${args.shotNumber}`;
}

export function formatTransitionLocation(args: {
	fromSceneNumber: number;
	fromShotNumber: number;
	toSceneNumber: number;
	toShotNumber: number;
}) {
	if (args.fromSceneNumber === args.toSceneNumber) {
		return `Scene ${args.fromSceneNumber} · Shot ${args.fromShotNumber} → Shot ${args.toShotNumber}`;
	}
	return `Scene ${args.fromSceneNumber} Shot ${args.fromShotNumber} → Scene ${args.toSceneNumber} Shot ${args.toShotNumber}`;
}
