import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { runs } from "@trigger.dev/sdk";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, shots } from "@/db/schema";
import {
	assertAssetOwner,
	assertProjectOwner,
} from "@/lib/assert-project-owner.server";
import { getUserElevenLabsKey, listVoices } from "@/lib/elevenlabs.server";
import { cleanupStorageKeys } from "@/lib/r2-cleanup.server";
import {
	generateBackgroundMusicAsset,
	generateSfxAsset,
	generateVoiceoverAsset,
} from "@/trigger";
import { getUserApiKey } from "./image-generation-helpers.server";
import { normalizeProjectSettings } from "./project-normalize";
import type { TriggerRunSummary, TriggerRunUiStatus } from "./project-types";

const MAX_MESSAGE_LENGTH = 5_000;
const REPLICATE_TIMEOUT_MS = 60_000;
const AUDIO_PROMPT_MODEL = "google/gemini-2.5-flash";
const AUDIO_PROMPT_MAX_OUTPUT_TOKENS = 2048;
const ELEVENLABS_SFX_MAX_PROMPT_CHARS = 450;

function clampAudioPrompt(prompt: string, maxLength: number) {
	const trimmed = prompt.trim();
	if (trimmed.length <= maxLength) return trimmed;

	const clipped = trimmed.slice(0, maxLength).trimEnd();
	const sentenceBreak = Math.max(
		clipped.lastIndexOf("."),
		clipped.lastIndexOf("!"),
		clipped.lastIndexOf("?"),
	);
	if (sentenceBreak >= Math.floor(maxLength * 0.6)) {
		return clipped.slice(0, sentenceBreak + 1).trim();
	}

	return clipped;
}

// ---------------------------------------------------------------------------
// mapTriggerRunStatus (helper)
// ---------------------------------------------------------------------------

function mapTriggerRunStatus(run: {
	isCompleted: boolean;
	isFailed: boolean;
	isCancelled: boolean;
	isExecuting: boolean;
	attemptCount: number;
}): TriggerRunUiStatus {
	if (run.isCompleted) return "completed";
	if (run.isCancelled) return "canceled";
	if (run.isFailed) return "failed";
	if (run.isExecuting) {
		return run.attemptCount > 1 ? "retrying" : "running";
	}
	return "queued";
}

export const deleteAsset = createServerFn({ method: "POST" })
	.inputValidator((data: { assetId: string }) => data)
	.handler(async ({ data: { assetId } }) => {
		const { asset } = await assertAssetOwner(assetId);
		await db
			.update(assets)
			.set({ deletedAt: new Date() })
			.where(eq(assets.id, assetId));
		// R2 cleanup AFTER the DB soft-delete
		await cleanupStorageKeys([asset.storageKey]);
	});

// ---------------------------------------------------------------------------
// fetchElevenLabsVoices — list available voices for the current user
// ---------------------------------------------------------------------------

export const fetchElevenLabsVoices = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string }) => data)
	.handler(async ({ data: { projectId } }) => {
		const { userId } = await assertProjectOwner(projectId, "error");
		const apiKey = await getUserElevenLabsKey(userId);
		return listVoices(apiKey);
	});

