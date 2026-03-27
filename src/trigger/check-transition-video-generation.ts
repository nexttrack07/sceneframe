import { logger, task, wait } from "@trigger.dev/sdk";
import { and, eq, isNull } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { transitionVideos, users } from "@/db/schema";
import { summarizeGenerationOutput } from "@/features/projects/image-generation-helpers.server";
import { decryptUserApiKey } from "@/lib/encryption.server";
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
		tv.status !== "generating" ||
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
			rowId: payload.transitionVideoId,
			generationId: payload.generationId,
		};

		logger.info("Starting transition video poll loop", {
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
				const storedUrl = await uploadFromUrl(str, storageKey, "video/mp4");

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

			if (prediction.status === "failed" || prediction.status === "canceled") {
				stage = "failed";
				const rawErr = prediction.error;
				const errorMessage = rawErr
					? typeof rawErr === "string"
						? rawErr
						: (((rawErr as Record<string, unknown>).detail as string) ??
							JSON.stringify(rawErr))
					: ERROR_MESSAGES.GENERATION_FAILED;

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
