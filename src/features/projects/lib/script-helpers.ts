import type { IntakeAnswers } from "../project-types";

export function composeBrief(intake: IntakeAnswers): string {
	const parts: string[] = [];
	const lengthLabel = intake.targetDurationSec
		? `${Math.round((intake.targetDurationSec / 60) * 10) / 10}-minute`
		: (intake.length ?? "short").toLowerCase();

	parts.push(`I'd like to create a ${lengthLabel} video.`);

	if (intake.channelPreset) parts.push(`Format: ${intake.channelPreset}.`);
	if (intake.purpose) parts.push(`Purpose: ${intake.purpose}.`);
	if (intake.style?.length)
		parts.push(`Visual style: ${intake.style.join(", ")}.`);
	if (intake.mood?.length) parts.push(`Mood: ${intake.mood.join(", ")}.`);
	if (intake.setting?.length)
		parts.push(`Setting: ${intake.setting.join(", ")}.`);
	if (intake.audioMode) parts.push(`Audio direction: ${intake.audioMode}.`);
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