export const generateAudioPrompt = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			mode: "voiceover" | "sfx" | "music";
			targetDurationSec?: number;
		}) => {
			if (
				data.targetDurationSec != null &&
				(data.targetDurationSec < 1 || data.targetDurationSec > 300)
			) {
				throw new Error("Target duration must be between 1 and 300 seconds");
			}
			return data;
		},
	)
	.handler(async ({ data: { projectId, mode, targetDurationSec } }) => {
		const { userId, project } = await assertProjectOwner(projectId, "error");
		const apiKey = await getUserApiKey(userId);
		const settings = normalizeProjectSettings(project.settings);
		const intake = settings?.intake;

		const projectShots = await db.query.shots.findMany({
			where: and(eq(shots.projectId, projectId), isNull(shots.deletedAt)),
			orderBy: asc(shots.order),
		});

		const totalDurationSec =
			targetDurationSec ??
			projectShots.reduce(
				(sum, currentShot) => sum + currentShot.durationSec,
				0,
			);

		const shotDescriptions =
			projectShots
				.map(
					(currentShot, index) =>
						`Shot ${index + 1} (${currentShot.shotType}, ${currentShot.durationSec}s): ${currentShot.description}`,
				)
				.join("\n") || "No shot breakdown is available yet.";

		const projectContext = [
			`Project title: ${project.name}`,
			intake?.concept ? `Concept: ${intake.concept}` : null,
			intake?.purpose ? `Purpose: ${intake.purpose}` : null,
			intake?.style?.length ? `Visual style: ${intake.style.join(", ")}` : null,
			intake?.mood?.length ? `Mood: ${intake.mood.join(", ")}` : null,
			intake?.audioMode ? `Audio direction: ${intake.audioMode}` : null,
			intake?.audience ? `Audience: ${intake.audience}` : null,
			intake?.viewerAction
				? `Desired viewer action: ${intake.viewerAction}`
				: null,
			`Project duration target: ${totalDurationSec || 8} seconds`,
			`Project shots:\n${shotDescriptions}`,
		]
			.filter(Boolean)
			.join("\n");

		const systemPrompt =
			mode === "voiceover"
				? `You are a professional narration writer for short-form and long-form video.

Write a narration script for this video using the project and shot context below.

${projectContext}

Rules:
- Write narration that complements the visuals and adds meaning, not a literal shot-by-shot description of what is already visible.
- Match the project's visual style, mood, concept, and intended audience.
- Keep the narration paced for about ${totalDurationSec || 8} seconds of spoken audio.
- Strictly stay under ${Math.max(12, Math.round((totalDurationSec || 8) * 2.5))} words.
- Do not include timestamps, labels, speaker directions, markdown, or quotes.
- If the project's audio direction says no narration, still return one optional narration draft that could work if narration is later enabled.

Return ONLY the narration text, nothing else.`
				: mode === "music"
					? `You are an expert prompt writer for background music generation models.

Write one concise but highly specific background music prompt for this project using the context below.

${projectContext}

Rules:
- Describe genre, instrumentation, tempo/energy, mood, sonic texture, and how the music should support the project's emotional progression.
- Keep it instrumental unless the project explicitly calls for vocals.
- Match the project's visual style, mood, audience, and concept.
- Do not mention scene numbers, timestamps, or implementation notes.
- Return one polished prompt in a single paragraph, not a list.

Return ONLY the music prompt text, nothing else.`
					: `You are an expert prompt writer for sound effect and ambience generation models.

Write one concise but highly specific SFX/ambience prompt for this project using the context below.

${projectContext}

Rules:
- Describe the concrete environmental sounds, foley details, spatial feel, and intensity changes that should be heard.
- Anchor the prompt to the shot visuals, but describe sound only.
- Keep the final prompt under ${ELEVENLABS_SFX_MAX_PROMPT_CHARS} characters because the ElevenLabs Sound Generation API rejects longer text.
- Do not ask for music, melody, vocals, narration, timestamps, or implementation notes.
- Return one polished prompt in a single paragraph, not a list.

Return ONLY the sound prompt text, nothing else.`;

		const replicate = new Replicate({ auth: apiKey });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

		try {
			const output: unknown = await replicate.run(AUDIO_PROMPT_MODEL, {
				input: {
					prompt: systemPrompt,
					system_instruction:
						"You are an expert prompt writer for project audio generation.",
					max_output_tokens: AUDIO_PROMPT_MAX_OUTPUT_TOKENS,
					dynamic_thinking: false,
					thinking_budget: 0,
					temperature: 0.7,
				},
				signal: controller.signal,
				wait: { mode: "block", timeout: 60 },
			});

			const prompt = Array.isArray(output)
				? output
						.map((event) => String(event))
						.join("")
						.trim()
				: String(output ?? "").trim();

			if (!prompt) {
				throw new Error("AI returned an empty audio prompt — please try again");
			}

			return {
				prompt:
					mode === "sfx"
						? clampAudioPrompt(prompt, ELEVENLABS_SFX_MAX_PROMPT_CHARS)
						: prompt,
			};
		} finally {
			clearTimeout(timeout);
		}
	});

// ---------------------------------------------------------------------------
// generateVoiceoverScript — LLM generates narration text for a project
// ---------------------------------------------------------------------------

