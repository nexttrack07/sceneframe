import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { runs } from "@trigger.dev/sdk";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, scenes, shots, transitionVideos } from "@/db/schema";
import {
	assertAssetOwner,
	assertProjectOwner,
	assertSceneOwner,
} from "@/lib/assert-project-owner.server";
import { getUserElevenLabsKey, listVoices } from "@/lib/elevenlabs.server";
import { deleteObject } from "@/lib/r2.server";
import {
	generateBackgroundMusicAsset,
	generateSceneImageAsset,
	generateSfxAsset,
	generateVoiceoverAsset,
} from "@/trigger";
import {
	buildLanePrompt,
	getUserApiKey,
} from "./image-generation-helpers.server";
import {
	normalizeImageDefaults,
	normalizeProjectSettings,
} from "./project-normalize";
import type { TriggerRunSummary, TriggerRunUiStatus } from "./project-types";

const MAX_MESSAGE_LENGTH = 5_000;
const REPLICATE_TIMEOUT_MS = 60_000;
const STALE_IMAGE_GENERATION_MS = 6 * 60 * 1000;
const ORPHANED_IMAGE_GENERATION_ERROR =
	"Image generation stopped before completion. Please try again.";

export const updateScene = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { sceneId: string; title?: string | null; description?: string }) =>
			data,
	)
	.handler(async ({ data: { sceneId, title, description } }) => {
		await assertSceneOwner(sceneId);

		const hasUpdates = title !== undefined || description !== undefined;
		if (hasUpdates) {
			await db
				.update(scenes)
				.set({
					...(title !== undefined && { title }),
					...(description !== undefined && { description }),
				})
				.where(eq(scenes.id, sceneId));
		}
	});

export const saveScenePrompt = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { sceneId: string; lane: "start" | "end"; prompt: string }) => data,
	)
	.handler(async ({ data: { sceneId, lane, prompt } }) => {
		await assertSceneOwner(sceneId);
		const col =
			lane === "start"
				? { startFramePrompt: prompt }
				: { endFramePrompt: prompt };
		await db.update(scenes).set(col).where(eq(scenes.id, sceneId));
	});

export const regenerateSceneDescription = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			sceneId: string;
			instructions: string;
			currentDescription: string;
		}) => {
			const trimmed = data.instructions.trim();
			if (trimmed.length === 0) throw new Error("Instructions cannot be empty");
			if (trimmed.length > MAX_MESSAGE_LENGTH)
				throw new Error(
					`Instructions too long (max ${MAX_MESSAGE_LENGTH} characters)`,
				);
			return {
				sceneId: data.sceneId,
				instructions: trimmed,
				currentDescription: data.currentDescription,
			};
		},
	)
	.handler(async ({ data: { sceneId, instructions, currentDescription } }) => {
		const { userId, project } = await assertSceneOwner(sceneId);
		const apiKey = await getUserApiKey(userId);

		const prompt = `You are refining a scene description for a video project called "${project.name}".

CURRENT SCENE DESCRIPTION:
${currentDescription}

USER'S REQUESTED CHANGES:
${instructions}

Rewrite the scene description incorporating the user's changes. The description must be a detailed visual description suitable for image generation (2-4 sentences). Be specific about lighting, camera angle, mood, subjects, and environment. The description must stand alone — no references to other scenes.

Return ONLY the new description text, nothing else.`;

		const replicate = new Replicate({ auth: apiKey });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

		try {
			const chunks: string[] = [];
			for await (const event of replicate.stream("anthropic/claude-4.5-haiku", {
				input: { prompt, max_tokens: 1024, temperature: 0.7 },
				signal: controller.signal,
			})) {
				chunks.push(String(event));
			}
			const newDescription = chunks.join("").trim();

			if (!newDescription) {
				throw new Error("AI returned an empty response — please try again");
			}

			return { description: newDescription };
		} finally {
			clearTimeout(timeout);
		}
	});

