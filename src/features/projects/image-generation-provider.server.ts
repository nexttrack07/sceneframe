import { eq } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import { decryptUserApiKey } from "@/lib/encryption.server";
import { parseGeneratedMediaUrls } from "./image-generation-helpers.server";
import {
	getImageModelExecution,
	type ImageModelExecution,
} from "./image-models";

// =============================================================================
// Types
// =============================================================================

export type ImageGenerationProvider = "fal" | "replicate";
export type ImageGenerationMode = "text-to-image" | "image-to-image";

export interface SubmitImageGenerationArgs {
	modelId: string;
	input: Record<string, unknown>;
	providerApiKey: string;
	mode: ImageGenerationMode;
}

export interface SubmittedImageGeneration {
	provider: ImageGenerationProvider;
	requestId: string;
	initialStatus: "queued" | "generating";
	queuePosition?: number | null;
}

export interface ImageGenerationStatus {
	provider: ImageGenerationProvider;
	stage: "queued" | "generating" | "done" | "error";
	queuePosition?: number | null;
	outputUrls?: string[];
	errorMessage?: string;
}

export interface GenerateImageSyncArgs {
	modelId: string;
	input: Record<string, unknown>;
	providerApiKey: string;
	mode: ImageGenerationMode;
	timeoutMs?: number;
}

// =============================================================================
// Provider API Key Resolution
// =============================================================================

/**
 * Get the appropriate API key based on model's provider.
 * For fal.ai: uses FAL_API_KEY environment variable
 * For replicate: uses user's encrypted API key from database
 */
export async function getImageProviderApiKey(args: {
	userId?: string;
	modelId: string;
}): Promise<string> {
	const execution = getImageModelExecution(args.modelId);

	if (execution.provider === "fal") {
		const apiKey = process.env.FAL_API_KEY;
		if (!apiKey) {
			throw new Error("FAL_API_KEY is not configured for image generation.");
		}
		return apiKey;
	}

	// Replicate requires user's API key
	if (!args.userId) {
		throw new Error("User ID required for Replicate API key lookup.");
	}

	const user = await db.query.users.findFirst({
		where: eq(users.id, args.userId),
	});
	if (!user?.providerKeyEnc || !user?.providerKeyDek) {
		throw new Error("No Replicate API key found for user.");
	}

	return decryptUserApiKey(user.providerKeyEnc, user.providerKeyDek);
}

/**
 * Simplified getter for fal.ai API key (backwards compatible).
 */
export function getFalApiKey(): string {
	const apiKey = process.env.FAL_API_KEY;
	if (!apiKey) {
		throw new Error("FAL_API_KEY is not configured for image generation.");
	}
	return apiKey;
}

// =============================================================================
// fal.ai Provider Implementation
// =============================================================================

const falStatusLogCache = new Map<string, string>();

function getFalHeaders(apiKey: string) {
	return {
		Authorization: `Key ${apiKey}`,
		"Content-Type": "application/json",
	} as const;
}

function encodeFalGenerationRef(endpoint: string, requestId: string): string {
	return `fal|${endpoint}|${requestId}`;
}

function encodeFalGenerationUrls(args: {
	requestId: string;
	statusUrl: string;
	responseUrl: string;
}): string {
	return `faljson|${Buffer.from(JSON.stringify(args), "utf8").toString("base64url")}`;
}

function decodeFalGenerationRef(
	generationId: string,
	fallbackEndpoint: string,
): {
	requestId: string;
	statusUrl: string;
	responseUrl: string;
} {
	if (generationId.startsWith("faljson|")) {
		const encoded = generationId.slice("faljson|".length);
		return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
	}

	if (generationId.startsWith("fal|")) {
		const [, endpoint, requestId] = generationId.split("|");
		return {
			requestId,
			statusUrl: `https://queue.fal.run/${endpoint}/requests/${requestId}/status`,
			responseUrl: `https://queue.fal.run/${endpoint}/requests/${requestId}/response`,
		};
	}

	// Legacy format - just the request ID
	return {
		requestId: generationId,
		statusUrl: `https://queue.fal.run/${fallbackEndpoint}/requests/${generationId}/status`,
		responseUrl: `https://queue.fal.run/${fallbackEndpoint}/requests/${generationId}/response`,
	};
}

function resolveFalEndpoint(
	execution: ImageModelExecution,
	mode: ImageGenerationMode,
	input: Record<string, unknown>,
): string {
	if (execution.provider !== "fal") {
		throw new Error("Expected fal provider for endpoint resolution.");
	}

	// Check if we have reference images in the input
	const hasReferenceImages =
		typeof input.image_url === "string" ||
		(Array.isArray(input.image_urls) && input.image_urls.length > 0);

	if (mode === "image-to-image" || hasReferenceImages) {
		return execution.imageToImage ?? execution.textToImage;
	}

	return execution.textToImage;
}

