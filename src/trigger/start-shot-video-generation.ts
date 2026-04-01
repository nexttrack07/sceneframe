import { task } from "@trigger.dev/sdk";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/index";
import { assets } from "@/db/schema";
import type { VideoSettingValue } from "@/features/projects/project-types";
import {
	getVideoProviderApiKey,
	submitVideoGeneration,
} from "@/features/projects/video-generation-provider.server";
import { buildShotVideoInput } from "@/features/projects/video-models";
import { checkShotVideoGeneration } from "./check-shot-video-generation";

export interface StartShotVideoGenerationPayload {
	assetId: string;
	userId: string;
	modelId: string;
	prompt: string;
	modelOptions: Record<string, VideoSettingValue>;
	/** Optional: specific image IDs to use as references. If omitted, this runs as prompt-only video generation. */
	referenceImageIds?: string[];
}

type StartShotVideoGenerationResult =
	| { status: "skipped"; reason: "stale-or-missing" | "already-started" }
	| { status: "started"; predictionId: string };

async function loadActiveVideoAsset(assetId: string) {
	const asset = await db.query.assets.findFirst({
		where: and(
			eq(assets.id, assetId),
			eq(assets.stage, "video"),
			eq(assets.type, "video"),
			isNull(assets.deletedAt),
		),
	});

	if (
		!asset ||
		(asset.status !== "queued" &&
			asset.status !== "generating" &&
			asset.status !== "finalizing")
	) {
		return null;
	}

	return asset;
}

async function loadPendingStartVideoAsset(assetId: string) {
	const asset = await loadActiveVideoAsset(assetId);
	if (!asset || asset.generationId) {
		return null;
	}

	return asset;
}

export const startShotVideoGeneration = task({
	id: "start-shot-video-generation",
	queue: {
		name: "video-generation",
		concurrencyLimit: 3,
	},
	retry: {
		maxAttempts: 2,
		factor: 2,
		minTimeoutInMs: 5000,
		maxTimeoutInMs: 120000,
	},

	run: async (
		payload: StartShotVideoGenerationPayload,
	): Promise<StartShotVideoGenerationResult> => {
		const asset = await loadPendingStartVideoAsset(payload.assetId);
		if (!asset) {
			return {
				status: "skipped" as const,
				reason: "stale-or-missing" as const,
			};
		}

		if (!asset.shotId) {
			throw new Error("Shot video asset is missing its shot reference");
		}

		// If specific reference image IDs are provided, use them in the given order.
		const [providerApiKey, fetchedReferenceImages] = await Promise.all([
			getVideoProviderApiKey({
				userId: payload.userId,
				modelId: payload.modelId,
			}),
			payload.referenceImageIds?.length
				? db.query.assets.findMany({
						where: and(
							inArray(assets.id, payload.referenceImageIds),
							inArray(assets.type, ["start_image", "end_image", "image"]),
							eq(assets.status, "done"),
							isNull(assets.deletedAt),
						),
					})
				: Promise.resolve([]),
		]);

		const orderedReferenceImages = payload.referenceImageIds?.length
			? payload.referenceImageIds
					.map(
						(id) =>
							fetchedReferenceImages.find((image) => image.id === id) ?? null,
					)
					.filter(
						(
							image,
						): image is NonNullable<(typeof fetchedReferenceImages)[number]> =>
							Boolean(image?.url),
					)
			: [];
		const referenceImageUrls = orderedReferenceImages
			.map((image) => image.url)
			.filter((url): url is string => Boolean(url));

		const prediction = await submitVideoGeneration({
			modelId: payload.modelId,
			providerApiKey,
			mode: "shot",
			input: buildShotVideoInput({
				modelId: payload.modelId,
				prompt: payload.prompt,
				modelOptions: payload.modelOptions,
				startImageUrl: referenceImageUrls[0],
				referenceImageUrls: referenceImageUrls,
			}),
		});

		await db
			.update(assets)
			.set({
				generationId: prediction.requestId,
				status: prediction.initialStatus,
			})
			.where(eq(assets.id, payload.assetId));

		console.info(
			`[ShotVideoTrigger] started asset=${payload.assetId} model=${payload.modelId} generation=${prediction.requestId} status=${prediction.initialStatus}${prediction.queuePosition ? ` queue=${prediction.queuePosition}` : ""}`,
		);

		const freshAsset = await loadActiveVideoAsset(payload.assetId);
		if (!freshAsset || freshAsset.generationId !== prediction.requestId) {
			return {
				status: "skipped" as const,
				reason: "stale-or-missing" as const,
			};
		}

		const handle = await checkShotVideoGeneration.trigger(
			{
				assetId: payload.assetId,
				userId: payload.userId,
				generationId: prediction.requestId,
			},
			{ delay: "30s" },
		);

		await db
			.update(assets)
			.set({ jobId: handle.id })
			.where(eq(assets.id, payload.assetId));

		return {
			status: "started" as const,
			predictionId: prediction.requestId,
		};
	},

	onFailure: async ({ payload, error }) => {
		const asset = await loadActiveVideoAsset(payload.assetId);
		if (!asset) {
			return;
		}

		const errorMessage =
			error instanceof Error ? error.message : "Shot video generation failed";

		await db
			.update(assets)
			.set({ status: "error", errorMessage })
			.where(eq(assets.id, payload.assetId));
	},
});