export const generateImagePrompt = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			sceneId: string;
			lane: "start" | "end";
			currentPrompt?: string;
		}) => data,
	)
	.handler(async ({ data: { sceneId, lane, currentPrompt } }) => {
		const { userId, scene, project } = await assertSceneOwner(sceneId);
		const apiKey = await getUserApiKey(userId);
		const settings = normalizeProjectSettings(project.settings);

		const systemPrompt = `You are an expert prompt writer for modern text-to-image models.
Given a scene description from a video project, write a concise, high-quality prompt for the ${lane === "start" ? "opening" : "closing"} still frame of this scene.

Write the result as 1 to 4 natural-language sentences, not a labeled template.

Prompt priorities:
- main subject and the exact frozen moment visible in frame
- environment and important background elements
- framing/composition/camera angle only when it materially helps
- lighting, mood, and visual style
- any essential visible text or graphic elements

Rules:
- This must describe a single still image, not a video shot
- Do NOT describe camera movement, animation, transitions, or how the scene changes over time
- Keep it specific but compact; avoid bloated lists of adjectives
- Include only details that are visually important
- The prompt must stand alone and should read cleanly if sent directly to an image model
- Do NOT include meta-instructions like "generate an image of"
${settings?.intake?.audience ? `- Target audience: ${settings.intake.audience}` : ""}
${settings?.intake?.viewerAction ? `- Video goal: ${settings.intake.viewerAction}` : ""}

Return ONLY the final prompt, nothing else.`;

		const userMessage = currentPrompt
			? `Scene description: ${scene.description}\n\nCurrent prompt (improve this): ${currentPrompt}`
			: `Scene description: ${scene.description}`;

		const replicate = new Replicate({ auth: apiKey });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

		try {
			const chunks: string[] = [];
			for await (const event of replicate.stream("anthropic/claude-4.5-haiku", {
				input: {
					prompt: `${systemPrompt}\n\n${userMessage}`,
					max_tokens: 1024,
					temperature: 0.8,
				},
				signal: controller.signal,
			})) {
				chunks.push(String(event));
			}
			const generatedPrompt = chunks.join("").trim();
			if (!generatedPrompt)
				throw new Error("AI returned an empty response — please try again");

			// Persist the generated prompt to the scene
			const col =
				lane === "start"
					? { startFramePrompt: generatedPrompt }
					: { endFramePrompt: generatedPrompt };
			await db.update(scenes).set(col).where(eq(scenes.id, scene.id));

			return { prompt: generatedPrompt };
		} finally {
			clearTimeout(timeout);
		}
	});

export const generateSceneImages = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			sceneId: string;
			lane: "start" | "end";
			promptOverride?: string;
			settingsOverrides?: unknown;
		}) => {
			const lane = data.lane === "end" ? ("end" as const) : ("start" as const);
			return {
				sceneId: data.sceneId,
				lane,
				promptOverride: data.promptOverride?.trim() || undefined,
				settingsOverrides: data.settingsOverrides,
			};
		},
	)
	.handler(
		async ({ data: { sceneId, lane, promptOverride, settingsOverrides } }) => {
			const { userId, scene, project } = await assertSceneOwner(sceneId);

			const settings = normalizeProjectSettings(project.settings);

			// Default settings from last-used asset for this scene, then fallback to app defaults
			const lastAsset = await db.query.assets.findFirst({
				where: and(
					eq(assets.sceneId, sceneId),
					eq(assets.stage, "images"),
					isNull(assets.deletedAt),
				),
				orderBy: desc(assets.createdAt),
			});
			const lastSettings = lastAsset?.modelSettings as Record<
				string,
				unknown
			> | null;
			const safeSettingsOverrides =
				settingsOverrides && typeof settingsOverrides === "object"
					? settingsOverrides
					: {};

			const imageDefaults = normalizeImageDefaults({
				...lastSettings,
				...safeSettingsOverrides,
			});

			const finalPrompt =
				promptOverride ??
				buildLanePrompt(scene.description, lane, settings?.intake);
			const batchId = randomUUID();
			const type = "image" as const;
			const generationCount = Math.max(
				1,
				Math.min(4, imageDefaults.batchCount),
			);

			const placeholders = await db
				.insert(assets)
				.values(
					Array.from({ length: generationCount }).map(() => ({
						sceneId: scene.id,
						type,
						stage: "images" as const,
						prompt: finalPrompt,
						model: imageDefaults.model,
						modelSettings: {
							...imageDefaults.modelOptions,
							batchCount: generationCount,
							generationLane: lane,
						},
						status: "generating" as const,
						isSelected: false,
						batchId,
						generationId: randomUUID(),
					})),
				)
				.returning({ id: assets.id, generationId: assets.generationId });

			// Persist the prompt to the scene so it survives invalidation
			const promptCol =
				lane === "start"
					? { startFramePrompt: finalPrompt }
					: { endFramePrompt: finalPrompt };
			await db.update(scenes).set(promptCol).where(eq(scenes.id, scene.id));

			// Trigger all image generation tasks in parallel
			const enqueuedRuns = await Promise.all(
				placeholders.map(async (placeholder, index) => {
					const handle = await generateSceneImageAsset.trigger({
						assetId: placeholder.id,
						userId,
						projectId: project.id,
						sceneId: scene.id,
						generationId: placeholder.generationId ?? batchId,
						batchId,
						sequenceIndex: index,
						prompt: finalPrompt,
						model: imageDefaults.model,
						modelOptions: imageDefaults.modelOptions,
					});

					await db
						.update(assets)
						.set({ jobId: handle.id })
						.where(eq(assets.id, placeholder.id));

					return { assetId: placeholder.id, jobId: handle.id };
				}),
			);

			return {
				queuedCount: enqueuedRuns.length,
				batchId,
				runs: enqueuedRuns,
			};
		},
	);