async function submitFalGeneration(
	args: SubmitImageGenerationArgs,
	execution: ImageModelExecution,
): Promise<SubmittedImageGeneration> {
	const endpoint = resolveFalEndpoint(execution, args.mode, args.input);

	console.info(
		`[ImageProvider] submit provider=fal mode=${args.mode} model=${args.modelId} endpoint=${endpoint}`,
	);

	const response = await fetch(`https://queue.fal.run/${endpoint}`, {
		method: "POST",
		headers: getFalHeaders(args.providerApiKey),
		body: JSON.stringify(args.input),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`fal request failed (${response.status}): ${errorText}`);
	}

	const result = (await response.json()) as {
		request_id: string;
		queue_position?: number;
		status_url?: string;
		response_url?: string;
	};

	return {
		provider: "fal",
		requestId:
			result.status_url && result.response_url
				? encodeFalGenerationUrls({
						requestId: result.request_id,
						statusUrl: result.status_url,
						responseUrl: result.response_url,
					})
				: encodeFalGenerationRef(endpoint, result.request_id),
		initialStatus:
			typeof result.queue_position === "number" && result.queue_position > 0
				? "queued"
				: "generating",
		queuePosition: result.queue_position ?? null,
	};
}

async function getFalGenerationStatus(args: {
	modelId: string;
	requestId: string;
	providerApiKey: string;
	execution: ImageModelExecution;
}): Promise<ImageGenerationStatus> {
	const fallbackEndpoint =
		args.execution.provider === "fal" ? args.execution.textToImage : "";
	const ref = decodeFalGenerationRef(args.requestId, fallbackEndpoint);

	const statusResponse = await fetch(`${ref.statusUrl}?logs=1`, {
		headers: getFalHeaders(args.providerApiKey),
	});

	if (!statusResponse.ok) {
		const errorText = await statusResponse.text();
		throw new Error(`fal status failed (${statusResponse.status}): ${errorText}`);
	}

	const status = (await statusResponse.json()) as {
		status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";
		queue_position?: number;
		error?: string;
		error_type?: string;
	};

	const logKey = `fal:${ref.requestId}`;

	if (status.status === "IN_QUEUE") {
		const logLine = `[ImageProvider] status provider=fal model=${args.modelId} request=${ref.requestId} stage=queued queue=${status.queue_position ?? "?"}`;
		if (falStatusLogCache.get(logKey) !== logLine) {
			console.info(logLine);
			falStatusLogCache.set(logKey, logLine);
		}
		return {
			provider: "fal",
			stage: "queued",
			queuePosition: status.queue_position ?? null,
		};
	}

	if (status.status === "IN_PROGRESS") {
		const logLine = `[ImageProvider] status provider=fal model=${args.modelId} request=${ref.requestId} stage=generating`;
		if (falStatusLogCache.get(logKey) !== logLine) {
			console.info(logLine);
			falStatusLogCache.set(logKey, logLine);
		}
		return { provider: "fal", stage: "generating" };
	}

	if (status.error) {
		console.warn(
			`[ImageProvider] status provider=fal model=${args.modelId} request=${ref.requestId} stage=error errorType=${status.error_type ?? "unknown"}`,
		);
		return {
			provider: "fal",
			stage: "error",
			errorMessage: status.error_type
				? `${status.error} (${status.error_type})`
				: status.error,
		};
	}

	// COMPLETED - fetch result
	const resultResponse = await fetch(ref.responseUrl, {
		headers: getFalHeaders(args.providerApiKey),
	});

	if (!resultResponse.ok) {
		const errorText = await resultResponse.text();
		throw new Error(`fal result failed (${resultResponse.status}): ${errorText}`);
	}

	const result = await resultResponse.json();
	const urls = parseGeneratedMediaUrls(result);

	console.info(
		`[ImageProvider] status provider=fal model=${args.modelId} request=${ref.requestId} stage=done output=${urls.length > 0 ? "yes" : "no"}`,
	);

	return {
		provider: "fal",
		stage: "done",
		outputUrls: urls,
	};
}

async function generateFalImageSync(args: GenerateImageSyncArgs): Promise<string[]> {
	const execution = getImageModelExecution(args.modelId);
	if (execution.provider !== "fal") {
		throw new Error("Expected fal provider for sync generation.");
	}

	const endpoint = resolveFalEndpoint(execution, args.mode, args.input);

	console.info(
		`[ImageProvider] generateSync provider=fal mode=${args.mode} model=${args.modelId} endpoint=${endpoint}`,
	);

	// Use synchronous endpoint (fal.run instead of queue.fal.run)
	const response = await fetch(`https://fal.run/${endpoint}`, {
		method: "POST",
		headers: getFalHeaders(args.providerApiKey),
		body: JSON.stringify(args.input),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`fal sync request failed (${response.status}): ${errorText}`);
	}

	const result = await response.json();
	const urls = parseGeneratedMediaUrls(result);

	if (urls.length === 0) {
		throw new Error("No output URLs found in fal response.");
	}

	console.info(
		`[ImageProvider] generateSync provider=fal model=${args.modelId} completed urls=${urls.length}`,
	);

	return urls;
}

