/**
 * Workshop Edit Schema v2
 *
 * Extends the original edit schema to support:
 * - Batch edits via `indices: number[]` (with single-index back-compat)
 * - New actions: `delete_shot`, `manual_edit`
 * - Adapter functions for v1 → v2 migration
 */

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export type WorkshopEditActionV1 =
	| "update_shot"
	| "update_prompt"
	| "update_outline";

export type WorkshopEditActionV2 =
	| WorkshopEditActionV1
	| "delete_shot"
	| "manual_edit";

// ---------------------------------------------------------------------------
// Data payloads (unchanged from v1, re-exported for convenience)
// ---------------------------------------------------------------------------

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

export type WorkshopEditData =
	| WorkshopEditShotData
	| WorkshopEditPromptData
	| WorkshopEditOutlineData;

// ---------------------------------------------------------------------------
// V1 schema (original, single-index)
// ---------------------------------------------------------------------------

export interface WorkshopEditV1 {
	action: WorkshopEditActionV1;
	index: number;
	data: WorkshopEditData;
}

// ---------------------------------------------------------------------------
// V2 schema (batch-capable, extended actions)
// ---------------------------------------------------------------------------

export interface WorkshopEditV2 {
	action: WorkshopEditActionV2;
	/** Array of indices to apply this edit to. Single-item array for single edits. */
	indices: number[];
	/** Edit payload. For delete_shot, data can be empty object. */
	data: WorkshopEditData | Record<string, never>;
}

// ---------------------------------------------------------------------------
// Parsed response types
// ---------------------------------------------------------------------------

export interface ParsedWorkshopResponseV1 {
	conversational: string;
	edit: WorkshopEditV1 | null;
}

export interface ParsedWorkshopResponseV2 {
	conversational: string;
	edit: WorkshopEditV2 | null;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

/**
 * Converts a v1 edit (single index) to v2 format (indices array).
 */
export function v1ToV2Edit(v1: WorkshopEditV1): WorkshopEditV2 {
	return {
		action: v1.action,
		indices: [v1.index],
		data: v1.data,
	};
}

/**
 * Converts a v2 edit back to v1 format.
 * Throws if the edit has multiple indices or uses a v2-only action.
 */
export function v2ToV1Edit(v2: WorkshopEditV2): WorkshopEditV1 {
	if (v2.indices.length !== 1) {
		throw new Error(
			`Cannot convert v2 edit with ${v2.indices.length} indices to v1 format`,
		);
	}
	if (v2.action === "delete_shot" || v2.action === "manual_edit") {
		throw new Error(`Cannot convert v2-only action "${v2.action}" to v1 format`);
	}
	return {
		action: v2.action,
		index: v2.indices[0],
		data: v2.data as WorkshopEditData,
	};
}

/**
 * Type guard: checks if an action is a v1-compatible action.
 */
export function isV1Action(action: string): action is WorkshopEditActionV1 {
	return (
		action === "update_shot" ||
		action === "update_prompt" ||
		action === "update_outline"
	);
}

/**
 * Type guard: checks if an action is a valid v2 action.
 */
export function isV2Action(action: string): action is WorkshopEditActionV2 {
	return (
		isV1Action(action) ||
		action === "delete_shot" ||
		action === "manual_edit"
	);
}

/**
 * Normalizes an incoming edit to v2 format.
 * Accepts either v1 (with `index`) or v2 (with `indices`) shape.
 */
export function normalizeToV2(
	input: WorkshopEditV1 | WorkshopEditV2 | Record<string, unknown>,
): WorkshopEditV2 | null {
	if (!input || typeof input !== "object") return null;

	const action = input.action as string | undefined;
	if (!action || !isV2Action(action)) return null;

	// V2 shape: has `indices` array
	if (Array.isArray((input as WorkshopEditV2).indices)) {
		const v2 = input as WorkshopEditV2;
		if (v2.indices.length === 0) return null;
		if (!v2.indices.every((i) => typeof i === "number" && i >= 0)) return null;
		return {
			action: v2.action,
			indices: v2.indices,
			data: v2.data ?? {},
		};
	}

	// V1 shape: has single `index`
	if (typeof (input as WorkshopEditV1).index === "number") {
		const v1 = input as WorkshopEditV1;
		if (v1.index < 0) return null;
		return {
			action: action as WorkshopEditActionV2,
			indices: [v1.index],
			data: v1.data ?? {},
		};
	}

	return null;
}