export const pollSceneAssets = createServerFn({ method: "POST" })
	.inputValidator((data: { sceneId: string }) => data)
	.handler(async ({ data: { sceneId } }) => {
		await assertSceneOwner(sceneId);

		await reconcileGeneratingImageAssets({
			scope: "scene",
			scopeId: sceneId,
		});

		const sceneAssets = await db.query.assets.findMany({
			where: and(
				eq(assets.sceneId, sceneId),
				eq(assets.stage, "images"),
				isNull(assets.shotId),
				isNull(assets.deletedAt),
			),
			orderBy: desc(assets.createdAt),
		});

		const generating = sceneAssets.filter((a) => a.status === "generating");
		const done = sceneAssets.filter((a) => a.status === "done");
		const errored = sceneAssets.filter((a) => a.status === "error");

		return {
			generatingCount: generating.length,
			doneCount: done.length,
			erroredCount: errored.length,
			isGenerating: generating.length > 0,
			latestErrorMessage: errored[0]?.errorMessage ?? null,
		};
	});

export const getSceneImageRunStatuses = createServerFn({ method: "POST" })
	.inputValidator((data: { sceneId: string }) => data)
	.handler(async ({ data: { sceneId } }) => {
		await assertSceneOwner(sceneId);

		const generatingAssets = await db.query.assets.findMany({
			where: and(
				eq(assets.sceneId, sceneId),
				eq(assets.stage, "images"),
				isNull(assets.shotId),
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

export const selectAsset = createServerFn({ method: "POST" })
	.inputValidator((data: { assetId: string }) => data)
	.handler(async ({ data: { assetId } }) => {
		const { asset } = await assertAssetOwner(assetId);

		if (!["start_image", "end_image", "image"].includes(asset.type)) {
			throw new Error("Only image assets can be selected here");
		}
		if (asset.shotId !== null) {
			throw new Error("Use selectShotAsset to select shot-level image assets");
		}
		if (asset.status !== "done") {
			throw new Error("Only completed assets can be selected");
		}

		await db.transaction(async (tx) => {
			await tx
				.update(assets)
				.set({ isSelected: false })
				.where(
					and(
						eq(assets.sceneId, asset.sceneId),
						isNull(assets.shotId),
						inArray(assets.type, ["start_image", "end_image", "image"]),
						isNull(assets.deletedAt),
					),
				);
			await tx
				.update(assets)
				.set({ isSelected: true })
				.where(eq(assets.id, asset.id));
		});
	});

export const reorderScene = createServerFn({ method: "POST" })
	.inputValidator((data: { sceneId: string; newOrder: number }) => {
		if (typeof data.newOrder !== "number" || !Number.isFinite(data.newOrder)) {
			throw new Error("newOrder must be a finite number");
		}
		return data;
	})
	.handler(async ({ data: { sceneId, newOrder } }) => {
		await assertSceneOwner(sceneId);
		await db
			.update(scenes)
			.set({ order: newOrder })
			.where(eq(scenes.id, sceneId));
	});

export const addScene = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			title?: string;
			description: string;
			afterOrder: number;
		}) => {
			if (!data.description?.trim()) throw new Error("Description is required");
			if (
				typeof data.afterOrder !== "number" ||
				!Number.isFinite(data.afterOrder)
			) {
				throw new Error("afterOrder must be a finite number");
			}
			return data;
		},
	)
	.handler(async ({ data: { projectId, title, description, afterOrder } }) => {
		await assertProjectOwner(projectId, "error");

		const newOrder = afterOrder + 0.5;

		await db.insert(scenes).values({
			projectId,
			order: newOrder,
			title: title || null,
			description,
			stage: "script" as const,
		});
	});

export const deleteAsset = createServerFn({ method: "POST" })
	.inputValidator((data: { assetId: string }) => data)
	.handler(async ({ data: { assetId } }) => {
		const { asset } = await assertAssetOwner(assetId);
		if (asset.storageKey) {
			await deleteObject(asset.storageKey).catch((err) =>
				console.error("R2 deleteObject failed for key:", asset.storageKey, err),
			);
		}
		await db
			.update(assets)
			.set({ deletedAt: new Date() })
			.where(eq(assets.id, assetId));
	});

export const deleteScene = createServerFn({ method: "POST" })
	.inputValidator((data: { sceneId: string }) => data)
	.handler(async ({ data: { sceneId } }) => {
		await assertSceneOwner(sceneId);

		const now = new Date();

		// Get child shot IDs
		const childShotIds = (
			await db
				.select({ id: shots.id })
				.from(shots)
				.where(and(eq(shots.sceneId, sceneId), isNull(shots.deletedAt)))
		).map((r) => r.id);

		// Collect storageKeys for R2 cleanup
		const assetRows: { storageKey: string | null }[] = [];
		if (childShotIds.length > 0) {
			const shotAssets = await db
				.select({ storageKey: assets.storageKey })
				.from(assets)
				.where(
					and(inArray(assets.shotId, childShotIds), isNull(assets.deletedAt)),
				);
			assetRows.push(...shotAssets);
		}
		const sceneAssets = await db
			.select({ storageKey: assets.storageKey })
			.from(assets)
			.where(
				and(
					eq(assets.sceneId, sceneId),
					isNull(assets.shotId),
					isNull(assets.deletedAt),
				),
			);
		assetRows.push(...sceneAssets);

		// Collect transition video storageKeys for R2 cleanup
		let tvStorageKeys: string[] = [];
		if (childShotIds.length > 0) {
			const tvRows = await db
				.select({ storageKey: transitionVideos.storageKey })
				.from(transitionVideos)
				.where(
					and(
						or(
							inArray(transitionVideos.fromShotId, childShotIds),
							inArray(transitionVideos.toShotId, childShotIds),
						),
						isNull(transitionVideos.deletedAt),
					),
				);
			tvStorageKeys = tvRows
				.map((r) => r.storageKey)
				.filter((k): k is string => k !== null);
		}

		const storageKeys = assetRows
			.map((r) => r.storageKey)
			.filter((k): k is string => k !== null);
		const allR2Keys = [...storageKeys, ...tvStorageKeys];
		const r2Results = await Promise.allSettled(
			allR2Keys.map((key) => deleteObject(key)),
		);
		r2Results.forEach((result, i) => {
			if (result.status === "rejected") {
				console.error(
					"R2 deleteObject failed for key:",
					allR2Keys[i],
					result.reason,
				);
			}
		});

		// Wrap all soft-deletes in a single transaction for consistency
		await db.transaction(async (tx) => {
			// Soft-delete transition videos referencing child shots
			if (childShotIds.length > 0) {
				await tx
					.update(transitionVideos)
					.set({ deletedAt: now })
					.where(
						and(
							or(
								inArray(transitionVideos.fromShotId, childShotIds),
								inArray(transitionVideos.toShotId, childShotIds),
							),
							isNull(transitionVideos.deletedAt),
						),
					);
			}

			// Soft-delete assets belonging to child shots
			if (childShotIds.length > 0) {
				await tx
					.update(assets)
					.set({ deletedAt: now })
					.where(
						and(inArray(assets.shotId, childShotIds), isNull(assets.deletedAt)),
					);
			}

			// Soft-delete scene-level assets (those without a shotId)
			await tx
				.update(assets)
				.set({ deletedAt: now })
				.where(
					and(
						eq(assets.sceneId, sceneId),
						isNull(assets.shotId),
						isNull(assets.deletedAt),
					),
				);

			// Soft-delete child shots
			if (childShotIds.length > 0) {
				await tx
					.update(shots)
					.set({ deletedAt: now })
					.where(inArray(shots.id, childShotIds));
			}

			await tx
				.update(scenes)
				.set({ deletedAt: now })
				.where(eq(scenes.id, sceneId));
		});
	});

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

async function reconcileGeneratingImageAssets(args: {
	scope: "scene" | "shot";
	scopeId: string;
}) {
	const generatingAssets = await db.query.assets.findMany({
		where:
			args.scope === "scene"
				? and(
						eq(assets.sceneId, args.scopeId),
						eq(assets.stage, "images"),
						isNull(assets.shotId),
						eq(assets.status, "generating"),
						isNull(assets.deletedAt),
					)
				: and(
						eq(assets.shotId, args.scopeId),
						eq(assets.stage, "images"),
						eq(assets.status, "generating"),
						isNull(assets.deletedAt),
					),
		orderBy: desc(assets.createdAt),
	});

	await Promise.all(
		generatingAssets.map(async (asset) => {
			if (Date.now() - asset.createdAt.getTime() > STALE_IMAGE_GENERATION_MS) {
				await db
					.update(assets)
					.set({
						status: "error",
						errorMessage: ORPHANED_IMAGE_GENERATION_ERROR,
					})
					.where(eq(assets.id, asset.id));
				return;
			}

			if (!asset.jobId) {
				await db
					.update(assets)
					.set({
						status: "error",
						errorMessage: ORPHANED_IMAGE_GENERATION_ERROR,
					})
					.where(eq(assets.id, asset.id));
				return;
			}

			try {
				const run = await runs.retrieve(asset.jobId);
				const runStatus = mapTriggerRunStatus(run);

				if (runStatus === "failed" || runStatus === "canceled") {
					await db
						.update(assets)
						.set({
							status: "error",
							errorMessage:
								run.error?.message ?? ORPHANED_IMAGE_GENERATION_ERROR,
						})
						.where(eq(assets.id, asset.id));
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message.toLowerCase() : "";
				const looksMissingRun =
					message.includes("not found") ||
					message.includes("no run") ||
					message.includes("404");

				if (looksMissingRun) {
					await db
						.update(assets)
						.set({
							status: "error",
							errorMessage: ORPHANED_IMAGE_GENERATION_ERROR,
						})
						.where(eq(assets.id, asset.id));
				}
			}
		}),
	);
}

// ---------------------------------------------------------------------------
// fetchElevenLabsVoices — list available voices for the current user
// ---------------------------------------------------------------------------

export const fetchElevenLabsVoices = createServerFn({ method: "POST" })
	.inputValidator((data: { sceneId: string }) => data)
	.handler(async ({ data: { sceneId } }) => {
		const { userId } = await assertSceneOwner(sceneId);
		const apiKey = await getUserElevenLabsKey(userId);
		return listVoices(apiKey);
	});

// ---------------------------------------------------------------------------
// generateVoiceoverScript — LLM generates narration text for a scene
// ---------------------------------------------------------------------------

export const generateVoiceoverScript = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			sceneId: string;
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
	.handler(async ({ data: { sceneId, instructions, targetDurationSec } }) => {
		const { userId, scene, project } = await assertSceneOwner(sceneId);
		const apiKey = await getUserApiKey(userId);

		// Gather all shots for this scene
		const sceneShots = await db.query.shots.findMany({
			where: and(eq(shots.sceneId, sceneId), isNull(shots.deletedAt)),
			orderBy: asc(shots.order),
		});

		// Use explicit target if provided, otherwise estimate from shot durations
		const totalDurationSec =
			targetDurationSec ??
			sceneShots.reduce((sum, s) => sum + s.durationSec, 0);

		const settings = normalizeProjectSettings(project.settings);
		const intake = settings?.intake;

		const shotDescriptions = sceneShots
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
			`Scene: ${scene.title ?? "Untitled"} — ${scene.description}`,
		]
			.filter(Boolean)
			.join("\n");

		const userInstructions = instructions
			? `\n\nAdditional instructions from the user:\n${instructions}`
			: "";

		const systemPrompt = `You are a professional voiceover script writer for short-form video content.

Write a narration script for ONE scene of a video. The narration will be spoken over the visual shots.

${contextBlock}

SHOTS IN THIS SCENE:
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
		(data: { sceneId: string; script: string; voiceId?: string }) => {
			if (!data.script?.trim()) throw new Error("Script cannot be empty");
			if (data.script.length > MAX_MESSAGE_LENGTH) {
				throw new Error(
					`Script too long (max ${MAX_MESSAGE_LENGTH} characters)`,
				);
			}
			return data;
		},
	)
	.handler(async ({ data: { sceneId, script, voiceId } }) => {
		const { userId, scene, project } = await assertSceneOwner(sceneId);

		if (!script.trim()) throw new Error("Script cannot be empty");
		const generationId = randomUUID();

		// Create placeholder asset row
		const [placeholder] = await db
			.insert(assets)
			.values({
				sceneId: scene.id,
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
			sceneId: scene.id,
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
		(data: { sceneId: string; type: "voiceover" | "background_music" }) => data,
	)
	.handler(async ({ data: { sceneId, type } }) => {
		await assertSceneOwner(sceneId);

		const audioAssets = await db.query.assets.findMany({
			where: and(
				eq(assets.sceneId, sceneId),
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
		(data: { sceneId: string; type: "voiceover" | "background_music" }) => data,
	)
	.handler(async ({ data: { sceneId, type } }) => {
		await assertSceneOwner(sceneId);

		const generatingAssets = await db.query.assets.findMany({
			where: and(
				eq(assets.sceneId, sceneId),
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

		if (asset.storageKey) {
			await deleteObject(asset.storageKey).catch((err) =>
				console.error(
					"R2 deleteObject failed for audio key:",
					asset.storageKey,
					err,
				),
			);
		}

		await db
			.update(assets)
			.set({ deletedAt: new Date() })
			.where(eq(assets.id, assetId));
	});

// ---------------------------------------------------------------------------
// selectVoiceover — mark a voiceover asset as the selected one for its scene
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

		// Select within the same type — voiceovers and background music are independent selections
		await db.transaction(async (tx) => {
			await tx
				.update(assets)
				.set({ isSelected: false })
				.where(
					and(
						eq(assets.sceneId, asset.sceneId),
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
		(data: { sceneId: string; prompt: string; durationSeconds?: number }) => {
			if (!data.prompt?.trim()) throw new Error("Prompt cannot be empty");
			if (data.prompt.length > MAX_MESSAGE_LENGTH) {
				throw new Error(
					`Prompt too long (max ${MAX_MESSAGE_LENGTH} characters)`,
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
	.handler(async ({ data: { sceneId, prompt, durationSeconds } }) => {
		const { userId, scene, project } = await assertSceneOwner(sceneId);
		const generationId = randomUUID();

		const [placeholder] = await db
			.insert(assets)
			.values({
				sceneId: scene.id,
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
			sceneId: scene.id,
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
		(data: { sceneId: string; prompt: string; durationSeconds?: number }) => {
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
	.handler(async ({ data: { sceneId, prompt, durationSeconds } }) => {
		const { userId, scene, project } = await assertSceneOwner(sceneId);
		const generationId = randomUUID();

		const [placeholder] = await db
			.insert(assets)
			.values({
				sceneId: scene.id,
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
			sceneId: scene.id,
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

// Re-exports for backward compatibility
export {
	addShot,
	cloneShot,
	deleteShot,
	enhanceShotImagePrompt,
	generateShotImagePrompt,
	generateShotImages,
	generateShotVideo,
	generateShotVideoPrompt,
	getShotImageRunStatuses,
	pollShotAssets,
	pollVideoAsset,
	reorderShot,
	saveShotPrompt,
	selectShotAsset,
	updateShot,
} from "./shot-actions";

export {
	deleteTransitionVideo,
	enhanceTransitionVideoPrompt,
	generateTransitionVideo,
	generateTransitionVideoPrompt,
	getTransitionVideoRunStatuses,
	pollTransitionVideos,
	selectTransitionVideo,
} from "./transition-actions";
