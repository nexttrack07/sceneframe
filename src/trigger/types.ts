/**
 * Shared types for Trigger.dev task workflows.
 *
 * These types standardize the workflow stages and logging across all media generation tasks.
 */

/**
 * Internal workflow stages for media generation.
 *
 * These stages provide granular visibility into where a task is in its lifecycle.
 * The UI may map these to simpler user-facing labels.
 *
 * | Internal Stage | User-Facing Label |
 * |----------------|-------------------|
 * | `queued`       | Queued            |
 * | `running`      | Generating        |
 * | `retrying`     | Retrying          |
 * | `finalizing`   | Finalizing        |
 * | `completed`    | Done              |
 * | `failed`       | Error             |
 */
export type MediaStage =
	| "queued"
	| "running"
	| "retrying"
	| "finalizing"
	| "completed"
	| "failed";

/**
 * Media type categories for logging and queue routing.
 */
export type MediaType = "image" | "audio" | "video" | "script";

/**
 * Standardized log context for Trigger tasks.
 *
 * Use this to provide consistent structured logging across all media generation tasks.
 * This makes debugging and observability much easier.
 */
export interface TaskLogContext {
	/** The type of media being generated */
	mediaType: MediaType;
	/** The specific model identifier (e.g., "flux-pro", "kling-v2.5") */
	modelId: string;
	/** The primary row ID (asset.id or transitionVideo.id) */
	rowId: string;
	/** The batch ID if this is part of a batch operation */
	batchId?: string;
	/** The provider's generation ID for staleness checks */
	generationId?: string;
	/** The current workflow stage */
	stage: MediaStage;
}

/**
 * Maps internal MediaStage to user-facing display labels.
 */
export function getStageLabel(stage: MediaStage): string {
	switch (stage) {
		case "queued":
			return "Queued";
		case "running":
			return "Generating";
		case "retrying":
			return "Retrying";
		case "finalizing":
			return "Finalizing";
		case "completed":
			return "Done";
		case "failed":
			return "Error";
	}
}

/**
 * Queue configuration constants.
 *
 * These define the shared queues used across all Trigger tasks.
 * Use these constants instead of hardcoding queue names.
 */
export const QUEUES = {
	IMAGE_GENERATION: "image-generation",
	AUDIO_GENERATION: "audio-generation",
	VIDEO_GENERATION: "video-generation",
	SCRIPT_GENERATION: "script-generation",
} as const;

/**
 * Concurrency limits by queue.
 *
 * These are the default limits - individual tasks may override if needed.
 */
export const CONCURRENCY_LIMITS = {
	[QUEUES.IMAGE_GENERATION]: 10,
	[QUEUES.AUDIO_GENERATION]: 5,
	[QUEUES.VIDEO_GENERATION]: 3,
	[QUEUES.SCRIPT_GENERATION]: 5,
} as const;

/**
 * Retry configuration presets by media type.
 */
export const RETRY_CONFIGS = {
	image: {
		maxAttempts: 3,
		factor: 2,
		minTimeoutInMs: 1000,
		maxTimeoutInMs: 30000,
	},
	audio: {
		maxAttempts: 3,
		factor: 2,
		minTimeoutInMs: 2000,
		maxTimeoutInMs: 60000,
	},
	video: {
		maxAttempts: 2,
		factor: 2,
		minTimeoutInMs: 5000,
		maxTimeoutInMs: 120000,
	},
	script: {
		maxAttempts: 3,
		factor: 2,
		minTimeoutInMs: 1000,
		maxTimeoutInMs: 30000,
	},
} as const;

/**
 * Timeout constants for video generation polling.
 */
export const VIDEO_TIMEOUTS = {
	/** Maximum time to wait for shot video generation (15 minutes) */
	SHOT_VIDEO_MS: 15 * 60 * 1000,
	/** Maximum time to wait for transition video generation (15 minutes) */
	TRANSITION_VIDEO_MS: 15 * 60 * 1000,
	/** Interval between polling checks (30 seconds) */
	POLL_INTERVAL_SECONDS: 30,
} as const;

/**
 * User-facing error message templates.
 *
 * Use these to ensure consistent error messaging across tasks.
 */
export const ERROR_MESSAGES = {
	TIMED_OUT:
		"Generation timed out before the provider returned a result. Try again or choose a faster model.",
	PROVIDER_REJECTED:
		"The provider rejected the request. Check the input and try again.",
	UPLOAD_FAILED: "Failed to save the generated file. Please try again.",
	JOB_ABANDONED:
		"The generation job was abandoned. This may happen if the service restarted.",
	GENERATION_FAILED: "Generation failed. Please try again.",
} as const;
