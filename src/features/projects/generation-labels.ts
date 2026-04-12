import type { Shot } from "@/db/schema";

export function buildShotLabelMap(storyShots: Pick<Shot, "id" | "order">[]) {
	const labelMap = new Map<
		string,
		{
			shotNumber: number;
		}
	>();

	const sorted = storyShots.slice().sort((a, b) => a.order - b.order);
	sorted.forEach((shot, index) => {
		labelMap.set(shot.id, { shotNumber: index + 1 });
	});

	return labelMap;
}

export function formatShotLocation(args: { shotNumber: number }) {
	return `Shot ${args.shotNumber}`;
}

export function formatTransitionLocation(args: {
	fromShotNumber: number;
	toShotNumber: number;
}) {
	return `Shot ${args.fromShotNumber} → Shot ${args.toShotNumber}`;
}
