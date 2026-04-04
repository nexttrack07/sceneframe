import { eq } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import { decryptUserApiKey } from "@/lib/encryption.server";
import { parseGeneratedMediaUrls } from "./image-generation-helpers.server";
import { getVideoModelExecution } from "./video-models";

export interface SubmitVideoGenerationArgs {
	modelId: string;
	input: Record<string, unknown>;
	providerApiKey: string;
	mode: "shot" | "transition";
}

export interface SubmittedVideoGeneration {
	provider: "replicate" | "fal";
	requestId: string;
	initialStatus: "queued" | "generating";
	queuePosition?: number | null;
}

export interface VideoGenerationStatus {
	provider: "replicate" | "fal";
	stage: "queued" | "generating" | "done" | "error";
	queuePosition?: number | null;
	outputUrl?: string;
	errorMessage?: string;
}

const lastStatusLogByRequest = new Map<string, string>();

function encodeFalGenerationRef(endpoint: string, requestId: string) {
	return `fal|${endpoint}|${requestId}`;
}

function encodeFalGenerationUrls(args: {
	requestId: string;
	statusUrl: string;
	responseUrl: string;
}) {
	return `faljson|${Buffer.from(JSON.stringify(args), "utf8").toString("base64url")}`;
}

function decodeGenerationRef(args: {
	modelId: string;
	generationId: string;
	mode: "shot" | "transition";
}) {
	if (args.generationId.startsWith("fal|")) {
		const [, endpoint, requestId] = args.generationId.split("|");
		return {
			provider: "fal" as const,
			endpoint,
			requestId,
			statusUrl: getFalStatusUrl(endpoint, requestId),
			responseUrl: getFalResultUrl(endpoint, requestId),
		};
	}

	if (args.generationId.startsWith("faljson|")) {
		const encoded = args.generationId.slice("faljson|".length);
		const parsed = JSON.parse(
			Buffer.from(encoded, "base64url").toString("utf8"),
		) as {
			requestId: string;
			statusUrl: string;
			responseUrl: string;
		};
		return {
			provider: "fal" as const,
			endpoint: "",
			requestId: parsed.requestId,
			statusUrl: parsed.statusUrl,
			responseUrl: parsed.responseUrl,
		};
	}

	const execution = getVideoModelExecution(args.modelId);
	if (execution.provider === "fal") {
		const endpoint =
			args.mode === "transition"
				? execution.transitionImageToVideo
				: execution.shotImageToVideo;
		return {
			provider: "replicate" as const,
			endpoint,
			requestId: args.generationId,
			statusUrl: "",
			responseUrl: "",
		};
	}

	return {
		provider: "replicate" as const,
		endpoint: execution.model,
		requestId: args.generationId,
		statusUrl: "",
		responseUrl: "",
	};
}

function resolveFalEndpoint(args: {
	modelId: string;
	mode: "shot" | "transition";
	input: Record<string, unknown>;
}) {
	const execution = getVideoModelExecution(args.modelId);
	if (execution.provider !== "fal") {
		throw new Error(
			`Model ${args.modelId} is not configured for fal execution.`,
		);
	}

	if (args.mode === "transition") {
		return execution.transitionImageToVideo;
	}

	const hasReferenceSet =
		Array.isArray(args.input.image_urls) &&
		(args.input.image_urls as unknown[]).length > 0 &&
		(typeof args.input.start_image_url === "string" ||
			typeof args.input.image_url === "string");
	if (hasReferenceSet && execution.shotReferenceToVideo) {
		return execution.shotReferenceToVideo;
	}

	const hasStartImage =
		typeof args.input.start_image_url === "string" ||
		typeof args.input.image_url === "string";
	if (hasStartImage) {
		return execution.shotImageToVideo;
	}

	if (!execution.shotTextToVideo) {
		throw new Error(
			`Model ${args.modelId} requires a reference image for fal execution.`,
		);
	}

	return execution.shotTextToVideo;
}

