import type {
	MotionGraphicPreset,
	MotionGraphicSpec,
	MotionGraphicSummary,
	MotionGraphicTextItemSpec,
	SceneAssetSummary,
} from "./project-types";

function cleanSentence(input: string): string {
	return input.replace(/\s+/g, " ").trim();
}

function toHeadline(input: string): string {
	const firstSentence = cleanSentence(input)
		.split(/[.!?]/)
		.map((part) => part.trim())
		.find(Boolean);
	const base = firstSentence || cleanSentence(input);
	const words = base.split(" ").filter(Boolean).slice(0, 6);
	return words.join(" ");
}

function toSubheadline(input: string): string {
	const cleaned = cleanSentence(input);
	if (cleaned.length <= 90) return cleaned;
	return `${cleaned.slice(0, 87).trimEnd()}...`;
}

function makeItem(
	partial: Omit<MotionGraphicTextItemSpec, "id">,
	index: number,
): MotionGraphicTextItemSpec {
	return {
		id: `mg-item-${index + 1}`,
		...partial,
	};
}

export function buildMotionGraphicSpec({
	preset,
	sourceText,
	shotDurationSec,
}: {
	preset: MotionGraphicPreset;
	sourceText: string;
	shotDurationSec: number;
}): MotionGraphicSpec {
	const headline = toHeadline(sourceText);
	const subheadline = toSubheadline(sourceText);
	const durationInFrames = Math.max(60, Math.round(shotDurationSec * 30));

	switch (preset) {
		case "callout":
			return {
				items: [
					makeItem(
						{
							text: headline || "Key moment",
							role: "headline",
							left: 124,
							top: 118,
							width: 760,
							height: 90,
							fontSize: 64,
							color: "#ffffff",
							align: "left",
							fromOffsetFrames: 8,
							durationInFrames: Math.min(durationInFrames, 120),
							enterAnimation: "slide-left",
							enterAnimationDurationInSeconds: 0.5,
							exitAnimation: "fade",
							exitAnimationDurationInSeconds: 0.4,
						},
						0,
					),
					makeItem(
						{
							text: subheadline,
							role: "subheadline",
							left: 124,
							top: 202,
							width: 920,
							height: 120,
							fontSize: 34,
							color: "#d4d4d8",
							align: "left",
							fromOffsetFrames: 16,
							durationInFrames: Math.min(durationInFrames, 132),
							enterAnimation: "slide-up",
							enterAnimationDurationInSeconds: 0.45,
							exitAnimation: "fade",
							exitAnimationDurationInSeconds: 0.35,
						},
						1,
					),
				],
			};
		default:
			return {
				items: [
					makeItem(
						{
							text: headline || "On-screen title",
							role: "headline",
							left: 112,
							top: 822,
							width: 820,
							height: 86,
							fontSize: 58,
							color: "#ffffff",
							align: "left",
							fromOffsetFrames: 6,
							durationInFrames: Math.min(durationInFrames, 150),
							enterAnimation: "slide-up",
							enterAnimationDurationInSeconds: 0.45,
							exitAnimation: "slide-left",
							exitAnimationDurationInSeconds: 0.35,
						},
						0,
					),
					makeItem(
						{
							text: subheadline,
							role: "subheadline",
							left: 112,
							top: 890,
							width: 980,
							height: 80,
							fontSize: 30,
							color: "#e4e4e7",
							align: "left",
							fromOffsetFrames: 12,
							durationInFrames: Math.min(durationInFrames, 156),
							enterAnimation: "fade",
							enterAnimationDurationInSeconds: 0.35,
							exitAnimation: "fade",
							exitAnimationDurationInSeconds: 0.3,
						},
						1,
					),
				],
			};
	}
}

export function getMotionGraphicTitle({
	preset,
	sourceText,
}: {
	preset: MotionGraphicPreset;
	sourceText: string;
}) {
	const prefix = preset === "callout" ? "Callout" : "Lower third";
	const headline = toHeadline(sourceText);
	return headline ? `${prefix}: ${headline}` : prefix;
}

export function getMotionGraphicPreviewImage(
	graphicsForShot: MotionGraphicSummary[],
	shotAssets: SceneAssetSummary[],
): string | null {
	void graphicsForShot;
	const selectedImage = shotAssets.find(
		(asset) => asset.isSelected && asset.status === "done" && asset.url,
	);
	return selectedImage?.url ?? null;
}
