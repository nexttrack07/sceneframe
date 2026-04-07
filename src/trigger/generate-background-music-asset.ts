import { task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, users } from "@/db/schema";
import {
	parseGeneratedMediaUrls,
	summarizeGenerationOutput,
} from "@/features/projects/image-generation-helpers.server";
import { decryptUserApiKey } from "@/lib/encryption.server";
import { uploadFromUrl } from "@/lib/r2.server";
import { loadActiveAsset } from "./helpers";

export interface GenerateBackgroundMusicAssetPayload {
	assetId: string;
	userId: string;
	projectId: string;
	sceneId: string;
	generationId: string;
	prompt: string;
	durationSeconds: number;
}

export const generateBackgroundMusicAsset = task({
	id: "generate-background-music-asset",
	queue: {
		name: "audio-generation",
		concurrencyLimit: 5,
	},
	retry: {
		maxAttempts: 3,
		factor: 2,
		minTimeoutInMs: 2000,
		maxTimeoutInMs: 60000,
	},

	run: async (payload: GenerateBackgroundMusicAssetPayload) => {
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
		const output = await replicate.run(
			"meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb",
			{
				input: {
					prompt: payload.prompt,
					duration: payload.durationSeconds,
					model_version: "stereo-melody-large",
					output_format: "mp3",
				},
			},
		);

		const urls = parseGeneratedMediaUrls(output);
		if (urls.length === 0) {
			throw new Error(
				`MusicGen returned no audio URL. Output: ${summarizeGenerationOutput(output)}`,
			);
		}

		const storageKey = `projects/${payload.projectId}/scenes/${payload.sceneId}/music/${payload.assetId}.mp3`;
		const publicUrl = await uploadFromUrl(urls[0], storageKey);

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
				url: publicUrl,
				storageKey,
				status: "done",
				durationMs: payload.durationSeconds * 1000,
				errorMessage: null,
			})
			.where(eq(assets.id, payload.assetId));

		return {
			status: "done" as const,
			assetId: payload.assetId,
			durationMs: payload.durationSeconds * 1000,
		};
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
			error instanceof Error
				? error.message
				: "Background music generation failed";

		await db
			.update(assets)
			.set({ status: "error", errorMessage })
			.where(eq(assets.id, payload.assetId));
	},
});
