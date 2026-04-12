import { task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db/index";
import { assets } from "@/db/schema";
import {
	generateImageSync,
	getImageProviderApiKey,
} from "@/features/projects/image-generation-provider.server";
import {
	buildImageModelInput,
	determineImageGenerationMode,
	getImageOutputContentType,
	getImageOutputFormat,
} from "@/features/projects/image-models";
import type { ImageSettingValue } from "@/features/projects/project-types";
import { uploadFromUrl } from "@/lib/r2.server";
import { loadActiveAsset } from "./helpers";

export interface GenerateShotImageAssetPayload {
	assetId: string;
	userId: string;
	projectId: string;
	shotId: string;
	generationId: string;
	batchId: string;
	sequenceIndex: number;
	prompt: string;
	model: string;
	modelOptions: Record<string, ImageSettingValue>;
	referenceImageUrls: string[];
}

export const generateShotImageAsset = task({
	id: "generate-shot-image-asset",
	queue: {
		name: "image-generation",
		concurrencyLimit: 10,
	},
	retry: {
		maxAttempts: 3,
		factor: 2,
		minTimeoutInMs: 1000,
		maxTimeoutInMs: 30000,
	},

	run: async (payload: GenerateShotImageAssetPayload) => {
		const activeAsset = await loadActiveAsset(
			payload.assetId,
			payload.generationId,
		);
		if (!activeAsset) {
			return {
				status: "skipped" as const,
				reason: "stale-or-missing" as const,
			};
		}

		const apiKey = await getImageProviderApiKey({
			userId: payload.userId,
			modelId: payload.model,
		});
		const outputFormat = getImageOutputFormat(
			payload.model,
			payload.modelOptions,
		);
		const outputContentType = getImageOutputContentType(outputFormat);
		const mode = determineImageGenerationMode({
			referenceImageUrls: payload.referenceImageUrls,
		});
		const modelInput = buildImageModelInput({
			modelId: payload.model,
			prompt: payload.prompt,
			modelOptions: payload.modelOptions,
			referenceImageUrls: payload.referenceImageUrls,
			mode,
		});

		const generationStartTime = Date.now();
		const urls = await generateImageSync({
			modelId: payload.model,
			input: modelInput,
			providerApiKey: apiKey,
			mode,
		});
		const generationDurationMs = Date.now() - generationStartTime;

		const sourceUrl = urls[0];

		if (!sourceUrl) {
			throw new Error("No output URL found from image generation.");
		}

		const storageKey = `projects/${payload.projectId}/shots/${payload.shotId}/images/${payload.batchId}/image-${payload.sequenceIndex + 1}.${outputFormat}`;
		const storedUrl = await uploadFromUrl(
			sourceUrl,
			storageKey,
			outputContentType,
		);

		const freshAsset = await loadActiveAsset(
			payload.assetId,
			payload.generationId,
		);
		if (!freshAsset) {
			return {
				status: "skipped" as const,
				reason: "stale-or-missing" as const,
			};
		}

		await db
			.update(assets)
			.set({
				url: storedUrl,
				storageKey,
				status: "done",
				errorMessage: null,
				generationDurationMs,
			})
			.where(eq(assets.id, payload.assetId));

		return { status: "done" as const, assetId: payload.assetId };
	},

	onFailure: async ({ payload, error }) => {
		const activeAsset = await loadActiveAsset(
			payload.assetId,
			payload.generationId,
		);
		if (!activeAsset) {
			return;
		}

		const errorMessage =
			error instanceof Error ? error.message : "Image generation failed";

		await db
			.update(assets)
			.set({ status: "error", errorMessage })
			.where(eq(assets.id, payload.assetId));
	},
});
