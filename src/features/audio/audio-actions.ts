/**
 * Audio Server Actions
 *
 * Server functions for TTS generation, voice listing, and audio asset management.
 */

import { auth } from "@clerk/tanstack-react-start/server";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, projects } from "@/db/schema";
import { getUserElevenLabsKey } from "@/lib/elevenlabs.server";
import { getUserApiKey } from "@/features/projects/image-generation-helpers.server";
import { uploadBuffer } from "@/lib/r2.server";
import { createTTSProvider } from "./providers";

const TTS_MAX_CHARS = 5000;
const SUMMARIZE_MODEL = "anthropic/claude-4.5-haiku";
const REPLICATE_TIMEOUT_MS = 60_000;

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
// summarizeForVoiceover
// ---------------------------------------------------------------------------

export const summarizeForVoiceover = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			text: string;
			projectName?: string;
			targetDurationSec?: number;
		}) => data,
	)
	.handler(async ({ data: { text, projectName, targetDurationSec } }) => {
		const { userId } = await assertAuth();

		const trimmedText = text.trim();

		// If already under limit, return as-is
		if (trimmedText.length <= TTS_MAX_CHARS) {
			return { script: trimmedText, wasSummarized: false };
		}

		// Use LLM to condense into a voiceover-friendly script
		const targetWords = targetDurationSec
			? Math.round(targetDurationSec * 2.5)
			: 200; // ~80 seconds at 2.5 words/sec

		const apiKey = await getUserApiKey(userId);
		const replicate = new Replicate({ auth: apiKey });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

		try {
			const prompt = `You are a professional voiceover script writer. Convert the following content into a concise, engaging voiceover narration.

${projectName ? `PROJECT: ${projectName}\n` : ""}
ORIGINAL CONTENT:
${trimmedText}

REQUIREMENTS:
- Write 2-3 short paragraphs suitable for spoken narration
- Target approximately ${targetWords} words (${targetDurationSec ?? 80} seconds of audio)
- MUST be under ${TTS_MAX_CHARS} characters total
- Focus on the key narrative points and emotional arc
- Use natural, conversational language that sounds good when spoken
- Do NOT include stage directions, timestamps, or speaker labels
- Do NOT use quotes or markdown formatting

Return ONLY the voiceover script text, nothing else.`;

			const chunks: string[] = [];
			for await (const event of replicate.stream(SUMMARIZE_MODEL, {
				input: {
					prompt,
					max_tokens: 1024,
					temperature: 0.7,
				},
				signal: controller.signal,
			})) {
				chunks.push(String(event));
			}

			const script = chunks.join("").trim();
			if (!script) {
				throw new Error("AI returned an empty script");
			}

			// Safety check - if still over limit, truncate at sentence boundary
			if (script.length > TTS_MAX_CHARS) {
				const truncated = script.slice(0, TTS_MAX_CHARS);
				const lastPeriod = Math.max(
					truncated.lastIndexOf("."),
					truncated.lastIndexOf("!"),
					truncated.lastIndexOf("?"),
				);
				if (lastPeriod > TTS_MAX_CHARS * 0.7) {
					return {
						script: truncated.slice(0, lastPeriod + 1).trim(),
						wasSummarized: true,
					};
				}
				return { script: truncated.trim(), wasSummarized: true };
			}

			return { script, wasSummarized: true };
		} finally {
			clearTimeout(timeout);
		}
	});

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
