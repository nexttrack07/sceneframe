/**
 * Parses LLM responses that may contain structured workshop edit suggestions.
 *
 * The LLM returns edits in a fenced code block:
 * ```workshop-edit
 * { "action": "update_shot", "index": 2, "data": { "description": "..." } }
 * ```
 */

export type WorkshopEditAction =
	| "update_shot"
	| "update_prompt"
	| "update_outline";

export interface WorkshopEditShotData {
	description?: string;
	shotSize?: string;
	shotType?: string;
	durationSec?: number;
}

export interface WorkshopEditPromptData {
	prompt: string;
}

export interface WorkshopEditOutlineData {
	title?: string;
	summary?: string;
}

export interface WorkshopEdit {
	action: WorkshopEditAction;
	index: number;
	data: WorkshopEditShotData | WorkshopEditPromptData | WorkshopEditOutlineData;
}

export interface ParsedWorkshopResponse {
	conversational: string;
	edit: WorkshopEdit | null;
}

const WORKSHOP_EDIT_REGEX = /```workshop-edit\n([\s\S]*?)\n```/;

export function parseWorkshopEdit(content: string): ParsedWorkshopResponse {
	const match = content.match(WORKSHOP_EDIT_REGEX);

	if (!match) {
		return { conversational: content.trim(), edit: null };
	}

	// Remove the code block from conversational content
	const conversational = content
		.replace(WORKSHOP_EDIT_REGEX, "")
		.trim();

	try {
		const parsed = JSON.parse(match[1]) as WorkshopEdit;

		// Validate required fields
		if (
			!parsed.action ||
			typeof parsed.index !== "number" ||
			!parsed.data
		) {
			console.warn("Invalid workshop-edit structure:", parsed);
			return { conversational: content.trim(), edit: null };
		}

		// Validate action type
		if (
			parsed.action !== "update_shot" &&
			parsed.action !== "update_prompt" &&
			parsed.action !== "update_outline"
		) {
			console.warn("Unknown workshop-edit action:", parsed.action);
			return { conversational: content.trim(), edit: null };
		}

		return { conversational, edit: parsed };
	} catch (err) {
		console.warn("Failed to parse workshop-edit JSON:", err);
		return { conversational: content.trim(), edit: null };
	}
}

/**
 * Formats an edit for display in the UI.
 */
export function formatEditPreview(edit: WorkshopEdit): string {
	switch (edit.action) {
		case "update_shot": {
			const data = edit.data as WorkshopEditShotData;
			return data.description ?? "Update shot details";
		}
		case "update_prompt": {
			const data = edit.data as WorkshopEditPromptData;
			return data.prompt;
		}
		case "update_outline": {
			const data = edit.data as WorkshopEditOutlineData;
			return data.summary ?? data.title ?? "Update outline beat";
		}
	}
}

/**
 * Returns a human-readable label for the edit target.
 */
export function getEditTargetLabel(edit: WorkshopEdit): string {
	const num = edit.index + 1;
	switch (edit.action) {
		case "update_shot":
			return `Shot ${num}`;
		case "update_prompt":
			return `Image prompt for Shot ${num}`;
		case "update_outline":
			return `Outline beat ${num}`;
	}
}
