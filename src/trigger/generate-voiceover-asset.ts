import { task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db/index";
import { assets } from "@/db/schema";
import { generateSpeech, getUserElevenLabsKey } from "@/lib/elevenlabs.server";
import { uploadBuffer } from "@/lib/r2.server";
import { loadActiveAsset } from "./helpers";

export interface GenerateVoiceoverAssetPayload {
	assetId: string;
	userId: string;
	projectId: string;
	sceneId: string;
	generationId: string;
	script: string;
	voiceId: string | null;
}

export const generateVoiceoverAsset = task({
	id: "generate-voiceover-asset",
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

	run: async (payload: GenerateVoiceoverAssetPayload) => {
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

		const elevenLabsKey = await getUserElevenLabsKey(payload.userId);
		const { audio, contentType } = await generateSpeech({
			apiKey: elevenLabsKey,
			text: payload.script,
			voiceId: payload.voiceId ?? undefined,
		});

		const storageKey = `projects/${payload.projectId}/scenes/${payload.sceneId}/voiceover/${payload.assetId}.mp3`;
		const publicUrl = await uploadBuffer(audio, storageKey, contentType);
		const estimatedDurationMs = Math.round((audio.length / 16_000) * 1000);

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
				durationMs: estimatedDurationMs,
				fileSizeBytes: audio.length,
				errorMessage: null,
			})
			.where(eq(assets.id, payload.assetId));

		return {
			status: "done" as const,
			assetId: payload.assetId,
			durationMs: estimatedDurationMs,
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
			error instanceof Error ? error.message : "Voiceover generation failed";

		await db
			.update(assets)
			.set({ status: "error", errorMessage })
			.where(eq(assets.id, payload.assetId));
	},
});