function adaptFalInputForEndpoint(args: {
	endpoint: string;
	input: Record<string, unknown>;
}) {
	if (args.endpoint.includes("reference-to-video")) {
		const next = { ...args.input };
		if (typeof next.image_url === "string" && !next.start_image_url) {
			next.start_image_url = next.image_url;
			delete next.image_url;
		}
		return next;
	}

	return args.input;
}

/**
 * Adapts input for Replicate API which may have different schema requirements
 * than fal.ai (e.g., duration as integer vs string).
 */
function adaptInputForReplicate(args: {
	modelId: string;
	input: Record<string, unknown>;
}): Record<string, unknown> {
	const adapted = { ...args.input };

	// Convert duration strings like "8s" to integers for Replicate
	if (typeof adapted.duration === "string") {
		const match = adapted.duration.match(/^(\d+)s?$/);
		if (match) {
			adapted.duration = parseInt(match[1], 10);
		}
	}

	// Convert safety_tolerance string to integer if needed
	if (typeof adapted.safety_tolerance === "string") {
		const parsed = parseInt(adapted.safety_tolerance, 10);
		if (!isNaN(parsed)) {
			adapted.safety_tolerance = parsed;
		}
	}

	// Handle Kling field mappings for Replicate
	// Replicate schema: start_image, end_image, duration (int), aspect_ratio, negative_prompt
	if (args.modelId.includes("kling")) {
		// first_frame_url -> start_image for Replicate Kling
		if (adapted.first_frame_url && !adapted.start_image) {
			adapted.start_image = adapted.first_frame_url;
			delete adapted.first_frame_url;
		}
		// image_url -> start_image for Replicate Kling
		if (adapted.image_url && !adapted.start_image) {
			adapted.start_image = adapted.image_url;
			delete adapted.image_url;
		}
		// last_frame_url -> end_image for Replicate Kling
		if (adapted.last_frame_url && !adapted.end_image) {
			adapted.end_image = adapted.last_frame_url;
			delete adapted.last_frame_url;
		}
	}

	// Handle Wan field mappings for Replicate
	// Replicate schema: first_frame, last_frame, duration (int), prompt, negative_prompt, resolution
	if (args.modelId.includes("wan")) {
		// first_frame_url -> first_frame for Replicate Wan
		if (adapted.first_frame_url && !adapted.first_frame) {
			adapted.first_frame = adapted.first_frame_url;
			delete adapted.first_frame_url;
		}
		// image_url -> first_frame for Replicate Wan
		if (adapted.image_url && !adapted.first_frame) {
			adapted.first_frame = adapted.image_url;
			delete adapted.image_url;
		}
		// last_frame_url -> last_frame for Replicate Wan
		if (adapted.last_frame_url && !adapted.last_frame) {
			adapted.last_frame = adapted.last_frame_url;
			delete adapted.last_frame_url;
		}
	}

	// Handle Veo 3.1 field mappings for Replicate
	// Replicate schema: image, last_frame, duration (int), resolution, aspect_ratio, generate_audio, negative_prompt, reference_images
	if (args.modelId.includes("veo")) {
		// first_frame_url -> image for Replicate Veo
		if (adapted.first_frame_url && !adapted.image) {
			adapted.image = adapted.first_frame_url;
			delete adapted.first_frame_url;
		}
		// image_url -> image for Replicate Veo
		if (adapted.image_url && !adapted.image) {
			adapted.image = adapted.image_url;
			delete adapted.image_url;
		}
		// last_frame_url -> last_frame for Replicate Veo
		if (adapted.last_frame_url) {
			adapted.last_frame = adapted.last_frame_url;
			delete adapted.last_frame_url;
		}
		// Remove safety_tolerance (not supported by Replicate Veo 3.1)
		delete adapted.safety_tolerance;
	}

	return adapted;
}

