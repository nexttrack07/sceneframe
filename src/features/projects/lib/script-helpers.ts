import type { IntakeAnswers, WorkshopState } from "../project-types";

export interface SelectionLabel {
	kind: "outline" | "shot" | "prompt";
	index: number;
	label: string;
}

export function getSelectionLabel(
	selectedItemId: string | null | undefined,
	workshop: WorkshopState | null | undefined,
): SelectionLabel | null {
	if (!selectedItemId || !workshop) return null;

	const match = selectedItemId.match(/^(outline|shot|prompt)-(\d+)$/);
	if (!match) return null;

	const kind = match[1] as "outline" | "shot" | "prompt";
	const index = Number.parseInt(match[2], 10);
	if (Number.isNaN(index)) return null;

	if (kind === "outline") {
		const entry = workshop.outline?.[index];
		if (!entry) return null;
		return { kind, index, label: entry.title };
	}

	if (kind === "shot") {
		const shot = workshop.shots?.[index];
		if (!shot) return null;
		return { kind, index, label: shot.description };
	}

	const shot = workshop.shots?.[index];
	if (!shot) return null;
	return { kind, index, label: shot.description };
}

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
