/**
 * Audio Server Actions
 *
 * Server functions for TTS generation, voice listing, and audio asset management.
 */

import { auth } from "@clerk/tanstack-react-start/server";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index";
import { assets, projects } from "@/db/schema";
import { getUserElevenLabsKey } from "@/lib/elevenlabs.server";
import { uploadBuffer } from "@/lib/r2.server";
import { createTTSProvider } from "./providers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceInfo {
	id: string;
	name: string;
	previewUrl?: string;
	labels?: {
		accent?: string;
		description?: string;
		age?: string;
		gender?: string;
		useCase?: string;
	};
	category?: string;
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function assertAuth() {
	const { userId } = await auth();
	if (!userId) throw new Error("Unauthenticated");
	return { userId };
}

// ---------------------------------------------------------------------------
// listVoices
// ---------------------------------------------------------------------------

export const listVoices = createServerFn({ method: "GET" })
	.inputValidator(
		(data: { provider?: "elevenlabs" | "openai" | "playht" }) => data,
	)
	.handler(async ({ data: { provider = "elevenlabs" } }): Promise<VoiceInfo[]> => {
		const { userId } = await assertAuth();

		// Currently only ElevenLabs is implemented
		if (provider !== "elevenlabs") {
			throw new Error(`Provider ${provider} not yet implemented`);
		}

		const apiKey = await getUserElevenLabsKey(userId);
		const ttsProvider = createTTSProvider({
			provider: "elevenlabs",
			apiKey,
		});

		const voices = await ttsProvider.listVoices();

		// Map to serializable format
		return voices.map((v) => ({
			id: v.id,
			name: v.name,
			previewUrl: v.previewUrl,
			labels: v.labels,
			category: v.metadata?.category,
		}));
	});

// ---------------------------------------------------------------------------
// generateVoiceover
// ---------------------------------------------------------------------------

export const generateVoiceover = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			text: string;
			voiceId: string;
			shotId?: string;
			options?: {
				stability?: number;
				similarityBoost?: number;
				style?: number;
				model?: string;
			};
		}) => data,
	)
	.handler(async ({ data: { projectId, text, voiceId, shotId, options } }) => {
		const { userId } = await assertAuth();

		// Validate inputs
		if (!text.trim()) throw new Error("Text is required");
		if (text.length > 5000)
			throw new Error("Text must be 5000 characters or less");
		if (!voiceId) throw new Error("Voice ID is required");

		// Verify project ownership
		const project = await db.query.projects.findFirst({
			where: and(
				eq(projects.id, projectId),
				eq(projects.userId, userId),
				isNull(projects.deletedAt),
			),
		});

		if (!project) {
			throw new Error("Project not found");
		}

		// Get API key and create provider
		const apiKey = await getUserElevenLabsKey(userId);
		const provider = createTTSProvider({
			provider: "elevenlabs",
			apiKey,
		});

		// Generate speech
		const result = await provider.generateSpeech(text, voiceId, options);

		// Upload to R2
		const fileName = `voiceover-${Date.now()}.mp3`;
		const storageKey = `projects/${projectId}/audio/${fileName}`;

		const url = await uploadBuffer(result.audio, storageKey, result.contentType);

		// Create asset record
		const [asset] = await db
			.insert(assets)
			.values({
				projectId,
				shotId: shotId ?? null,
				type: "voiceover",
				stage: "audio",
				prompt: text,
				model: options?.model ?? "eleven_multilingual_v2",
				url,
				storageKey,
				status: "done",
				isSelected: false,
			})
			.returning();

		return {
			assetId: asset.id,
			url: asset.url,
			charactersUsed: result.charactersUsed,
		};
	});

// ---------------------------------------------------------------------------
// selectVoiceover
// ---------------------------------------------------------------------------

export const selectVoiceover = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string; assetId: string }) => data)
	.handler(async ({ data: { projectId, assetId } }) => {
		const { userId } = await assertAuth();

		// Verify project ownership
		const project = await db.query.projects.findFirst({
			where: and(
				eq(projects.id, projectId),
				eq(projects.userId, userId),
				isNull(projects.deletedAt),
			),
		});

		if (!project) {
			throw new Error("Project not found");
		}

		// Verify asset exists and belongs to project
		const asset = await db.query.assets.findFirst({
			where: and(
				eq(assets.id, assetId),
				eq(assets.projectId, projectId),
				eq(assets.type, "voiceover"),
				isNull(assets.deletedAt),
			),
		});

		if (!asset) {
			throw new Error("Voiceover asset not found");
		}

		// Deselect all other voiceovers for this project
		await db
			.update(assets)
			.set({ isSelected: false })
			.where(
				and(
					eq(assets.projectId, projectId),
					eq(assets.type, "voiceover"),
					eq(assets.isSelected, true),
					isNull(assets.deletedAt),
				),
			);

		// Select the new one
		await db
			.update(assets)
			.set({ isSelected: true })
			.where(eq(assets.id, assetId));

		return { success: true };
	});

// ---------------------------------------------------------------------------
// listProjectVoiceovers
// ---------------------------------------------------------------------------

export const listProjectVoiceovers = createServerFn({ method: "GET" })
	.inputValidator((data: { projectId: string }) => data)
	.handler(async ({ data: { projectId } }) => {
		const { userId } = await assertAuth();

		// Verify project ownership
		const project = await db.query.projects.findFirst({
			where: and(
				eq(projects.id, projectId),
				eq(projects.userId, userId),
				isNull(projects.deletedAt),
			),
		});

		if (!project) {
			throw new Error("Project not found");
		}

		const voiceovers = await db.query.assets.findMany({
			where: and(
				eq(assets.projectId, projectId),
				eq(assets.type, "voiceover"),
				isNull(assets.deletedAt),
			),
			orderBy: (assets, { desc }) => [desc(assets.createdAt)],
		});

		// Return serializable subset
		return voiceovers.map((v) => ({
			id: v.id,
			url: v.url,
			prompt: v.prompt,
			model: v.model,
			status: v.status,
			isSelected: v.isSelected,
			durationMs: v.durationMs,
			createdAt: v.createdAt.toISOString(),
		}));
	});

// ---------------------------------------------------------------------------
// getVoiceUsage
// ---------------------------------------------------------------------------

export const getVoiceUsage = createServerFn({ method: "GET" }).handler(
	async () => {
		const { userId } = await assertAuth();

		const apiKey = await getUserElevenLabsKey(userId);
		const provider = createTTSProvider({
			provider: "elevenlabs",
			apiKey,
		});

		if (!provider.getUsage) {
			return null;
		}

		const usage = await provider.getUsage();
		return {
			charactersUsed: usage.charactersUsed,
			charactersLimit: usage.charactersLimit,
			resetDate: usage.resetDate?.toISOString() ?? null,
		};
	},
);
