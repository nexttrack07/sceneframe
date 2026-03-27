import { logger, task, wait } from "@trigger.dev/sdk";
import { and, eq, isNull } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, users } from "@/db/schema";
import { summarizeGenerationOutput } from "@/features/projects/image-generation-helpers.server";
import { decryptUserApiKey } from "@/lib/encryption.server";
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
		asset.status !== "generating" ||
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

		// Load user credentials once
		const user = await db.query.users.findFirst({
			where: eq(users.id, payload.userId),
		});
		if (!user?.providerKeyEnc || !user?.providerKeyDek) {
			throw new Error("No Replicate API key found for user");
		}

		const apiKey = decryptUserApiKey(user.providerKeyEnc, user.providerKeyDek);
		const replicate = new Replicate({ auth: apiKey });

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
			const prediction = await replicate.predictions.get(payload.generationId);

			if (prediction.status === "succeeded") {
				stage = "finalizing";
				logger.info("Provider succeeded, finalizing upload", {
					...logContext,
					stage,
				});

				const output = prediction.output;
				const raw = output as string | { toString(): string };
				const str = typeof raw === "string" ? raw : String(raw);
				if (!str.startsWith("http")) {
					throw new Error(
						`Unexpected output format from Kling: ${summarizeGenerationOutput(output)}`,
					);
				}

				const freshAsset = await loadActiveVideoAsset(
					payload.assetId,
					payload.generationId,
				);
				if (!freshAsset?.sceneId || !freshAsset.shotId) {
					logger.warn("Asset became stale during finalization", logContext);
					return {
						status: "skipped" as const,
						reason: "stale-or-missing" as const,
					};
				}

				const storageKey = `projects/${freshAsset.sceneId}/shots/${freshAsset.shotId}/videos/${payload.assetId}.mp4`;
				const storedUrl = await uploadFromUrl(str, storageKey, "video/mp4");

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

			if (prediction.status === "failed" || prediction.status === "canceled") {
				stage = "failed";
				const rawError = prediction.error;
				const errorMessage = rawError
					? typeof rawError === "string"
						? rawError
						: JSON.stringify(rawError)
					: ERROR_MESSAGES.GENERATION_FAILED;

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
