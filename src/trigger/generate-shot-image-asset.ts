import { task } from "@trigger.dev/sdk";
import { and, eq } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, scenes, users } from "@/db/schema";
import {
	parseGeneratedMediaUrls,
	summarizeGenerationOutput,
} from "@/features/projects/image-generation-helpers.server";
import {
	buildImageModelInput,
	getImageOutputContentType,
	getImageOutputFormat,
} from "@/features/projects/image-models";
import type { ImageSettingValue } from "@/features/projects/project-types";
import { decryptUserApiKey } from "@/lib/encryption.server";
import { uploadFromUrl } from "@/lib/r2.server";
import { loadActiveAsset } from "./helpers";

export interface GenerateShotImageAssetPayload {
	assetId: string;
	userId: string;
	projectId: string;
	sceneId: string;
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

		const user = await db.query.users.findFirst({
			where: eq(users.id, payload.userId),
		});
		if (!user?.providerKeyEnc || !user?.providerKeyDek) {
			throw new Error("No Replicate API key found for user");
		}

		const apiKey = decryptUserApiKey(user.providerKeyEnc, user.providerKeyDek);
		const replicate = new Replicate({ auth: apiKey });
		const outputFormat = getImageOutputFormat(
			payload.model,
			payload.modelOptions,
		);
		const outputContentType = getImageOutputContentType(outputFormat);
		const replicateInput = buildImageModelInput({
			modelId: payload.model,
			prompt: payload.prompt,
			modelOptions: payload.modelOptions,
			referenceImageUrls: payload.referenceImageUrls,
		});

		const output = await replicate.run(payload.model as `${string}/${string}`, {
			input: replicateInput,
		});

		const urls = parseGeneratedMediaUrls(output);
		const sourceUrl = urls[0];

		if (!sourceUrl) {
			throw new Error(
				`No output URL found (${summarizeGenerationOutput(output)}).`,
			);
		}

		const storageKey = `projects/${payload.projectId}/scenes/${payload.sceneId}/shots/${payload.shotId}/images/${payload.batchId}/image-${payload.sequenceIndex + 1}.${outputFormat}`;
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
			})
			.where(eq(assets.id, payload.assetId));

		await db
			.update(scenes)
			.set({ stage: "images" })
			.where(and(eq(scenes.id, payload.sceneId), eq(scenes.stage, "script")));

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
