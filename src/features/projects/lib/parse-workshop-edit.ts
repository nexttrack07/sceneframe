/**
 * Parses LLM responses that may contain structured workshop edit suggestions.
 *
 * The LLM returns edits in a fenced code block:
 * ```workshop-edit
 * { "action": "update_shot", "index": 2, "data": { "description": "..." } }
 * ```
 *
 * Supports both v1 (single index) and v2 (indices array) formats.
 */

import {
	type WorkshopEditV2,
	type WorkshopEditActionV2,
	type WorkshopEditShotData,
	type WorkshopEditPromptData,
	type WorkshopEditOutlineData,
	type WorkshopEditData,
	normalizeToV2,
	isV2Action,
} from "./workshop-edit-schema";

// Re-export types for backward compatibility
export type {
	WorkshopEditShotData,
	WorkshopEditPromptData,
	WorkshopEditOutlineData,
	WorkshopEditData,
};

// Legacy type alias for backward compatibility
export type WorkshopEditAction = WorkshopEditActionV2;

// Legacy interface for backward compatibility (v1 format with single index)
export interface WorkshopEdit {
	action: WorkshopEditActionV2;
	index: number;
	data: WorkshopEditData | Record<string, never>;
}

// V2 interface with indices array
export interface WorkshopEditBatch extends WorkshopEditV2 {}

export interface ParsedWorkshopResponse {
	conversational: string;
	/** V1-compatible edit (single index). Null if no edit or if edit has multiple indices. */
	edit: WorkshopEdit | null;
	/** V2 edit (indices array). Always populated if an edit was found. */
	editV2: WorkshopEditBatch | null;
}

const WORKSHOP_EDIT_REGEX = /```workshop-edit\n([\s\S]*?)\n```/;

export function parseWorkshopEdit(content: string): ParsedWorkshopResponse {
	const match = content.match(WORKSHOP_EDIT_REGEX);

	if (!match) {
		return { conversational: content.trim(), edit: null, editV2: null };
	}

	// Remove the code block from conversational content
	const conversational = content.replace(WORKSHOP_EDIT_REGEX, "").trim();

	try {
		const raw = JSON.parse(match[1]) as Record<string, unknown>;

		// Normalize to v2 format
		const v2 = normalizeToV2(raw);
		if (!v2) {
			console.warn("Invalid workshop-edit structure:", raw);
			return { conversational: content.trim(), edit: null, editV2: null };
		}

		// Validate action type
		if (!isV2Action(v2.action)) {
			console.warn("Unknown workshop-edit action:", v2.action);
			return { conversational: content.trim(), edit: null, editV2: null };
		}

		// For delete_shot, data can be empty; for others, data must be present
		if (v2.action !== "delete_shot" && Object.keys(v2.data).length === 0) {
			console.warn("Missing data for workshop-edit action:", v2.action);
			return { conversational: content.trim(), edit: null, editV2: null };
		}

		// Build v1-compatible edit if single index
		const v1Edit: WorkshopEdit | null =
			v2.indices.length === 1
				? {
						action: v2.action,
						index: v2.indices[0],
						data: v2.data as WorkshopEditData,
					}
				: null;

		return {
			conversational,
			edit: v1Edit,
			editV2: v2 as WorkshopEditBatch,
		};
	} catch (err) {
		console.warn("Failed to parse workshop-edit JSON:", err);
		return { conversational: content.trim(), edit: null, editV2: null };
	}
}

/**
 * Formats an edit for display in the UI.
 */
export function formatEditPreview(edit: WorkshopEdit | WorkshopEditBatch): string {
	const action = edit.action;

	switch (action) {
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
		case "delete_shot": {
			return "Delete shot";
		}
		case "manual_edit": {
			// Manual edits can apply to any type
			const data = edit.data as WorkshopEditShotData | WorkshopEditPromptData | WorkshopEditOutlineData;
			if ("prompt" in data) return data.prompt;
			if ("description" in data) return data.description ?? "Manual edit";
			if ("summary" in data) return data.summary ?? data.title ?? "Manual edit";
			return "Manual edit";
		}
		default:
			return "Unknown edit";
	}
}

/**
 * Returns a human-readable label for the edit target.
 */
export function getEditTargetLabel(edit: WorkshopEdit | WorkshopEditBatch): string {
	// Handle v2 format with indices array
	const indices = "indices" in edit ? edit.indices : [edit.index];
	const action = edit.action;

	if (indices.length === 1) {
		const num = indices[0] + 1;
		switch (action) {
			case "update_shot":
			case "manual_edit":
				return `Shot ${num}`;
			case "update_prompt":
				return `Image prompt for Shot ${num}`;
			case "update_outline":
				return `Outline beat ${num}`;
			case "delete_shot":
				return `Shot ${num}`;
		}
	}

	// Multiple indices
	const nums = indices.map((i) => i + 1).join(", ");
	switch (action) {
		case "update_shot":
		case "manual_edit":
		case "delete_shot":
			return `Shots ${nums}`;
		case "update_prompt":
			return `Image prompts for Shots ${nums}`;
		case "update_outline":
			return `Outline beats ${nums}`;
	}
}