export const generateVoiceoverScript = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			instructions?: string;
			targetDurationSec?: number;
		}) => {
			if (data.instructions && data.instructions.length > MAX_MESSAGE_LENGTH) {
				throw new Error(
					`Instructions too long (max ${MAX_MESSAGE_LENGTH} characters)`,
				);
			}
			if (
				data.targetDurationSec != null &&
				(data.targetDurationSec < 1 || data.targetDurationSec > 300)
			) {
				throw new Error("Target duration must be between 1 and 300 seconds");
			}
			return data;
		},
	)
	.handler(async ({ data: { projectId, instructions, targetDurationSec } }) => {
		const { userId, project } = await assertProjectOwner(projectId, "error");
		const apiKey = await getUserApiKey(userId);

		// Gather all shots for this project
		const projectShots = await db.query.shots.findMany({
			where: and(eq(shots.projectId, projectId), isNull(shots.deletedAt)),
			orderBy: asc(shots.order),
		});

		// Use explicit target if provided, otherwise estimate from shot durations
		const totalDurationSec =
			targetDurationSec ??
			projectShots.reduce((sum, s) => sum + s.durationSec, 0);

		const settings = normalizeProjectSettings(project.settings);
		const intake = settings?.intake;

		const shotDescriptions = projectShots
			.map(
				(s, i) =>
					`Shot ${i + 1} (${s.shotType}, ${s.durationSec}s): ${s.description}`,
			)
			.join("\n");

		const contextBlock = [
			`Project: ${project.name}`,
			intake?.concept ? `Concept: ${intake.concept}` : null,
			intake?.audience ? `Target audience: ${intake.audience}` : null,
			intake?.mood?.length ? `Mood: ${intake.mood.join(", ")}` : null,
		]
			.filter(Boolean)
			.join("\n");

		const userInstructions = instructions
			? `\n\nAdditional instructions from the user:\n${instructions}`
			: "";

		const systemPrompt = `You are a professional voiceover script writer for short-form video content.

Write a narration script for a video. The narration will be spoken over the visual shots.

${contextBlock}

SHOTS IN THIS VIDEO:
${shotDescriptions}

TARGET DURATION: ${totalDurationSec} seconds of spoken audio
TARGET WORD COUNT: ${Math.round(totalDurationSec * 2.5)} words (at 2.5 words/sec)

RULES:
- Write narration that complements the visuals — describe what the viewer should FEEL, not what they can already SEE
- STRICTLY write no more than ${Math.round(totalDurationSec * 2.5)} words. This is a hard limit, not a suggestion.
- Use a natural, conversational tone appropriate for the project's mood
- Do NOT include speaker directions, timestamps, or stage notes
- Do NOT start with "In this scene" or similar meta-language
- Write ONLY the narration text — no formatting, no headers, no quotes${userInstructions}

Return ONLY the narration script text, nothing else.`;

		const replicate = new Replicate({ auth: apiKey });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

		try {
			const chunks: string[] = [];
			for await (const event of replicate.stream("anthropic/claude-4.5-haiku", {
				input: {
					prompt: systemPrompt,
					max_tokens: 1024,
					temperature: 0.7,
				},
				signal: controller.signal,
			})) {
				chunks.push(String(event));
			}
			const script = chunks.join("").trim();
			if (!script) throw new Error("AI returned an empty script — try again");
			return { script };
		} finally {
			clearTimeout(timeout);
		}
	});

// ---------------------------------------------------------------------------
// generateVoiceoverAudio — sends script to ElevenLabs TTS, stores in R2
// ---------------------------------------------------------------------------

export const generateVoiceoverAudio = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { projectId: string; script: string; voiceId?: string }) => {
			if (!data.script?.trim()) throw new Error("Script cannot be empty");
			if (data.script.length > MAX_MESSAGE_LENGTH) {
				throw new Error(
					`Script too long (max ${MAX_MESSAGE_LENGTH} characters)`,
				);
			}
			return data;
		},
	)
	.handler(async ({ data: { projectId, script, voiceId } }) => {
		const { userId, project } = await assertProjectOwner(projectId, "error");

		if (!script.trim()) throw new Error("Script cannot be empty");
		const generationId = randomUUID();

		// Create placeholder asset row
		const [placeholder] = await db
			.insert(assets)
			.values({
				projectId: project.id,
				shotId: null,
				type: "voiceover" as const,
				stage: "audio" as const,
				prompt: script,
				model: "elevenlabs",
				modelSettings: { voiceId: voiceId ?? null },
				status: "generating" as const,
				isSelected: false,
				batchId: randomUUID(),
				generationId,
			})
			.returning({ id: assets.id, generationId: assets.generationId });

		const handle = await generateVoiceoverAsset.trigger({
			assetId: placeholder.id,
			userId,
			projectId: project.id,
			generationId: placeholder.generationId ?? generationId,
			script,
			voiceId: voiceId ?? null,
		});

		await db
			.update(assets)
			.set({ jobId: handle.id })
			.where(eq(assets.id, placeholder.id));

		return {
			assetId: placeholder.id,
			jobId: handle.id,
		};
	});