// =============================================================================
// Replicate Provider Implementation
// =============================================================================

async function submitReplicateGeneration(
	args: SubmitImageGenerationArgs,
	execution: ImageModelExecution,
): Promise<SubmittedImageGeneration> {
	if (execution.provider !== "replicate") {
		throw new Error("Expected replicate provider.");
	}

	console.info(
		`[ImageProvider] submit provider=replicate mode=${args.mode} model=${args.modelId} endpoint=${execution.model}`,
	);

	const replicate = new Replicate({ auth: args.providerApiKey });
	const prediction = await replicate.predictions.create({
		model: execution.model as `${string}/${string}`,
		input: args.input,
	});

	return {
		provider: "replicate",
		requestId: prediction.id,
		initialStatus: prediction.status === "starting" ? "queued" : "generating",
	};
}

async function getReplicateGenerationStatus(args: {
	modelId: string;
	requestId: string;
	providerApiKey: string;
	execution: ImageModelExecution;
}): Promise<ImageGenerationStatus> {
	const replicate = new Replicate({ auth: args.providerApiKey });
	const prediction = await replicate.predictions.get(args.requestId);

	if (prediction.status === "starting") {
		console.info(
			`[ImageProvider] status provider=replicate model=${args.modelId} request=${args.requestId} stage=queued`,
		);
		return { provider: "replicate", stage: "queued" };
	}

	if (prediction.status === "processing") {
		console.info(
			`[ImageProvider] status provider=replicate model=${args.modelId} request=${args.requestId} stage=generating`,
		);
		return { provider: "replicate", stage: "generating" };
	}

	if (prediction.status === "succeeded") {
		const urls = parseGeneratedMediaUrls(prediction.output);
		console.info(
			`[ImageProvider] status provider=replicate model=${args.modelId} request=${args.requestId} stage=done output=${urls.length > 0 ? "yes" : "no"}`,
		);
		return {
			provider: "replicate",
			stage: "done",
			outputUrls: urls,
		};
	}

	if (prediction.status === "failed" || prediction.status === "canceled") {
		const rawError = prediction.error;
		console.warn(
			`[ImageProvider] status provider=replicate model=${args.modelId} request=${args.requestId} stage=error providerStatus=${prediction.status}`,
		);
		return {
			provider: "replicate",
			stage: "error",
			errorMessage: rawError
				? typeof rawError === "string"
					? rawError
					: JSON.stringify(rawError)
				: "Generation failed",
		};
	}

	return { provider: "replicate", stage: "generating" };
}

async function generateReplicateImageSync(args: GenerateImageSyncArgs): Promise<string[]> {
	const execution = getImageModelExecution(args.modelId);
	if (execution.provider !== "replicate") {
		throw new Error("Expected replicate provider for sync generation.");
	}

	console.info(
		`[ImageProvider] generateSync provider=replicate mode=${args.mode} model=${args.modelId} endpoint=${execution.model}`,
	);

	const replicate = new Replicate({ auth: args.providerApiKey });
	const output = await replicate.run(execution.model as `${string}/${string}`, {
		input: args.input,
	});

	const urls = parseGeneratedMediaUrls(output);

	if (urls.length === 0) {
		throw new Error("No output URLs found in Replicate response.");
	}

	console.info(
		`[ImageProvider] generateSync provider=replicate model=${args.modelId} completed urls=${urls.length}`,
	);

	return urls;
}

// =============================================================================
// Unified Provider Interface
// =============================================================================

/**
 * Submit an async image generation request.
 * Routes to the appropriate provider based on model configuration.
 */
export async function submitImageGeneration(
	args: SubmitImageGenerationArgs,
): Promise<SubmittedImageGeneration> {
	const execution = getImageModelExecution(args.modelId);

	if (execution.provider === "fal") {
		return submitFalGeneration(args, execution);
	}

	return submitReplicateGeneration(args, execution);
}

/**
 * Get the status of an async image generation request.
 * Routes to the appropriate provider based on model configuration.
 */
export async function getImageGenerationStatus(args: {
	modelId: string;
	requestId: string;
	providerApiKey: string;
}): Promise<ImageGenerationStatus> {
	const execution = getImageModelExecution(args.modelId);

	if (execution.provider === "fal") {
		return getFalGenerationStatus({ ...args, execution });
	}

	return getReplicateGenerationStatus({ ...args, execution });
}

/**
 * Generate images synchronously (blocking until complete).
 * Routes to the appropriate provider based on model configuration.
 */
export async function generateImageSync(args: GenerateImageSyncArgs): Promise<string[]> {
	const execution = getImageModelExecution(args.modelId);

	if (execution.provider === "fal") {
		return generateFalImageSync(args);
	}

	return generateReplicateImageSync(args);
}

// =============================================================================
// Legacy Exports (for backwards compatibility)
// =============================================================================

/**
 * @deprecated Use getImageProviderApiKey instead
 */
export function getImageProviderApiKeyLegacy(): string {
	return getFalApiKey();
}
