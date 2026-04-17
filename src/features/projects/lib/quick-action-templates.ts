/**
 * Quick-action chip templates for the workshop chat.
 *
 * These are canned prompts that users can click to quickly modify
 * their selected outline beat, shot, or image prompt.
 */

export type SelectionKind = "outline" | "shot" | "prompt";

export interface QuickActionTemplate {
	/** Display label for the chip */
	label: string;
	/** The text to send as a chat message */
	prompt: string;
}

/**
 * Quick action templates keyed by selection kind.
 */
export const quickActionTemplates: Record<SelectionKind, QuickActionTemplate[]> = {
	outline: [
		{ label: "More dramatic", prompt: "Make this beat more dramatic and emotionally impactful" },
		{ label: "Shorter", prompt: "Make this beat more concise" },
		{ label: "Add tension", prompt: "Add more tension or conflict to this beat" },
		{ label: "Clarify", prompt: "Clarify the purpose and pacing of this beat" },
	],
	shot: [
		{ label: "More cinematic", prompt: "Make this shot more cinematic with stronger visual direction" },
		{ label: "Vary framing", prompt: "Suggest a different shot size or angle to create variety" },
		{ label: "More detail", prompt: "Add more specific visual details to this shot description" },
		{ label: "Shorter", prompt: "Make this shot description more concise while keeping key details" },
	],
	prompt: [
		{ label: "More dramatic", prompt: "Make this image prompt more dramatic with stronger lighting and composition" },
		{ label: "Vary from neighbors", prompt: "Make this prompt visually distinct from adjacent shots" },
		{ label: "More detail", prompt: "Add more specific details about lighting, colors, and atmosphere" },
		{ label: "Simplify", prompt: "Simplify this prompt while preserving the core visual concept" },
	],
};

/**
 * Gets quick action templates for a given selection kind.
 */
export function getQuickActions(kind: SelectionKind): QuickActionTemplate[] {
	return quickActionTemplates[kind] ?? [];
}
