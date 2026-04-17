/**
 * Trigger task for generating audio for a segment.
 *
 * This task generates TTS audio for an audio segment using ElevenLabs,
 * uploads the result to R2, and updates the asset and segment status.
 */

import { task } from "@trigger.dev/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db/index";
import { assets, audioSegments } from "@/db/schema";
import { generateSpeech, getUserElevenLabsKey } from "@/lib/elevenlabs.server";
import { uploadBuffer } from "@/lib/r2.server";
import { loadActiveAsset } from "./helpers";
import { QUEUES, RETRY_CONFIGS } from "./types";

export interface GenerateSegmentAudioPayload {
	assetId: string;
	segmentId: string;
	userId: string;
	projectId: string;
	generationId: string;
	script: string;
	voiceId: string;
}

export const generateSegmentAudioAsset = task({
	id: "generate-segment-audio-asset",
	queue: {
		name: QUEUES.AUDIO_GENERATION,
		concurrencyLimit: 5,
	},
	retry: RETRY_CONFIGS.audio,

	run: async (payload: GenerateSegmentAudioPayload) => {
		// Check if asset is still active (not deleted or superseded)
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

		// Get the user's ElevenLabs API key
		const elevenLabsKey = await getUserElevenLabsKey(payload.userId);

		// Generate the audio
		const { audio, contentType } = await generateSpeech({
			apiKey: elevenLabsKey,
			text: payload.script,
			voiceId: payload.voiceId,
		});

		// Upload to R2
		const storageKey = `projects/${payload.projectId}/segments/${payload.segmentId}/audio/${payload.assetId}.mp3`;
		const publicUrl = await uploadBuffer(audio, storageKey, contentType);

		// Estimate duration (rough: ~16KB per second for MP3 at 128kbps)
		const estimatedDurationMs = Math.round((audio.length / 16_000) * 1000);

		// Re-check asset is still active before updating
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

		// Update the asset
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

		// Update the segment status and link the asset
		await db
			.update(audioSegments)
			.set({
				status: "done",
				voiceoverAssetId: payload.assetId,
				updatedAt: new Date(),
			})
			.where(eq(audioSegments.id, payload.segmentId));

		return {
			status: "done" as const,
			assetId: payload.assetId,
			segmentId: payload.segmentId,
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
			error instanceof Error ? error.message : "Audio generation failed";

		// Update asset status to error
		await db
			.update(assets)
			.set({ status: "error", errorMessage })
			.where(eq(assets.id, payload.assetId));

		// Update segment status to error
		await db
			.update(audioSegments)
			.set({
				status: "error",
				updatedAt: new Date(),
			})
			.where(eq(audioSegments.id, payload.segmentId));
	},
});
