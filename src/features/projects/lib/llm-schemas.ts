import { z } from "zod";
import { extractJsonBlock } from "./json-extract";

/**
 * Validates JSON extracted from an LLM response against a Zod schema.
 *
 * This is the single entry point for parsing any LLM-generated structured
 * output. It gives you runtime guarantees that the data matches the expected
 * shape BEFORE you write it to the database.
 *
 * Throws a descriptive error if:
 * - No JSON block could be extracted from the response
 * - The extracted JSON doesn't match the schema
 *
 * @param response - Raw LLM response text (may contain fenced code blocks)
 * @param schema - Zod schema describing the expected shape
 * @param context - Human-readable label used in error messages
 */
export function parseLlmJson<T>(
	response: string,
	schema: z.ZodType<T>,
	context: string,
): T {
	const raw = extractJsonBlock<unknown>(response);
	if (raw === null || raw === undefined) {
		throw new Error(`${context}: AI did not return parseable JSON`);
	}

	const result = schema.safeParse(raw);
	if (!result.success) {
		const firstIssue = result.error.issues[0];
		const path = firstIssue.path.join(".") || "root";
		throw new Error(
			`${context}: AI response schema mismatch at ${path} — ${firstIssue.message}`,
		);
	}

	return result.data;
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

export const SHOT_TYPE_VALUES = ["talking", "visual"] as const;
export const SHOT_SIZE_VALUES = [
	"extreme-wide",
	"wide",
	"medium",
	"close-up",
	"extreme-close-up",
	"insert",
] as const;

const ShotTypeSchema = z.enum(SHOT_TYPE_VALUES);
const ShotSizeSchema = z.enum(SHOT_SIZE_VALUES);

// ---------------------------------------------------------------------------
// Workshop schemas
// ---------------------------------------------------------------------------

export const OutlineEntrySchema = z.object({
	title: z.string().min(1, "title cannot be empty"),
	summary: z.string().min(1, "summary cannot be empty"),
});

export const OutlineArraySchema = z
	.array(OutlineEntrySchema)
	.min(1, "outline must have at least one beat")
	.max(20, "outline cannot exceed 20 beats");

export const ShotDraftEntrySchema = z.object({
	description: z.string().min(1, "shot description cannot be empty"),
	shotType: ShotTypeSchema,
	shotSize: ShotSizeSchema,
	durationSec: z
		.number()
		.int()
		.min(1, "durationSec must be at least 1")
		.max(10, "durationSec cannot exceed 10"),
});

export const ShotDraftArraySchema = z
	.array(ShotDraftEntrySchema)
	.min(1, "at least one shot is required")
	.max(100, "cannot exceed 100 shots");

export const ImagePromptEntrySchema = z.object({
	shotIndex: z.number().int().min(0, "shotIndex must be non-negative"),
	prompt: z.string().min(1, "prompt cannot be empty"),
});

export const ImagePromptArraySchema = z
	.array(ImagePromptEntrySchema)
	.min(1, "at least one image prompt is required");
