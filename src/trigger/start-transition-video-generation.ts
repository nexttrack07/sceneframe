import { task } from "@trigger.dev/sdk";
import { and, eq, isNull } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, transitionVideos, users } from "@/db/schema";
import type { VideoSettingValue } from "@/features/projects/project-types";
import { buildTransitionVideoInput } from "@/features/projects/video-models";
import { decryptUserApiKey } from "@/lib/encryption.server";
import { checkTransitionVideoGeneration } from "@/trigger/check-transition-video-generation";

export interface StartTransitionVideoGenerationPayload {
	transitionVideoId: string;
	userId: string;
	modelId: string;
	prompt: string;
	modelOptions: Record<string, VideoSettingValue>;
}

async function loadActiveTransitionVideo(transitionVideoId: string) {
	const tv = await db.query.transitionVideos.findFirst({
		where: and(
			eq(transitionVideos.id, transitionVideoId),
			isNull(transitionVideos.deletedAt),
		),
	});

	if (!tv || tv.status !== "generating") {
		return null;
	}

	return tv;
}

async function loadActiveTransitionVideoAttempt(
	transitionVideoId: string,
	generationId: string,
) {
	const tv = await loadActiveTransitionVideo(transitionVideoId);
	if (!tv || tv.generationId !== generationId) {
		return null;
	}

	return tv;
}

async function loadPendingStartTransitionVideo(transitionVideoId: string) {
	const tv = await loadActiveTransitionVideo(transitionVideoId);
	if (!tv || tv.generationId) {
		return null;
	}

	return tv;
}

export const startTransitionVideoGeneration = task({
	id: "start-transition-video-generation",
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

	run: async (payload: StartTransitionVideoGenerationPayload) => {
		const tv = await loadPendingStartTransitionVideo(payload.transitionVideoId);
		if (!tv) {
			return {
				status: "skipped" as const,
				reason: "stale-or-missing" as const,
			};
		}

		const [user, fromImage, toImage] = await Promise.all([
			db.query.users.findFirst({ where: eq(users.id, payload.userId) }),
			tv.fromImageId
				? db.query.assets.findFirst({
						where: and(eq(assets.id, tv.fromImageId), isNull(assets.deletedAt)),
					})
				: Promise.resolve(null),
			tv.toImageId
				? db.query.assets.findFirst({
						where: and(eq(assets.id, tv.toImageId), isNull(assets.deletedAt)),
					})
				: Promise.resolve(null),
		]);

		if (!user?.providerKeyEnc || !user?.providerKeyDek) {
			throw new Error("No Replicate API key found for user");
		}
		if (!fromImage?.url || !toImage?.url) {
			throw new Error("Transition images are missing");
		}

		const apiKey = decryptUserApiKey(user.providerKeyEnc, user.providerKeyDek);
		const replicate = new Replicate({ auth: apiKey });
		const replicateInput = buildTransitionVideoInput({
			modelId: payload.modelId,
			prompt: payload.prompt,
			modelOptions: payload.modelOptions,
			startImageUrl: fromImage.url,
			endImageUrl: toImage.url,
		});

		const prediction = await replicate.predictions.create({
			model: payload.modelId as `${string}/${string}`,
			input: replicateInput,
		});

		await db
			.update(transitionVideos)
			.set({ generationId: prediction.id })
			.where(eq(transitionVideos.id, payload.transitionVideoId));

		const freshTv = await loadActiveTransitionVideoAttempt(
			payload.transitionVideoId,
			prediction.id,
		);
		if (!freshTv) {
			return {
				status: "skipped" as const,
				reason: "stale-or-missing" as const,
			};
		}

		const handle = await checkTransitionVideoGeneration.trigger(
			{
				transitionVideoId: payload.transitionVideoId,
				userId: payload.userId,
				generationId: prediction.id,
			},
			{ delay: "30s" },
		);

		await db
			.update(transitionVideos)
			.set({ jobId: handle.id })
			.where(eq(transitionVideos.id, payload.transitionVideoId));

		return { status: "started" as const, predictionId: prediction.id };
	},

	onFailure: async ({ payload, error }) => {
		const tv = await loadActiveTransitionVideo(payload.transitionVideoId);
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
