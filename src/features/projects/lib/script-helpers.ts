import type {
	IntakeAnswers,
	OpeningHookDraft,
	ScenePlanEntry,
} from "../project-types";

export function parseSceneProposal(content: string): ScenePlanEntry[] | null {
	const match = content.match(/```scenes\s*([\s\S]*?)```/);
	if (!match) return null;
	try {
		const parsed = JSON.parse(match[1]);
		if (!Array.isArray(parsed) || parsed.length < 1) return null;
		return parsed
			.map(
				(s: {
					sceneNumber?: number;
					sceneIndex?: number;
					order?: number;
					title?: string;
					description?: string;
					durationSec?: number;
					beat?: string;
					hookRole?: "hook" | "body" | "cta";
				}) => ({
					sceneNumber: Number.isFinite(s.sceneNumber)
						? Number(s.sceneNumber)
						: Number.isFinite(s.order)
							? Number(s.order)
							: Number.isFinite(s.sceneIndex)
								? Number(s.sceneIndex) + 1
								: undefined,
					title: String(s.title ?? "").trim(),
					description: String(s.description ?? "").trim(),
					durationSec: Number.isFinite(s.durationSec)
						? Number(s.durationSec)
						: undefined,
					beat: typeof s.beat === "string" ? s.beat : undefined,
					hookRole: s.hookRole,
				}),
			)
			.filter((s: { description: string }) => s.description.length > 0);
	} catch {
		return null;
	}
}

export function parseOpeningHook(content: string): OpeningHookDraft | null {
	const match = content.match(/```opening_hook\s*([\s\S]*?)```/);
	if (!match) return null;
	try {
		const parsed = JSON.parse(match[1]);
		if (!parsed || typeof parsed !== "object") return null;
		const headline = String(parsed.headline ?? "").trim();
		const narration = String(parsed.narration ?? "").trim();
		const visualDirection = String(parsed.visualDirection ?? "").trim();
		if (!headline || !narration || !visualDirection) return null;
		return { headline, narration, visualDirection };
	} catch {
		return null;
	}
}

export function composeBrief(intake: IntakeAnswers): string {
	const parts: string[] = [];
	const lengthLabel = intake.targetDurationSec
		? `${Math.round((intake.targetDurationSec / 60) * 10) / 10}-minute`
		: intake.length.toLowerCase();

	parts.push(`I'd like to create a ${lengthLabel} video.`);

	if (intake.channelPreset) parts.push(`Format: ${intake.channelPreset}.`);
	if (intake.purpose) parts.push(`Purpose: ${intake.purpose}.`);
	if (intake.style?.length)
		parts.push(`Visual style: ${intake.style.join(", ")}.`);
	if (intake.mood?.length) parts.push(`Mood: ${intake.mood.join(", ")}.`);
	if (intake.setting?.length)
		parts.push(`Setting: ${intake.setting.join(", ")}.`);
	if (intake.audience) parts.push(`Audience: ${intake.audience}.`);
	if (intake.viewerAction)
		parts.push(`Desired viewer action: ${intake.viewerAction}.`);
	if (intake.workingTitle?.trim())
		parts.push(`Working title: ${intake.workingTitle.trim()}.`);
	if (intake.thumbnailPromise?.trim())
		parts.push(`Thumbnail promise: ${intake.thumbnailPromise.trim()}.`);
	parts.push(`Here's my concept: ${intake.concept}`);
	return parts.join(" ");
}

export function targetDurationRange(targetSec: number): {
	min: number;
	max: number;
} {
	return {
		min: Math.round(targetSec * 0.85),
		max: Math.round(targetSec * 1.15),
	};
}

export function parseQuickReplies(content: string): string[] | null {
	const match = content.match(/```suggestions\s*([\s\S]*?)```/);
	if (!match) return null;
	try {
		const parsed = JSON.parse(match[1].trim());
		if (!Array.isArray(parsed) || parsed.length === 0) return null;
		return parsed.filter((s): s is string => typeof s === "string").slice(0, 4);
	} catch {
		return null;
	}
}

export function stripSuggestions(content: string): string {
	return content.replace(/```suggestions[\s\S]*?```/g, "").trim();
}

export function estimateDuration(scene: ScenePlanEntry): number {
	if (scene.durationSec && Number.isFinite(scene.durationSec))
		return Math.max(2, scene.durationSec);
	const words = scene.description.trim().split(/\s+/).length;
	return Math.max(3, Math.min(18, Math.round(words / 3)));
}