export const pollAudioAssets = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			type: "voiceover" | "background_music";
		}) => data,
	)
	.handler(async ({ data: { projectId, type } }) => {
		await assertProjectOwner(projectId, "error");

		const audioAssets = await db.query.assets.findMany({
			where: and(
				eq(assets.projectId, projectId),
				isNull(assets.shotId),
				eq(assets.stage, "audio"),
				eq(assets.type, type),
				isNull(assets.deletedAt),
			),
			orderBy: desc(assets.createdAt),
		});

		const generating = audioAssets.filter((a) => a.status === "generating");
		const done = audioAssets.filter((a) => a.status === "done");
		const errored = audioAssets.filter((a) => a.status === "error");

		return {
			generatingCount: generating.length,
			doneCount: done.length,
			erroredCount: errored.length,
			isGenerating: generating.length > 0,
		};
	});

export const getAudioRunStatuses = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			type: "voiceover" | "background_music";
		}) => data,
	)
	.handler(async ({ data: { projectId, type } }) => {
		await assertProjectOwner(projectId, "error");

		const generatingAssets = await db.query.assets.findMany({
			where: and(
				eq(assets.projectId, projectId),
				isNull(assets.shotId),
				eq(assets.stage, "audio"),
				eq(assets.type, type),
				eq(assets.status, "generating"),
				isNull(assets.deletedAt),
			),
			orderBy: desc(assets.createdAt),
		});

		const statuses = await Promise.all(
			generatingAssets.map(async (asset): Promise<TriggerRunSummary> => {
				if (!asset.jobId) {
					return {
						assetId: asset.id,
						jobId: "",
						status: "unknown",
						attemptCount: 0,
						createdAt: asset.createdAt.toISOString(),
						startedAt: null,
						finishedAt: null,
						errorMessage: null,
					};
				}

				try {
					const run = await runs.retrieve(asset.jobId);

					return {
						assetId: asset.id,
						jobId: asset.jobId,
						status: mapTriggerRunStatus(run),
						attemptCount: run.attemptCount,
						createdAt: run.createdAt.toISOString(),
						startedAt: run.startedAt?.toISOString() ?? null,
						finishedAt: run.finishedAt?.toISOString() ?? null,
						errorMessage: run.error?.message ?? null,
					};
				} catch (error) {
					return {
						assetId: asset.id,
						jobId: asset.jobId,
						status: "unknown",
						attemptCount: 0,
						createdAt: asset.createdAt.toISOString(),
						startedAt: null,
						finishedAt: null,
						errorMessage:
							error instanceof Error ? error.message : "Failed to load run",
					};
				}
			}),
		);

		return { runs: statuses };
	});

// ---------------------------------------------------------------------------
// deleteVoiceoverAsset — soft-delete a voiceover asset
// ---------------------------------------------------------------------------

export const deleteVoiceoverAsset = createServerFn({ method: "POST" })
	.inputValidator((data: { assetId: string }) => data)
	.handler(async ({ data: { assetId } }) => {
		const { asset } = await assertAssetOwner(assetId);

		if (asset.type !== "voiceover" && asset.type !== "background_music") {
			throw new Error("Asset is not an audio asset");
		}

		await db
			.update(assets)
			.set({ deletedAt: new Date() })
			.where(eq(assets.id, assetId));
		// R2 cleanup AFTER the DB soft-delete
		await cleanupStorageKeys([asset.storageKey]);
	});

// ---------------------------------------------------------------------------
// selectVoiceover — mark a voiceover asset as the selected one for its project
// ---------------------------------------------------------------------------

