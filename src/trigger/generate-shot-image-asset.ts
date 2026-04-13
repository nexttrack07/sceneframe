import { task } from "@trigger.dev/sdk";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/index";
import { assets, shots } from "@/db/schema";
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

async function hasSelectedShotImage(shotId: string) {
	const selectedImage = await db.query.assets.findFirst({
		where: and(
			eq(assets.shotId, shotId),
			inArray(assets.type, ["start_image", "end_image", "image"]),
			eq(assets.isSelected, true),
			eq(assets.status, "done"),
			isNull(assets.deletedAt),
		),
	});
	return Boolean(selectedImage?.url);
}

async function generateAdjacentTransitionPromptsForShot(shotId: string) {
	const shotRow = await db.query.shots.findFirst({
		where: and(eq(shots.id, shotId), isNull(shots.deletedAt)),
	});
	if (!shotRow) return;

	const projectShots = await db.query.shots.findMany({
		where: and(eq(shots.projectId, shotRow.projectId), isNull(shots.deletedAt)),
		orderBy: asc(shots.order),
	});
	const shotIndex = projectShots.findIndex((s) => s.id === shotId);
	if (shotIndex < 0) return;

	const adjacentPairs = [
		shotIndex > 0
			? { fromShotId: projectShots[shotIndex - 1].id, toShotId: shotId }
			: null,
		shotIndex < projectShots.length - 1
			? { fromShotId: shotId, toShotId: projectShots[shotIndex + 1].id }
			: null,
	].filter((pair): pair is { fromShotId: string; toShotId: string } => pair !== null);

	await Promise.allSettled(
		adjacentPairs.map(async (pair) => {
			const [hasFromImage, hasToImage] = await Promise.all([
				hasSelectedShotImage(pair.fromShotId),
				hasSelectedShotImage(pair.toShotId),
			]);
			if (!hasFromImage || !hasToImage) return;

			const { generateAndSaveTransitionPromptForPair } = await import(
				"@/features/projects/transition-prompt-drafts.server"
			);
			await generateAndSaveTransitionPromptForPair({
				fromShotId: pair.fromShotId,
				toShotId: pair.toShotId,
				useProjectContext: true,
				usePrevShotContext: true,
				assetTypeOverride: "auto",
			});
		}),
	);
}

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

		// Check if there's already a selected image for this shot
		const existingSelected = await db.query.assets.findFirst({
			where: and(
				eq(assets.shotId, payload.shotId),
				inArray(assets.type, ["start_image", "end_image", "image"]),
				eq(assets.isSelected, true),
				eq(assets.status, "done"),
				isNull(assets.deletedAt),
			),
		});

		// If no selected image exists, auto-select this one
		const shouldAutoSelect = !existingSelected;

		await db
			.update(assets)
			.set({
				url: storedUrl,
				storageKey,
				status: "done",
				errorMessage: null,
				generationDurationMs,
				...(shouldAutoSelect && { isSelected: true }),
			})
			.where(eq(assets.id, payload.assetId));

		// If we auto-selected this image, trigger adjacent transition prompt generation
		if (shouldAutoSelect) {
			void generateAdjacentTransitionPromptsForShot(payload.shotId).catch(
				(error) => {
					console.error(
						`[generateShotImageAsset] Failed to generate adjacent transition prompts for shot ${payload.shotId}`,
						error,
					);
				},
			);
		}

		return { status: "done" as const, assetId: payload.assetId, autoSelected: shouldAutoSelect };
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