export async function getVideoProviderApiKey(args: {
	userId: string;
	modelId: string;
}) {
	const execution = getVideoModelExecution(args.modelId);

	if (execution.provider === "fal") {
		const apiKey = process.env.FAL_API_KEY;
		if (!apiKey) {
			throw new Error("FAL_API_KEY is not configured for video generation.");
		}
		return apiKey;
	}

	const user = await db.query.users.findFirst({
		where: eq(users.id, args.userId),
	});
	if (!user?.providerKeyEnc || !user?.providerKeyDek) {
		throw new Error("No Replicate API key found for user");
	}

	return decryptUserApiKey(user.providerKeyEnc, user.providerKeyDek);
}

function getFalHeaders(apiKey: string) {
	return {
		Authorization: `Key ${apiKey}`,
		"Content-Type": "application/json",
	} as const;
}

function getFalStatusUrl(endpoint: string, requestId: string) {
	return `https://queue.fal.run/${endpoint}/requests/${requestId}/status`;
}

function getFalResultUrl(endpoint: string, requestId: string) {
	return `https://queue.fal.run/${endpoint}/requests/${requestId}/response`;
}

export async function submitVideoGeneration(
	args: SubmitVideoGenerationArgs,
): Promise<SubmittedVideoGeneration> {
	const execution = getVideoModelExecution(args.modelId);

	if (execution.provider === "replicate") {
		const adaptedInput = adaptInputForReplicate({
			modelId: args.modelId,
			input: args.input,
		});
		console.info(
			`[VideoProvider] submit provider=replicate mode=${args.mode} model=${args.modelId} endpoint=${execution.model}`,
		);
		const replicate = new Replicate({ auth: args.providerApiKey });
		const prediction = await replicate.predictions.create({
			model: execution.model as `${string}/${string}`,
			input: adaptedInput,
		});

		return {
			provider: "replicate",
			requestId: prediction.id,
			initialStatus: prediction.status === "starting" ? "queued" : "generating",
		};
	}

	const endpoint = resolveFalEndpoint({
		modelId: args.modelId,
		mode: args.mode,
		input: args.input,
	});
	const requestInput = adaptFalInputForEndpoint({
		endpoint,
		input: args.input,
	});
	console.info(
		`[VideoProvider] submit provider=fal mode=${args.mode} model=${args.modelId} endpoint=${endpoint}`,
	);

	const response = await fetch(`https://queue.fal.run/${endpoint}`, {
		method: "POST",
		headers: getFalHeaders(args.providerApiKey),
		body: JSON.stringify(requestInput),
	});

	if (!response.ok) {
		throw new Error(
			`fal request failed (${response.status}): ${await response.text()}`,
		);
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

export async function getVideoGenerationStatus(args: {
	modelId: string;
	requestId: string;
	providerApiKey: string;
	mode: "shot" | "transition";
}): Promise<VideoGenerationStatus> {
	const request = decodeGenerationRef({
		modelId: args.modelId,
		generationId: args.requestId,
		mode: args.mode,
	});

	if (request.provider === "replicate") {
		const replicate = new Replicate({ auth: args.providerApiKey });
		const prediction = await replicate.predictions.get(request.requestId);

		if (prediction.status === "starting") {
			const key = `replicate:${request.requestId}`;
			const line = `[VideoProvider] status provider=replicate mode=${args.mode} model=${args.modelId} request=${request.requestId} stage=queued`;
			if (lastStatusLogByRequest.get(key) !== line) {
				console.info(line);
				lastStatusLogByRequest.set(key, line);
			}
			return { provider: "replicate", stage: "queued" };
		}
		if (prediction.status === "processing") {
			const key = `replicate:${request.requestId}`;
			const line = `[VideoProvider] status provider=replicate mode=${args.mode} model=${args.modelId} request=${request.requestId} stage=generating`;
			if (lastStatusLogByRequest.get(key) !== line) {
				console.info(line);
				lastStatusLogByRequest.set(key, line);
			}
			return { provider: "replicate", stage: "generating" };
		}
		if (prediction.status === "succeeded") {
			const urls = parseGeneratedMediaUrls(prediction.output);
			const key = `replicate:${request.requestId}`;
			const line = `[VideoProvider] status provider=replicate mode=${args.mode} model=${args.modelId} request=${request.requestId} stage=done output=${urls[0] ? "yes" : "no"}`;
			if (lastStatusLogByRequest.get(key) !== line) {
				console.info(line);
				lastStatusLogByRequest.set(key, line);
			}
			return {
				provider: "replicate",
				stage: "done",
				outputUrl: urls[0],
			};
		}
		if (prediction.status === "failed" || prediction.status === "canceled") {
			const rawError = prediction.error;
			console.warn(
				`[VideoProvider] status provider=replicate mode=${args.mode} model=${args.modelId} request=${request.requestId} stage=error providerStatus=${prediction.status}`,
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

	const statusResponse = await fetch(
		`${request.statusUrl || getFalStatusUrl(request.endpoint, request.requestId)}?logs=1`,
		{
			headers: getFalHeaders(args.providerApiKey),
		},
	);

	if (!statusResponse.ok) {
		throw new Error(
			`fal status failed (${statusResponse.status}): ${await statusResponse.text()}`,
		);
	}

	const status = (await statusResponse.json()) as {
		status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED";
		queue_position?: number;
		error?: string;
		error_type?: string;
	};

	if (status.status === "IN_QUEUE") {
		const key = `fal:${request.requestId}`;
		const line = `[VideoProvider] status provider=fal mode=${args.mode} model=${args.modelId} endpoint=${request.endpoint} request=${request.requestId} stage=queued queue=${status.queue_position ?? "?"}`;
		if (lastStatusLogByRequest.get(key) !== line) {
			console.info(line);
			lastStatusLogByRequest.set(key, line);
		}
		return {
			provider: "fal",
			stage: "queued",
			queuePosition: status.queue_position ?? null,
		};
	}

	if (status.status === "IN_PROGRESS") {
		const key = `fal:${request.requestId}`;
		const line = `[VideoProvider] status provider=fal mode=${args.mode} model=${args.modelId} endpoint=${request.endpoint} request=${request.requestId} stage=generating`;
		if (lastStatusLogByRequest.get(key) !== line) {
			console.info(line);
			lastStatusLogByRequest.set(key, line);
		}
		return { provider: "fal", stage: "generating" };
	}

	if (status.error) {
		console.warn(
			`[VideoProvider] status provider=fal mode=${args.mode} model=${args.modelId} endpoint=${request.endpoint} request=${request.requestId} stage=error errorType=${status.error_type ?? "unknown"}`,
		);
		return {
			provider: "fal",
			stage: "error",
			errorMessage: status.error_type
				? `${status.error} (${status.error_type})`
				: status.error,
		};
	}

	const resultResponse = await fetch(
		request.responseUrl || getFalResultUrl(request.endpoint, request.requestId),
		{
			headers: getFalHeaders(args.providerApiKey),
		},
	);

	if (!resultResponse.ok) {
		throw new Error(
			`fal result failed (${resultResponse.status}): ${await resultResponse.text()}`,
		);
	}

	const result = await resultResponse.json();
	const urls = parseGeneratedMediaUrls(result);
	const key = `fal:${request.requestId}`;
	const line = `[VideoProvider] status provider=fal mode=${args.mode} model=${args.modelId} endpoint=${request.endpoint} request=${request.requestId} stage=done output=${urls[0] ? "yes" : "no"}`;
	if (lastStatusLogByRequest.get(key) !== line) {
		console.info(line);
		lastStatusLogByRequest.set(key, line);
	}
	return {
		provider: "fal",
		stage: "done",
		outputUrl: urls[0],
	};
}
