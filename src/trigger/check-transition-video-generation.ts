import { logger, task, wait } from "@trigger.dev/sdk";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index";
import { transitionVideos } from "@/db/schema";
import {
	getVideoGenerationStatus,
	getVideoProviderApiKey,
} from "@/features/projects/video-generation-provider.server";
import { uploadFromUrl } from "@/lib/r2.server";
import { ERROR_MESSAGES, type MediaStage, VIDEO_TIMEOUTS } from "./types";

export interface CheckTransitionVideoGenerationPayload {
	transitionVideoId: string;
	userId: string;
	generationId: string;
}

type CheckTransitionVideoGenerationResult =
	| { status: "skipped"; reason: "stale-or-missing" }
	| { status: "done"; transitionVideoId: string }
	| { status: "error"; errorMessage: string };

async function loadActiveTransitionVideo(
	transitionVideoId: string,
	generationId: string,
) {
	const tv = await db.query.transitionVideos.findFirst({
		where: and(
			eq(transitionVideos.id, transitionVideoId),
			isNull(transitionVideos.deletedAt),
		),
	});

	if (
		!tv ||
		(tv.status !== "queued" &&
			tv.status !== "generating" &&
			tv.status !== "finalizing") ||
		!tv.generationId ||
		tv.generationId !== generationId
	) {
		return null;
	}

	return tv;
}

export const checkTransitionVideoGeneration = task({
	id: "check-transition-video-generation",
	queue: {
		name: "video-generation",
		concurrencyLimit: 3,
	},
	retry: {
		maxAttempts: 1,
	},

	run: async (
		payload: CheckTransitionVideoGenerationPayload,
	): Promise<CheckTransitionVideoGenerationResult> => {
		// Initial validation
		const initialTv = await loadActiveTransitionVideo(
			payload.transitionVideoId,
			payload.generationId,
		);
		if (!initialTv) {
			return {
				status: "skipped" as const,
				reason: "stale-or-missing" as const,
			};
		}

		const providerApiKey = await getVideoProviderApiKey({
			userId: payload.userId,
			modelId: initialTv.model,
		});

		let stage: MediaStage = "running";
		const logContext = {
			mediaType: "video" as const,
			rowId: payload.transitionVideoId,
			generationId: payload.generationId,
		};

		logger.info("Starting transition video poll loop", {
			...logContext,
			stage,
		});

		// Poll loop with wait.for() checkpoints
		while (true) {
			const prediction = await getVideoGenerationStatus({
				modelId: initialTv.model,
				requestId: payload.generationId,
				providerApiKey,
				mode: "transition",
			});

			if (prediction.stage === "queued") {
				await db
					.update(transitionVideos)
					.set({ status: "queued", errorMessage: null })
					.where(eq(transitionVideos.id, payload.transitionVideoId));
			}

			if (prediction.stage === "generating") {
				await db
					.update(transitionVideos)
					.set({ status: "generating", errorMessage: null })
					.where(eq(transitionVideos.id, payload.transitionVideoId));
			}

			if (prediction.stage === "done") {
				stage = "finalizing";
				await db
					.update(transitionVideos)
					.set({ status: "finalizing", errorMessage: null })
					.where(eq(transitionVideos.id, payload.transitionVideoId));
				logger.info("Provider succeeded, finalizing upload", {
					...logContext,
					stage,
				});
				if (!prediction.outputUrl?.startsWith("http")) {
					throw new Error("Unexpected output format from video provider");
				}

				const freshTv = await loadActiveTransitionVideo(
					payload.transitionVideoId,
					payload.generationId,
				);
				if (!freshTv) {
					logger.warn(
						"Transition video became stale during finalization",
						logContext,
					);
					return {
						status: "skipped" as const,
						reason: "stale-or-missing" as const,
					};
				}

				const storageKey = `projects/${freshTv.sceneId}/transitions/${payload.transitionVideoId}.mp4`;
				const storedUrl = await uploadFromUrl(
					prediction.outputUrl,
					storageKey,
					"video/mp4",
				);

				await db
					.update(transitionVideos)
					.set({
						url: storedUrl,
						storageKey,
						status: "done",
						errorMessage: null,
					})
					.where(eq(transitionVideos.id, payload.transitionVideoId));

				stage = "completed";
				logger.info("Transition video generation completed", {
					...logContext,
					stage,
				});
				return {
					status: "done" as const,
					transitionVideoId: payload.transitionVideoId,
				};
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
					.update(transitionVideos)
					.set({ status: "error", errorMessage })
					.where(eq(transitionVideos.id, payload.transitionVideoId));

				return { status: "error" as const, errorMessage };
			}

			// Check timeout before waiting
			const tv = await loadActiveTransitionVideo(
				payload.transitionVideoId,
				payload.generationId,
			);
			if (!tv) {
				logger.warn("Transition video became stale during polling", logContext);
				return {
					status: "skipped" as const,
					reason: "stale-or-missing" as const,
				};
			}

			if (
				Date.now() - tv.createdAt.getTime() >
				VIDEO_TIMEOUTS.TRANSITION_VIDEO_MS
			) {
				stage = "failed";
				const errorMessage = ERROR_MESSAGES.TIMED_OUT;
				logger.error("Transition video generation timed out", {
					...logContext,
					stage,
				});
				await db
					.update(transitionVideos)
					.set({ status: "error", errorMessage })
					.where(eq(transitionVideos.id, payload.transitionVideoId));
				return { status: "error" as const, errorMessage };
			}

			// Checkpoint: suspend and resume after interval
			logger.debug("Waiting for next poll interval", logContext);
			await wait.for({ seconds: VIDEO_TIMEOUTS.POLL_INTERVAL_SECONDS });
		}
	},

	onFailure: async ({ payload, error }) => {
		const tv = await loadActiveTransitionVideo(
			payload.transitionVideoId,
			payload.generationId,
		);
		if (!tv) {
			return;
		}

		const errorMessage =
			error instanceof Error
				? error.message
				: "Transition video generation failed";

		await db
			.update(transitionVideos)
			.set({ status: "error", errorMessage })
			.where(eq(transitionVideos.id, payload.transitionVideoId));
	},
});