export const selectVoiceover = createServerFn({ method: "POST" })
	.inputValidator((data: { assetId: string }) => data)
	.handler(async ({ data: { assetId } }) => {
		const { asset } = await assertAssetOwner(assetId);

		if (asset.type !== "voiceover" && asset.type !== "background_music") {
			throw new Error("Asset is not an audio asset");
		}
		if (asset.status !== "done") {
			throw new Error("Only completed audio assets can be selected");
		}

		// Select within the same type and project — voiceovers and background music are independent selections
		await db.transaction(async (tx) => {
			await tx
				.update(assets)
				.set({ isSelected: false })
				.where(
					and(
						eq(assets.projectId, asset.projectId),
						isNull(assets.shotId),
						eq(assets.type, asset.type),
						isNull(assets.deletedAt),
					),
				);
			await tx
				.update(assets)
				.set({ isSelected: true })
				.where(eq(assets.id, asset.id));
		});
	});

// ---------------------------------------------------------------------------
// generateSoundEffectAudio — ElevenLabs Sound Generation API → R2
// ---------------------------------------------------------------------------

export const generateSoundEffectAudio = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			prompt: string;
			durationSeconds?: number;
		}) => {
			if (!data.prompt?.trim()) throw new Error("Prompt cannot be empty");
			if (data.prompt.length > ELEVENLABS_SFX_MAX_PROMPT_CHARS) {
				throw new Error(
					`Prompt too long for ElevenLabs sound generation (max ${ELEVENLABS_SFX_MAX_PROMPT_CHARS} characters)`,
				);
			}
			if (
				data.durationSeconds != null &&
				(data.durationSeconds < 0.5 || data.durationSeconds > 30)
			) {
				throw new Error("Duration must be between 0.5 and 30 seconds");
			}
			return data;
		},
	)
	.handler(async ({ data: { projectId, prompt, durationSeconds } }) => {
		const { userId, project } = await assertProjectOwner(projectId, "error");
		const generationId = randomUUID();

		const [placeholder] = await db
			.insert(assets)
			.values({
				projectId: project.id,
				shotId: null,
				type: "background_music" as const,
				stage: "audio" as const,
				prompt,
				model: "elevenlabs-sfx",
				modelSettings: { durationSeconds: durationSeconds ?? null },
				status: "generating" as const,
				isSelected: false,
				batchId: randomUUID(),
				generationId,
			})
			.returning({ id: assets.id, generationId: assets.generationId });

		const handle = await generateSfxAsset.trigger({
			assetId: placeholder.id,
			userId,
			projectId: project.id,
			generationId: placeholder.generationId ?? generationId,
			prompt,
			durationSeconds: durationSeconds ?? null,
		});

		await db
			.update(assets)
			.set({ jobId: handle.id })
			.where(eq(assets.id, placeholder.id));

		return {
			assetId: placeholder.id,
			jobId: handle.id,
		};
	});

// ---------------------------------------------------------------------------
// generateBackgroundMusic — Replicate MusicGen → R2
// ---------------------------------------------------------------------------

export const generateBackgroundMusic = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			prompt: string;
			durationSeconds?: number;
		}) => {
			if (!data.prompt?.trim()) throw new Error("Prompt cannot be empty");
			if (data.prompt.length > MAX_MESSAGE_LENGTH) {
				throw new Error(
					`Prompt too long (max ${MAX_MESSAGE_LENGTH} characters)`,
				);
			}
			if (
				data.durationSeconds != null &&
				(data.durationSeconds < 1 || data.durationSeconds > 30)
			) {
				throw new Error("Duration must be between 1 and 30 seconds");
			}
			return data;
		},
	)
	.handler(async ({ data: { projectId, prompt, durationSeconds } }) => {
		const { userId, project } = await assertProjectOwner(projectId, "error");
		const generationId = randomUUID();

		const [placeholder] = await db
			.insert(assets)
			.values({
				projectId: project.id,
				shotId: null,
				type: "background_music" as const,
				stage: "audio" as const,
				prompt,
				model: "musicgen",
				modelSettings: { durationSeconds: durationSeconds ?? 8 },
				status: "generating" as const,
				isSelected: false,
				batchId: randomUUID(),
				generationId,
			})
			.returning({ id: assets.id, generationId: assets.generationId });

		const handle = await generateBackgroundMusicAsset.trigger({
			assetId: placeholder.id,
			userId,
			projectId: project.id,
			generationId: placeholder.generationId ?? generationId,
			prompt,
			durationSeconds: durationSeconds ?? 8,
		});

		await db
			.update(assets)
			.set({ jobId: handle.id })
			.where(eq(assets.id, placeholder.id));

		return {
			assetId: placeholder.id,
			jobId: handle.id,
		};
	});
