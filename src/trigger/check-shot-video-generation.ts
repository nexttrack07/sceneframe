import { logger, task, wait } from "@trigger.dev/sdk";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index";
import { assets } from "@/db/schema";
import {
	getVideoGenerationStatus,
	getVideoProviderApiKey,
} from "@/features/projects/video-generation-provider.server";
import { uploadFromUrl } from "@/lib/r2.server";
import { ERROR_MESSAGES, type MediaStage, VIDEO_TIMEOUTS } from "./types";

export interface CheckShotVideoGenerationPayload {
	assetId: string;
	userId: string;
	generationId: string;
}

type CheckShotVideoGenerationResult =
	| { status: "skipped"; reason: "stale-or-missing" }
	| { status: "done"; assetId: string }
	| { status: "error"; errorMessage: string };

async function loadActiveVideoAsset(assetId: string, generationId: string) {
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
			asset.status !== "finalizing") ||
		!asset.generationId ||
		asset.generationId !== generationId
	) {
		return null;
	}

	return asset;
}

export const checkShotVideoGeneration = task({
	id: "check-shot-video-generation",
	queue: {
		name: "video-generation",
		concurrencyLimit: 3,
	},
	retry: {
		maxAttempts: 1,
	},

	run: async (
		payload: CheckShotVideoGenerationPayload,
	): Promise<CheckShotVideoGenerationResult> => {
		// Initial validation
		const initialAsset = await loadActiveVideoAsset(
			payload.assetId,
			payload.generationId,
		);
		if (!initialAsset) {
			return {
				status: "skipped" as const,
				reason: "stale-or-missing" as const,
			};
		}

		const providerApiKey = await getVideoProviderApiKey({
			userId: payload.userId,
			modelId: initialAsset.model ?? "kwaivgi/kling-v3-omni-video",
		});

		let stage: MediaStage = "running";
		const logContext = {
			mediaType: "video" as const,
			rowId: payload.assetId,
			generationId: payload.generationId,
		};

		logger.info("Starting video generation poll loop", {
			...logContext,
			stage,
		});

		// Poll loop with wait.for() checkpoints
		while (true) {
			const prediction = await getVideoGenerationStatus({
				modelId: initialAsset.model ?? "kwaivgi/kling-v3-omni-video",
				requestId: payload.generationId,
				providerApiKey,
				mode: "shot",
			});

			if (prediction.stage === "queued") {
				await db
					.update(assets)
					.set({ status: "queued", errorMessage: null })
					.where(eq(assets.id, payload.assetId));
			}

			if (prediction.stage === "generating") {
				await db
					.update(assets)
					.set({ status: "generating", errorMessage: null })
					.where(eq(assets.id, payload.assetId));
			}

			if (prediction.stage === "done") {
				stage = "finalizing";
				await db
					.update(assets)
					.set({ status: "finalizing", errorMessage: null })
					.where(eq(assets.id, payload.assetId));
				logger.info("Provider succeeded, finalizing upload", {
					...logContext,
					stage,
				});

				if (!prediction.outputUrl?.startsWith("http")) {
					throw new Error("Unexpected output format from video provider");
				}

				const freshAsset = await loadActiveVideoAsset(
					payload.assetId,
					payload.generationId,
				);
				if (!freshAsset?.projectId || !freshAsset.shotId) {
					logger.warn("Asset became stale during finalization", logContext);
					return {
						status: "skipped" as const,
						reason: "stale-or-missing" as const,
					};
				}

				const storageKey = `projects/${freshAsset.projectId}/shots/${freshAsset.shotId}/videos/${payload.assetId}.mp4`;
				const storedUrl = await uploadFromUrl(
					prediction.outputUrl,
					storageKey,
					"video/mp4",
				);

				await db
					.update(assets)
					.set({
						url: storedUrl,
						storageKey,
						status: "done",
						errorMessage: null,
					})
					.where(eq(assets.id, payload.assetId));

				stage = "completed";
				logger.info("Video generation completed", { ...logContext, stage });
				return { status: "done" as const, assetId: payload.assetId };
			}

			if (prediction.stage === "error") {
				stage = "failed";
				const errorMessage =
					prediction.errorMessage ?? ERROR_MESSAGES.GENERATION_FAILED;

				logger.error("Provider returned failure", {
					...logContext,
					stage,
					errorMessage,
				});

				await db
					.update(assets)
					.set({ status: "error", errorMessage })
					.where(eq(assets.id, payload.assetId));

				return { status: "error" as const, errorMessage };
			}

			// Check timeout before waiting
			const asset = await loadActiveVideoAsset(
				payload.assetId,
				payload.generationId,
			);
			if (!asset) {
				logger.warn("Asset became stale during polling", logContext);
				return {
					status: "skipped" as const,
					reason: "stale-or-missing" as const,
				};
			}

			if (
				Date.now() - asset.createdAt.getTime() >
				VIDEO_TIMEOUTS.SHOT_VIDEO_MS
			) {
				stage = "failed";
				const errorMessage = ERROR_MESSAGES.TIMED_OUT;
				logger.error("Video generation timed out", { ...logContext, stage });
				await db
					.update(assets)
					.set({ status: "error", errorMessage })
					.where(eq(assets.id, payload.assetId));
				return { status: "error" as const, errorMessage };
			}

			// Checkpoint: suspend and resume after interval
			logger.debug("Waiting for next poll interval", logContext);
			await wait.for({ seconds: VIDEO_TIMEOUTS.POLL_INTERVAL_SECONDS });
		}
	},

	onFailure: async ({ payload, error }) => {
		const asset = await loadActiveVideoAsset(
			payload.assetId,
			payload.generationId,
		);
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
