import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, scenes, shots, transitionVideos } from "@/db/schema";
import {
	assertAssetOwner,
	assertAssetOwnerViaShot,
	assertProjectOwner,
	assertSceneOwner,
	assertShotOwner,
} from "@/lib/assert-project-owner.server";
import {
	generateSoundEffect,
	generateSpeech,
	getUserElevenLabsKey,
	listVoices,
} from "@/lib/elevenlabs.server";
import {
	copyObject,
	deleteObject,
	uploadBuffer,
	uploadFromUrl,
} from "@/lib/r2.server";
import {
	normalizeImageDefaults,
	normalizeProjectSettings,
} from "./project-normalize";
import type { ShotType } from "./project-types";
import {
	buildLanePrompt,
	getUserApiKey,
	parseReplicateImageUrls,
	qualityPresetToSteps,
	summarizeReplicateOutput,
} from "./replicate-helpers.server";

const MAX_MESSAGE_LENGTH = 5_000;
const REPLICATE_TIMEOUT_MS = 60_000;

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

		const systemPrompt = `You are an expert image prompt engineer for AI image generation models like Flux and Stable Diffusion.
Given a scene description from a video project, write a detailed, vivid image generation prompt for the ${lane === "start" ? "opening" : "closing"} frame of this scene.

You MUST use this exact structured format with these sections:

[Subject]: Describe the main subject(s) in detail — appearance, expression, pose, clothing, distinguishing features.

[Action]: What the subject is doing in this specific moment.

[Environment]: The setting, background, and surrounding elements in rich detail.

[Cinematography]: Camera angle, lens type, depth of field, framing, and composition.

[Lighting/Style]: Lighting direction, quality, color grading, mood, and artistic style.

[Technical]: Photography/rendering style, resolution, aspect ratio, and technical quality descriptors.

Rules:
- Each section should be 1-2 detailed sentences
- Be extremely specific and vivid — avoid vague terms
- Use professional cinematic and photography language
- The prompt must stand alone — no references to other scenes or frames
- Do NOT include meta-instructions like "generate an image of"
${settings?.intake?.audience ? `- Target audience: ${settings.intake.audience}` : ""}
${settings?.intake?.viewerAction ? `- Video goal: ${settings.intake.viewerAction}` : ""}

Return ONLY the structured prompt, nothing else.`;

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
			settingsOverrides?: {
				model?: string;
				aspectRatio?: string;
				qualityPreset?: string;
				batchCount?: number;
			};
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
			const apiKey = await getUserApiKey(userId);

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

			const imageDefaults = normalizeImageDefaults({
				...lastSettings,
				...settingsOverrides,
			});

			const finalPrompt =
				promptOverride ??
				buildLanePrompt(scene.description, lane, settings?.intake);
			const isNanoBanana = imageDefaults.model === "google/nano-banana-pro";
			const outputExtension = isNanoBanana ? "png" : "webp";
			const outputContentType = isNanoBanana ? "image/png" : "image/webp";

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
							aspectRatio: imageDefaults.aspectRatio,
							qualityPreset: imageDefaults.qualityPreset,
							batchCount: generationCount,
							outputFormat: outputExtension,
							generationLane: lane,
						},
						status: "generating" as const,
						isSelected: false,
						batchId,
						generationId: batchId,
					})),
				)
				.returning({ id: assets.id });

			// Persist the prompt to the scene so it survives invalidation
			const promptCol =
				lane === "start"
					? { startFramePrompt: finalPrompt }
					: { endFramePrompt: finalPrompt };
			await db.update(scenes).set(promptCol).where(eq(scenes.id, scene.id));

			const queuedAssetIds = placeholders.map((row) => row.id);
			const replicate = new Replicate({ auth: apiKey });

			const replicateInput = isNanoBanana
				? {
						prompt: finalPrompt,
						aspect_ratio: imageDefaults.aspectRatio,
						output_format: "png" as const,
					}
				: {
						prompt: finalPrompt,
						aspect_ratio: imageDefaults.aspectRatio,
						num_outputs: 1,
						output_format: "webp" as const,
						num_inference_steps: qualityPresetToSteps(
							imageDefaults.qualityPreset,
						),
					};

			// Fire all Replicate calls in parallel to avoid blocking for N * generation_time
			const results = await Promise.allSettled(
				queuedAssetIds.map(async (assetId, i) => {
					const output = await replicate.run(
						imageDefaults.model as `${string}/${string}`,
						{
							input: replicateInput,
						},
					);

					const urls = parseReplicateImageUrls(output);
					const sourceUrl = urls[0];

					if (!sourceUrl) {
						throw new Error(
							`No output URL found (${summarizeReplicateOutput(output)}).`,
						);
					}

					const storageKey = `projects/${project.id}/scenes/${scene.id}/images/${batchId}/image-${i + 1}.${outputExtension}`;
					const storedUrl = await uploadFromUrl(
						sourceUrl,
						storageKey,
						outputContentType,
					);

					await db
						.update(assets)
						.set({
							url: storedUrl,
							storageKey,
							status: "done",
							errorMessage: null,
						})
						.where(eq(assets.id, assetId));
				}),
			);

			let completedCount = 0;
			let failedCount = 0;
			for (let i = 0; i < results.length; i++) {
				if (results[i].status === "fulfilled") {
					completedCount += 1;
				} else {
					const reason = (results[i] as PromiseRejectedResult).reason;
					const errorMessage =
						reason instanceof Error
							? reason.message
							: "Image generation failed";
					await db
						.update(assets)
						.set({ status: "error", errorMessage })
						.where(eq(assets.id, queuedAssetIds[i]));
					failedCount += 1;
				}
			}

			// Only advance scene stage if at least one image succeeded
			if (completedCount > 0 && scene.stage === "script") {
				await db
					.update(scenes)
					.set({ stage: "images" })
					.where(eq(scenes.id, scene.id));
			}

			return {
				queuedCount: queuedAssetIds.length,
				completedCount,
				failedCount,
				batchId,
			};
		},
	);

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
// recomputeProjectTimestamps
// ---------------------------------------------------------------------------

async function recomputeProjectTimestamps(projectId: string) {
	// Load all non-deleted shots for the project, ordered by scene.order ASC, shot.order ASC
	const projectScenes = await db
		.select({ id: scenes.id, order: scenes.order })
		.from(scenes)
		.where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)))
		.orderBy(asc(scenes.order));

	if (projectScenes.length === 0) return;

	const sceneIds = projectScenes.map((s) => s.id);
	const allShots = await db
		.select({
			id: shots.id,
			sceneId: shots.sceneId,
			order: shots.order,
			durationSec: shots.durationSec,
		})
		.from(shots)
		.where(and(inArray(shots.sceneId, sceneIds), isNull(shots.deletedAt)))
		.orderBy(asc(shots.order));

	// Sort shots by scene order then shot order
	const sceneOrderMap = new Map(projectScenes.map((s, i) => [s.id, i]));
	allShots.sort((a, b) => {
		const sceneOrdA = sceneOrderMap.get(a.sceneId) ?? 0;
		const sceneOrdB = sceneOrderMap.get(b.sceneId) ?? 0;
		if (sceneOrdA !== sceneOrdB) return sceneOrdA - sceneOrdB;
		return a.order - b.order;
	});

	// Compute cumulative timestamps and apply in a single bulk UPDATE
	let cursor = 0;
	const updates: {
		id: string;
		timestampStart: number;
		timestampEnd: number;
	}[] = [];
	for (const shot of allShots) {
		const start = cursor;
		cursor += shot.durationSec;
		updates.push({ id: shot.id, timestampStart: start, timestampEnd: cursor });
	}

	if (updates.length === 0) return;

	// Batch all timestamp updates in a single UPDATE using CASE WHEN
	const startCaseChunks = updates.map(
		(u) => sql`WHEN ${shots.id} = ${u.id} THEN ${u.timestampStart}`,
	);
	const endCaseChunks = updates.map(
		(u) => sql`WHEN ${shots.id} = ${u.id} THEN ${u.timestampEnd}`,
	);
	const ids = updates.map((u) => u.id);
	await db
		.update(shots)
		.set({
			timestampStart: sql`CASE ${sql.join(startCaseChunks, sql` `)} ELSE ${shots.timestampStart} END`,
			timestampEnd: sql`CASE ${sql.join(endCaseChunks, sql` `)} ELSE ${shots.timestampEnd} END`,
		})
		.where(inArray(shots.id, ids));
}

// ---------------------------------------------------------------------------
// updateShot
// ---------------------------------------------------------------------------

export const updateShot = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			shotId: string;
			description?: string;
			shotType?: ShotType;
			durationSec?: number;
		}) => {
			if (data.durationSec !== undefined) {
				if (
					!Number.isFinite(data.durationSec) ||
					data.durationSec < 1 ||
					data.durationSec > 15
				) {
					throw new Error("durationSec must be between 1 and 15");
				}
			}
			return data;
		},
	)
	.handler(async ({ data: { shotId, description, shotType, durationSec } }) => {
		const { shot, scene } = await assertShotOwner(shotId);

		const hasUpdates =
			description !== undefined ||
			shotType !== undefined ||
			durationSec !== undefined;
		if (hasUpdates) {
			await db
				.update(shots)
				.set({
					...(description !== undefined && { description }),
					...(shotType !== undefined && { shotType }),
					...(durationSec !== undefined && { durationSec }),
				})
				.where(eq(shots.id, shotId));
		}

		if (durationSec !== undefined && durationSec !== shot.durationSec) {
			await recomputeProjectTimestamps(scene.projectId);
		}
	});

// ---------------------------------------------------------------------------
// deleteShot
// ---------------------------------------------------------------------------

export const deleteShot = createServerFn({ method: "POST" })
	.inputValidator((data: { shotId: string }) => data)
	.handler(async ({ data: { shotId } }) => {
		const { scene } = await assertShotOwner(shotId);

		const now = new Date();

		// Collect storageKeys for R2 cleanup
		const shotAssets = await db
			.select({ storageKey: assets.storageKey })
			.from(assets)
			.where(and(eq(assets.shotId, shotId), isNull(assets.deletedAt)));
		const storageKeys = shotAssets
			.map((r) => r.storageKey)
			.filter((k): k is string => k !== null);
		const assetR2Results = await Promise.allSettled(
			storageKeys.map((key) => deleteObject(key)),
		);
		assetR2Results.forEach((result, i) => {
			if (result.status === "rejected") {
				console.error(
					"R2 deleteObject failed for key:",
					storageKeys[i],
					result.reason,
				);
			}
		});

		// Soft-delete shot's assets — done inside transaction below
		// Clean up R2 storage for transition videos involving this shot
		const tvToDelete = await db
			.select({ storageKey: transitionVideos.storageKey })
			.from(transitionVideos)
			.where(
				and(
					or(
						eq(transitionVideos.fromShotId, shotId),
						eq(transitionVideos.toShotId, shotId),
					),
					isNull(transitionVideos.deletedAt),
				),
			);
		const tvStorageKeys = tvToDelete
			.map((r) => r.storageKey)
			.filter((k): k is string => k !== null);
		const tvR2Results = await Promise.allSettled(
			tvStorageKeys.map((key) => deleteObject(key)),
		);
		tvR2Results.forEach((result, i) => {
			if (result.status === "rejected") {
				console.error(
					"R2 deleteObject failed for key:",
					tvStorageKeys[i],
					result.reason,
				);
			}
		});

		// Wrap all soft-deletes in a single transaction for consistency
		await db.transaction(async (tx) => {
			// Soft-delete shot's assets
			await tx
				.update(assets)
				.set({ deletedAt: now })
				.where(and(eq(assets.shotId, shotId), isNull(assets.deletedAt)));

			// Soft-delete any transition videos involving this shot
			await tx
				.update(transitionVideos)
				.set({ deletedAt: now })
				.where(
					and(
						or(
							eq(transitionVideos.fromShotId, shotId),
							eq(transitionVideos.toShotId, shotId),
						),
						isNull(transitionVideos.deletedAt),
					),
				);

			// Soft-delete the shot
			await tx
				.update(shots)
				.set({ deletedAt: now })
				.where(eq(shots.id, shotId));
		});

		await recomputeProjectTimestamps(scene.projectId);
	});

// ---------------------------------------------------------------------------
// cloneShot
// ---------------------------------------------------------------------------

export const cloneShot = createServerFn({ method: "POST" })
	.inputValidator((data: { shotId: string; placement: "before" | "after" }) => {
		if (!data.shotId) throw new Error("shotId is required");
		if (data.placement !== "before" && data.placement !== "after") {
			throw new Error("placement must be 'before' or 'after'");
		}
		return data;
	})
	.handler(async ({ data: { shotId, placement } }) => {
		const { scene, shot } = await assertShotOwner(shotId);

		// Get sibling shots to calculate insertion order
		const siblingShots = await db
			.select({ id: shots.id, order: shots.order })
			.from(shots)
			.where(and(eq(shots.sceneId, shot.sceneId), isNull(shots.deletedAt)))
			.orderBy(asc(shots.order));

		const currentIdx = siblingShots.findIndex((s) => s.id === shotId);
		let newOrder: number;

		if (placement === "before") {
			const prev = siblingShots[currentIdx - 1];
			newOrder = prev ? (prev.order + shot.order) / 2 : shot.order - 1;
		} else {
			const next = siblingShots[currentIdx + 1];
			newOrder = next ? (shot.order + next.order) / 2 : shot.order + 1;
		}

		const [newShot] = await db
			.insert(shots)
			.values({
				sceneId: shot.sceneId,
				order: newOrder,
				description: shot.description,
				shotType: shot.shotType,
				durationSec: shot.durationSec,
				imagePrompt: shot.imagePrompt,
			})
			.returning({ id: shots.id });

		// Clone image assets (only completed images, not videos/audio)
		const sourceAssets = await db
			.select()
			.from(assets)
			.where(
				and(
					eq(assets.shotId, shotId),
					eq(assets.stage, "images"),
					eq(assets.status, "done"),
					isNull(assets.deletedAt),
				),
			);

		if (sourceAssets.length > 0) {
			const newBatchId = randomUUID();
			const copyResults = await Promise.allSettled(
				sourceAssets.map(async (asset, i) => {
					const ext = asset.storageKey?.split(".").pop() ?? "webp";
					const newStorageKey = `projects/${scene.projectId}/scenes/${scene.id}/shots/${newShot.id}/images/${newBatchId}/image-${i + 1}.${ext}`;

					let newUrl = asset.url;
					if (asset.storageKey) {
						newUrl = await copyObject(asset.storageKey, newStorageKey);
					}

					// Copy thumbnail if it exists
					let newThumbKey: string | null = null;
					let newThumbUrl: string | null = null;
					if (asset.thumbnailStorageKey) {
						const thumbExt =
							asset.thumbnailStorageKey.split(".").pop() ?? "webp";
						newThumbKey = `projects/${scene.projectId}/scenes/${scene.id}/shots/${newShot.id}/images/${newBatchId}/thumb-${i + 1}.${thumbExt}`;
						newThumbUrl = await copyObject(
							asset.thumbnailStorageKey,
							newThumbKey,
						);
					}

					return {
						sceneId: shot.sceneId,
						shotId: newShot.id,
						type: asset.type,
						stage: asset.stage,
						prompt: asset.prompt,
						model: asset.model,
						modelSettings: asset.modelSettings,
						url: newUrl,
						storageKey: asset.storageKey ? newStorageKey : null,
						thumbnailUrl: newThumbUrl ?? asset.thumbnailUrl,
						thumbnailStorageKey: newThumbKey,
						width: asset.width,
						height: asset.height,
						status: asset.status as "generating" | "done" | "error",
						isSelected: asset.isSelected,
						batchId: newBatchId,
					};
				}),
			);

			const successfulCopies = copyResults
				.filter(
					(
						r,
					): r is PromiseFulfilledResult<
						(typeof r & { status: "fulfilled" })["value"]
					> => r.status === "fulfilled",
				)
				.map((r) => r.value);

			if (successfulCopies.length > 0) {
				await db.insert(assets).values(successfulCopies);
			}

			// Log any R2 copy failures
			for (const result of copyResults) {
				if (result.status === "rejected") {
					console.error(
						"Failed to copy asset during shot clone:",
						result.reason,
					);
				}
			}
		}

		await recomputeProjectTimestamps(scene.projectId);
	});

// ---------------------------------------------------------------------------
// addShot
// ---------------------------------------------------------------------------

export const addShot = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			sceneId: string;
			description: string;
			shotType: ShotType;
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
	.handler(async ({ data: { sceneId, description, shotType, afterOrder } }) => {
		const { scene } = await assertSceneOwner(sceneId);

		const newOrder = afterOrder + 0.5;

		await db.insert(shots).values({
			sceneId,
			order: newOrder,
			description,
			shotType,
			durationSec: 5,
		});

		await recomputeProjectTimestamps(scene.projectId);
	});

// ---------------------------------------------------------------------------
// reorderShot
// ---------------------------------------------------------------------------

export const reorderShot = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { shotId: string; newOrder: number; targetSceneId?: string }) => {
			if (
				typeof data.newOrder !== "number" ||
				!Number.isFinite(data.newOrder)
			) {
				throw new Error("newOrder must be a finite number");
			}
			return data;
		},
	)
	.handler(async ({ data: { shotId, newOrder, targetSceneId } }) => {
		const { scene } = await assertShotOwner(shotId);

		if (targetSceneId) {
			const { scene: targetScene } = await assertSceneOwner(targetSceneId);
			if (targetScene.projectId !== scene.projectId) {
				throw new Error("Cannot move shot to a scene in a different project");
			}
			await db
				.update(shots)
				.set({ order: newOrder, sceneId: targetSceneId })
				.where(eq(shots.id, shotId));
			// Use targetScene.projectId — after the move the shot belongs to targetScene.
			// The cross-project guard above ensures both are the same project,
			// but being explicit here avoids confusion if that guard is ever changed.
			await recomputeProjectTimestamps(targetScene.projectId);
		} else {
			await db
				.update(shots)
				.set({ order: newOrder })
				.where(eq(shots.id, shotId));
			await recomputeProjectTimestamps(scene.projectId);
		}
	});

// ---------------------------------------------------------------------------
// saveShotPrompt
// ---------------------------------------------------------------------------

export const saveShotPrompt = createServerFn({ method: "POST" })
	.inputValidator((data: { shotId: string; prompt: string }) => data)
	.handler(async ({ data: { shotId, prompt } }) => {
		await assertShotOwner(shotId);
		await db
			.update(shots)
			.set({ imagePrompt: prompt })
			.where(eq(shots.id, shotId));
	});

// ---------------------------------------------------------------------------
// generateShotImagePrompt
// ---------------------------------------------------------------------------

export const generateShotImagePrompt = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			shotId: string;
			useProjectContext?: boolean;
			usePrevShotContext?: boolean;
		}) => data,
	)
	.handler(
		async ({
			data: { shotId, useProjectContext = true, usePrevShotContext = true },
		}) => {
			const { userId, shot, scene, project } = await assertShotOwner(shotId);
			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);

			// Load all shots in this scene for context
			const sceneShots = await db.query.shots.findMany({
				where: and(eq(shots.sceneId, scene.id), isNull(shots.deletedAt)),
				orderBy: asc(shots.order),
			});
			const shotIdx = sceneShots.findIndex((s) => s.id === shotId);
			const prevShot = shotIdx > 0 ? sceneShots[shotIdx - 1] : null;
			const nextShot =
				shotIdx < sceneShots.length - 1 ? sceneShots[shotIdx + 1] : null;

			const intake = settings?.intake;
			const characters = settings?.characters;
			const characterContext = characters?.length
				? `Key characters:\n${characters.map((c) => `- ${c.name}: ${c.visualPromptFragment}`).join("\n")}`
				: null;
			const projectContext = [
				intake?.concept ? `Project concept: ${intake.concept}` : null,
				intake?.purpose ? `Purpose: ${intake.purpose}` : null,
				intake?.style?.length
					? `Visual style: ${intake.style.join(", ")}`
					: null,
				intake?.mood?.length ? `Mood: ${intake.mood.join(", ")}` : null,
				intake?.audience ? `Target audience: ${intake.audience}` : null,
				intake?.viewerAction
					? `Viewer action goal: ${intake.viewerAction}`
					: null,
				characterContext,
			]
				.filter(Boolean)
				.join("\n");

			const consistencyRules = useProjectContext
				? "- CRITICAL: The subject and visual style must be consistent with the project concept — do NOT invent new subjects or themes not present in the project"
				: "- Generate a vivid, specific image prompt based solely on the shot description provided";

			const systemPrompt = `You are an expert image prompt engineer for AI image generation models like Flux and Stable Diffusion.

You MUST use this exact structured format:

[Subject]: Describe the main subject(s) — appearance, expression, pose, clothing.

[Action]: What the subject is doing in this specific moment.

[Environment]: The setting and surrounding elements.

[Cinematography]: Camera angle, lens, depth of field, framing, composition.

[Lighting/Style]: Lighting, color grading, mood, artistic style.

[Technical]: Photography/rendering style and quality descriptors.

Rules:
- Each section 1-2 sentences, extremely specific
${consistencyRules}
- If the shot description mentions text, calligraphy, or inscriptions visible in the scene, include them verbatim in [Environment] as a physical element
- If the shot describes a subject as small/tiny/distant relative to the environment, encode that scale relationship explicitly in [Subject] and [Cinematography]
- Use professional cinematic language
- Do NOT include meta-instructions like "generate an image of"

Return ONLY the structured prompt, nothing else.`;

			const contextParts = [
				useProjectContext
					? `PROJECT CONTEXT:\n${projectContext || `Project: ${project.name}`}`
					: null,
				useProjectContext
					? `SCENE CONTEXT:\nScene description: ${scene.description}`
					: null,
				usePrevShotContext && prevShot
					? `PREVIOUS SHOT: ${prevShot.description}`
					: null,
				`CURRENT SHOT (generate prompt for this): ${shot.description}`,
				usePrevShotContext && nextShot
					? `NEXT SHOT: ${nextShot.description}`
					: null,
			]
				.filter(Boolean)
				.join("\n\n");

			const userMessage = contextParts;

			const replicate = new Replicate({ auth: apiKey });
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				REPLICATE_TIMEOUT_MS,
			);

			try {
				const chunks: string[] = [];
				for await (const event of replicate.stream(
					"anthropic/claude-4.5-haiku",
					{
						input: {
							prompt: `${systemPrompt}\n\n${userMessage}`,
							max_tokens: 1024,
							temperature: 0.8,
						},
						signal: controller.signal,
					},
				)) {
					chunks.push(String(event));
				}
				const generatedPrompt = chunks.join("").trim();
				if (!generatedPrompt)
					throw new Error("AI returned an empty response — please try again");

				await db
					.update(shots)
					.set({ imagePrompt: generatedPrompt })
					.where(eq(shots.id, shotId));
				return { prompt: generatedPrompt };
			} finally {
				clearTimeout(timeout);
			}
		},
	);

// ---------------------------------------------------------------------------
// enhanceShotImagePrompt
// ---------------------------------------------------------------------------

export const enhanceShotImagePrompt = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			shotId: string;
			userPrompt: string;
			useProjectContext?: boolean;
			usePrevShotContext?: boolean;
		}) => data,
	)
	.handler(
		async ({
			data: {
				shotId,
				userPrompt,
				useProjectContext = true,
				usePrevShotContext = true,
			},
		}) => {
			const { userId, shot, scene, project } = await assertShotOwner(shotId);
			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);

			// Load adjacent shots for context
			const sceneShots = await db.query.shots.findMany({
				where: and(eq(shots.sceneId, scene.id), isNull(shots.deletedAt)),
				orderBy: asc(shots.order),
			});
			const shotIdx = sceneShots.findIndex((s) => s.id === shotId);
			const prevShot = shotIdx > 0 ? sceneShots[shotIdx - 1] : null;
			const nextShot =
				shotIdx < sceneShots.length - 1 ? sceneShots[shotIdx + 1] : null;

			const intake = settings?.intake;
			const characters = settings?.characters;
			const characterContext = characters?.length
				? `Key characters:\n${characters.map((c) => `- ${c.name}: ${c.visualPromptFragment}`).join("\n")}`
				: null;
			const projectContext = [
				intake?.concept ? `Project concept: ${intake.concept}` : null,
				intake?.style?.length
					? `Visual style: ${intake.style.join(", ")}`
					: null,
				intake?.mood?.length ? `Mood: ${intake.mood.join(", ")}` : null,
				characterContext,
			]
				.filter(Boolean)
				.join("\n");

			const systemPrompt = `You are an expert image prompt engineer for AI image generation models like Flux and Stable Diffusion.
The user has written a natural language description of what they want. Reformat and enhance it into the structured prompt format below — adding technical cinematic details while preserving every element the user mentioned, especially text/calligraphy, scale relationships, and specific visual details.

You MUST use this exact structured format:

[Subject]: Main subject(s) with appearance, expression, pose. Preserve any scale relationships exactly (tiny, enormous, silhouette, etc.).

[Action]: What the subject is doing.

[Environment]: The setting. If the user mentioned text, calligraphy, inscriptions, or overlays, include them verbatim here as physically present in the scene.

[Cinematography]: Camera angle, lens, depth of field, framing, composition.

[Lighting/Style]: Lighting, color grading, mood, artistic style.

[Technical]: Photography/rendering style and quality descriptors.

Rules:
- Preserve ALL elements the user mentioned — do not drop anything
- Add technical details to enrich but never override the user's intent
- Use professional cinematic language
${useProjectContext && projectContext ? `\nProject context:\n${projectContext}` : ""}
${useProjectContext ? `Scene: ${scene.description}` : ""}
Shot: ${shot.description}
${usePrevShotContext && prevShot ? `\nPrevious shot: ${prevShot.description}` : ""}
${usePrevShotContext && nextShot ? `\nNext shot: ${nextShot.description}` : ""}
Return ONLY the structured prompt, nothing else.`;

			const replicate = new Replicate({ auth: apiKey });
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				REPLICATE_TIMEOUT_MS,
			);
			try {
				const chunks: string[] = [];
				for await (const event of replicate.stream(
					"anthropic/claude-4.5-haiku",
					{
						input: {
							prompt: `${systemPrompt}\n\nUser's prompt to enhance:\n${userPrompt}`,
							max_tokens: 1024,
							temperature: 0.7,
						},
						signal: controller.signal,
					},
				)) {
					chunks.push(String(event));
				}
				const enhanced = chunks.join("").trim();
				if (!enhanced)
					throw new Error("AI returned an empty response — please try again");
				return { prompt: enhanced };
			} finally {
				clearTimeout(timeout);
			}
		},
	);

// ---------------------------------------------------------------------------
// enhanceTransitionVideoPrompt
// ---------------------------------------------------------------------------

export const enhanceTransitionVideoPrompt = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			fromShotId: string;
			toShotId: string;
			userPrompt: string;
			useProjectContext?: boolean;
			usePrevShotContext?: boolean;
		}) => data,
	)
	.handler(
		async ({
			data: {
				fromShotId,
				toShotId,
				userPrompt,
				useProjectContext = true,
				usePrevShotContext = true,
			},
		}) => {
			const {
				userId,
				shot: fromShot,
				project,
				scene,
			} = await assertShotOwner(fromShotId);
			const { shot: toShot, scene: toScene } = await assertShotOwner(toShotId);

			if (toScene.projectId !== scene.projectId) {
				throw new Error(
					"Cannot enhance transition prompt between shots from different projects",
				);
			}

			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);

			const intake = settings?.intake;
			const characters = settings?.characters;
			const characterContext = characters?.length
				? `Key characters:\n${characters.map((c) => `- ${c.name}: ${c.visualPromptFragment}`).join("\n")}`
				: null;
			const styleCtx =
				useProjectContext && intake?.style?.length
					? `Visual style: ${intake.style.join(", ")}`
					: "";

			const projectContextLines = useProjectContext
				? [
						intake?.concept ? `Project concept: ${intake.concept}` : null,
						intake?.purpose ? `Purpose: ${intake.purpose}` : null,
						styleCtx || null,
						intake?.mood?.length ? `Mood: ${intake.mood.join(", ")}` : null,
						characterContext,
					]
						.filter(Boolean)
						.join("\n")
				: null;

			const sceneCtx =
				usePrevShotContext && scene.description
					? `Scene: ${scene.description}`
					: null;

			const contextBlock = [
				useProjectContext
					? `PROJECT CONTEXT:\n${projectContextLines || `Project: ${project.name}`}`
					: null,
				sceneCtx,
				`From: ${fromShot.description}`,
				`To: ${toShot.description}`,
			]
				.filter(Boolean)
				.join("\n\n");

			const systemPrompt = `You are an expert prompt engineer for Kling AI video generation.
The user has written a natural language motion description. Reformat and enhance it into the structured video prompt format below — adding technical motion details while preserving the user's intent exactly.

Use this exact structured format:

[Cinematography]: Camera movement direction, speed, technique.

[Subject]: How subjects move or transform during the transition.

[Action]: The specific motion arc from the start frame to the end frame.

[Context]: Environmental elements and how they shift.

[Style & Ambiance]: Visual feel, lighting changes, mood continuity.

Rules:
- Preserve ALL motion elements the user mentioned
- Add specific direction/speed details to enrich but not override intent
- Write in present tense

Transition context:
${contextBlock}

Return ONLY the structured prompt, nothing else.`;

			const replicate = new Replicate({ auth: apiKey });
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				REPLICATE_TIMEOUT_MS,
			);
			try {
				const chunks: string[] = [];
				for await (const event of replicate.stream(
					"anthropic/claude-4.5-haiku",
					{
						input: {
							prompt: `${systemPrompt}\n\nUser's prompt to enhance:\n${userPrompt}`,
							max_tokens: 1024,
							temperature: 0.7,
						},
						signal: controller.signal,
					},
				)) {
					chunks.push(String(event));
				}
				const enhanced = chunks.join("").trim();
				if (!enhanced)
					throw new Error("AI returned an empty response — please try again");
				return { prompt: enhanced };
			} finally {
				clearTimeout(timeout);
			}
		},
	);

// ---------------------------------------------------------------------------
// generateShotImages
// ---------------------------------------------------------------------------

export const generateShotImages = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			shotId: string;
			lane: "start" | "end";
			promptOverride?: string;
			settingsOverrides?: {
				model?: string;
				aspectRatio?: string;
				qualityPreset?: string;
				batchCount?: number;
			};
			referenceImageUrls?: string[];
		}) => {
			const lane = data.lane === "end" ? ("end" as const) : ("start" as const);
			return {
				shotId: data.shotId,
				lane,
				promptOverride: data.promptOverride?.trim() || undefined,
				settingsOverrides: data.settingsOverrides,
				referenceImageUrls: data.referenceImageUrls?.filter(Boolean) ?? [],
			};
		},
	)
	.handler(
		async ({
			data: {
				shotId,
				lane,
				promptOverride,
				settingsOverrides,
				referenceImageUrls,
			},
		}) => {
			const { userId, shot, scene, project } = await assertShotOwner(shotId);
			const apiKey = await getUserApiKey(userId);

			const settings = normalizeProjectSettings(project.settings);

			// Default settings from last-used asset for this shot, then fallback to app defaults
			const lastAsset = await db.query.assets.findFirst({
				where: and(
					eq(assets.shotId, shotId),
					eq(assets.stage, "images"),
					isNull(assets.deletedAt),
				),
				orderBy: desc(assets.createdAt),
			});
			const lastSettings = lastAsset?.modelSettings as Record<
				string,
				unknown
			> | null;

			const imageDefaults = normalizeImageDefaults({
				...lastSettings,
				...settingsOverrides,
			});

			const finalPrompt =
				promptOverride ??
				shot.imagePrompt ??
				buildLanePrompt(shot.description, lane, settings?.intake);
			const isNanoBanana = imageDefaults.model === "google/nano-banana-pro";
			const outputExtension = isNanoBanana ? "png" : "webp";
			const outputContentType = isNanoBanana ? "image/png" : "image/webp";

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
						shotId: shot.id,
						type,
						stage: "images" as const,
						prompt: finalPrompt,
						model: imageDefaults.model,
						modelSettings: {
							aspectRatio: imageDefaults.aspectRatio,
							qualityPreset: imageDefaults.qualityPreset,
							batchCount: generationCount,
							outputFormat: outputExtension,
							generationLane: lane,
						},
						status: "generating" as const,
						isSelected: false,
						batchId,
						generationId: batchId,
					})),
				)
				.returning({ id: assets.id });

			// Persist the prompt to the shot so it survives invalidation
			await db
				.update(shots)
				.set({ imagePrompt: finalPrompt })
				.where(eq(shots.id, shot.id));

			const queuedAssetIds = placeholders.map((row) => row.id);
			const replicate = new Replicate({ auth: apiKey });
			const replicateInput = isNanoBanana
				? {
						prompt: finalPrompt,
						aspect_ratio: imageDefaults.aspectRatio,
						output_format: "png" as const,
						...(referenceImageUrls.length > 0
							? { image_input: referenceImageUrls }
							: {}),
					}
				: {
						prompt: finalPrompt,
						aspect_ratio: imageDefaults.aspectRatio,
						num_outputs: 1,
						output_format: "webp" as const,
						num_inference_steps: qualityPresetToSteps(
							imageDefaults.qualityPreset,
						),
					};

			// Fire all Replicate calls in parallel
			const results = await Promise.allSettled(
				queuedAssetIds.map(async (assetId, i) => {
					const output = await replicate.run(
						imageDefaults.model as `${string}/${string}`,
						{
							input: replicateInput,
						},
					);

					const urls = parseReplicateImageUrls(output);
					const sourceUrl = urls[0];

					if (!sourceUrl) {
						throw new Error(
							`No output URL found (${summarizeReplicateOutput(output)}).`,
						);
					}

					const storageKey = `projects/${project.id}/scenes/${scene.id}/shots/${shot.id}/images/${batchId}/image-${i + 1}.${outputExtension}`;
					const storedUrl = await uploadFromUrl(
						sourceUrl,
						storageKey,
						outputContentType,
					);

					await db
						.update(assets)
						.set({
							url: storedUrl,
							storageKey,
							status: "done",
							errorMessage: null,
						})
						.where(eq(assets.id, assetId));
				}),
			);

			let completedCount = 0;
			let failedCount = 0;
			for (let i = 0; i < results.length; i++) {
				if (results[i].status === "fulfilled") {
					completedCount += 1;
				} else {
					const reason = (results[i] as PromiseRejectedResult).reason;
					const errorMessage =
						reason instanceof Error
							? reason.message
							: "Image generation failed";
					await db
						.update(assets)
						.set({ status: "error", errorMessage })
						.where(eq(assets.id, queuedAssetIds[i]));
					failedCount += 1;
				}
			}

			// Only advance scene stage if at least one image succeeded
			if (completedCount > 0 && scene.stage === "script") {
				await db
					.update(scenes)
					.set({ stage: "images" })
					.where(eq(scenes.id, scene.id));
			}

			return {
				queuedCount: queuedAssetIds.length,
				completedCount,
				failedCount,
				batchId,
			};
		},
	);

// ---------------------------------------------------------------------------
// pollShotAssets
// ---------------------------------------------------------------------------

export const pollShotAssets = createServerFn({ method: "POST" })
	.inputValidator((data: { shotId: string }) => data)
	.handler(async ({ data: { shotId } }) => {
		await assertShotOwner(shotId);

		const shotAssets = await db.query.assets.findMany({
			where: and(
				eq(assets.shotId, shotId),
				eq(assets.stage, "images"),
				isNull(assets.deletedAt),
			),
			orderBy: desc(assets.createdAt),
		});

		const generating = shotAssets.filter((a) => a.status === "generating");
		const done = shotAssets.filter((a) => a.status === "done");
		const errored = shotAssets.filter((a) => a.status === "error");

		return {
			generatingCount: generating.length,
			doneCount: done.length,
			erroredCount: errored.length,
			isGenerating: generating.length > 0,
		};
	});

// ---------------------------------------------------------------------------
// generateShotVideoPrompt
// ---------------------------------------------------------------------------

export const generateShotVideoPrompt = createServerFn({ method: "POST" })
	.inputValidator((data: { shotId: string }) => data)
	.handler(async ({ data: { shotId } }) => {
		const { userId, shot, project } = await assertShotOwner(shotId);
		const apiKey = await getUserApiKey(userId);
		const settings = normalizeProjectSettings(project.settings);
		const characters = settings?.characters;
		const characterContext = characters?.length
			? `Key characters:\n${characters.map((c) => `- ${c.name}: ${c.visualPromptFragment}`).join("\n")}`
			: null;

		const systemPrompt = `You are an expert prompt engineer for Kling AI video generation.
Given a shot description, write a video motion prompt using this exact structured format:

[Cinematography]: Describe the camera movement precisely — type of shot, direction, speed, and how it evolves. Be specific (e.g. "slow dolly forward", "rapid zoom-out accelerating into aerial bird's-eye view", "static locked-off medium shot").

[Subject]: Describe the main subject(s) and how they appear or change as the camera moves. Include relevant visual details only where they support understanding the motion.

[Action]: Describe exactly what the subject does during the clip — movement, gestures, direction, speed, and how the action resolves by the end of the shot.

[Context]: Describe the environment and any environmental motion — wind, crowds, light shifts, background elements in motion.

[Style & Ambiance]: Visual style, mood, lighting quality, and overall aesthetic. Be specific about the feel and tone.

Rules:
- Write each section as 1-3 dense, specific sentences
- Present tense throughout
- Prioritize motion and action — static description belongs in the start frame image, not here
- Be precise about speed and direction — avoid vague terms like "dynamic" or "cinematic"
- The start frame image already establishes appearance — reference it only to anchor motion
${settings?.intake?.style?.length ? `- Visual style: ${settings.intake.style.join(", ")}` : ""}
${settings?.intake?.mood?.length ? `- Mood: ${settings.intake.mood.join(", ")}` : ""}
${characterContext ? `- ${characterContext}` : ""}

Return ONLY the structured prompt, nothing else.`;

		const userMessage = `Shot description: ${shot.description}`;

		const replicate = new Replicate({ auth: apiKey });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

		try {
			const chunks: string[] = [];
			for await (const event of replicate.stream("anthropic/claude-4.5-haiku", {
				input: {
					prompt: `${systemPrompt}\n\n${userMessage}`,
					max_tokens: 1024,
					temperature: 0.7,
				},
				signal: controller.signal,
			})) {
				chunks.push(String(event));
			}
			const generatedPrompt = chunks.join("").trim();
			if (!generatedPrompt)
				throw new Error("AI returned an empty response — please try again");
			return { prompt: generatedPrompt };
		} finally {
			clearTimeout(timeout);
		}
	});

// ---------------------------------------------------------------------------
// generateShotVideo — fire-and-forget, returns immediately with assetId
// ---------------------------------------------------------------------------

export const generateShotVideo = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			shotId: string;
			prompt: string;
			mode?: "standard" | "pro";
			generateAudio?: boolean;
		}) => data,
	)
	.handler(
		async ({
			data: { shotId, prompt, mode = "pro", generateAudio = false },
		}) => {
			const { userId, shot, scene } = await assertShotOwner(shotId);
			const apiKey = await getUserApiKey(userId);

			const selectedAsset = await db.query.assets.findFirst({
				where: and(
					eq(assets.shotId, shotId),
					inArray(assets.type, ["start_image", "end_image", "image"]),
					eq(assets.isSelected, true),
					eq(assets.status, "done"),
					isNull(assets.deletedAt),
				),
			});
			if (!selectedAsset?.url)
				throw new Error(
					"No selected image found — select a start frame image first",
				);

			// Submit prediction to Replicate — do NOT await completion
			const replicate = new Replicate({ auth: apiKey });
			const prediction = await replicate.predictions.create({
				model: "kwaivgi/kling-v3-omni-video" as `${string}/${string}`,
				input: {
					prompt,
					start_image: selectedAsset.url,
					duration: Math.max(3, Math.min(15, shot.durationSec)),
					mode,
					generate_audio: generateAudio,
				},
			});

			const [placeholder] = await db
				.insert(assets)
				.values({
					sceneId: scene.id,
					shotId: shot.id,
					type: "video" as const,
					stage: "video" as const,
					prompt,
					model: "kwaivgi/kling-v3-omni-video",
					modelSettings: { duration: shot.durationSec, mode, generateAudio },
					status: "generating" as const,
					isSelected: false,
					batchId: randomUUID(),
					generationId: prediction.id,
				})
				.returning({ id: assets.id });

			return { assetId: placeholder.id };
		},
	);

// ---------------------------------------------------------------------------
// pollVideoAsset — called by client to check generation progress
// ---------------------------------------------------------------------------

export const pollVideoAsset = createServerFn({ method: "POST" })
	.inputValidator((data: { assetId: string }) => data)
	.handler(async ({ data: { assetId } }) => {
		const { userId, asset, shot, scene, project } =
			await assertAssetOwnerViaShot(assetId);

		if (asset.status === "done")
			return { status: "done" as const, url: asset.url };
		if (asset.status === "error")
			return { status: "error" as const, errorMessage: asset.errorMessage };

		const predictionId = asset.generationId;
		if (!predictionId) throw new Error("No prediction ID found on asset");

		const apiKey = await getUserApiKey(userId);
		const replicate = new Replicate({ auth: apiKey });

		const prediction = await replicate.predictions.get(predictionId);

		if (prediction.status === "succeeded") {
			const output = prediction.output;
			// FileOutput from Replicate SDK: toString() returns the URL (no .url property)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			// biome-ignore lint/suspicious/noExplicitAny: Replicate SDK FileOutput has no typed .url property; cast needed to call String()
			const raw = output as any;
			const str = typeof raw === "string" ? raw : String(raw);
			if (!str.startsWith("http")) {
				throw new Error(
					`Unexpected output format from Kling: ${summarizeReplicateOutput(output)}`,
				);
			}
			const videoUrl = str;

			const storageKey = `projects/${project.id}/scenes/${scene.id}/shots/${shot.id}/videos/${assetId}.mp4`;
			const storedUrl = await uploadFromUrl(videoUrl, storageKey, "video/mp4");
			await db
				.update(assets)
				.set({ url: storedUrl, storageKey, status: "done", errorMessage: null })
				.where(eq(assets.id, assetId));
			return { status: "done" as const, url: storedUrl };
		}

		if (prediction.status === "failed" || prediction.status === "canceled") {
			const errorMessage = prediction.error
				? String(prediction.error)
				: "Video generation failed";
			await db
				.update(assets)
				.set({ status: "error", errorMessage })
				.where(eq(assets.id, assetId));
			return { status: "error" as const, errorMessage };
		}

		return { status: "generating" as const };
	});

// ---------------------------------------------------------------------------
// selectShotAsset
// ---------------------------------------------------------------------------

export const selectShotAsset = createServerFn({ method: "POST" })
	.inputValidator((data: { assetId: string }) => data)
	.handler(async ({ data: { assetId } }) => {
		const { asset, shot } = await assertAssetOwnerViaShot(assetId);

		if (!["start_image", "end_image", "image"].includes(asset.type)) {
			throw new Error("Only image assets can be selected here");
		}
		if (asset.status !== "done") {
			throw new Error("Only completed assets can be selected");
		}

		// Deselect all image-type assets for this shot, then select the target
		await db.transaction(async (tx) => {
			await tx
				.update(assets)
				.set({ isSelected: false })
				.where(
					and(
						eq(assets.shotId, shot.id),
						inArray(assets.type, ["start_image", "end_image", "image"]),
						isNull(assets.deletedAt),
					),
				);
			await tx
				.update(assets)
				.set({ isSelected: true })
				.where(eq(assets.id, asset.id));
		});

		// Mark transition videos stale if they used an image from this shot
		if (asset.shotId) {
			await db
				.update(transitionVideos)
				.set({ stale: true })
				.where(
					and(
						or(
							eq(transitionVideos.fromShotId, asset.shotId),
							eq(transitionVideos.toShotId, asset.shotId),
						),
						isNull(transitionVideos.deletedAt),
						eq(transitionVideos.stale, false),
					),
				);
		}
	});

// ---------------------------------------------------------------------------
// generateTransitionVideoPrompt
// ---------------------------------------------------------------------------

export const generateTransitionVideoPrompt = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			fromShotId: string;
			toShotId: string;
			useProjectContext?: boolean;
			usePrevShotContext?: boolean;
		}) => data,
	)
	.handler(
		async ({
			data: {
				fromShotId,
				toShotId,
				useProjectContext = true,
				usePrevShotContext = true,
			},
		}) => {
			const {
				userId,
				shot: fromShot,
				project,
				scene,
			} = await assertShotOwner(fromShotId);
			const { shot: toShot, scene: toScene } = await assertShotOwner(toShotId);

			if (toScene.projectId !== scene.projectId) {
				throw new Error(
					"Cannot generate transition prompt between shots from different projects",
				);
			}

			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);
			const intake = settings?.intake;
			const characters = settings?.characters;
			const characterContext = characters?.length
				? `Key characters:\n${characters.map((c) => `- ${c.name}: ${c.visualPromptFragment}`).join("\n")}`
				: null;

			const projectContextLines = useProjectContext
				? [
						intake?.concept ? `Project concept: ${intake.concept}` : null,
						intake?.purpose ? `Purpose: ${intake.purpose}` : null,
						intake?.style?.length
							? `Visual style: ${intake.style.join(", ")}`
							: null,
						intake?.mood?.length ? `Mood: ${intake.mood.join(", ")}` : null,
						characterContext,
					]
						.filter(Boolean)
						.join("\n")
				: null;

			const sceneCtx =
				usePrevShotContext && scene.description
					? `Scene: ${scene.description}`
					: null;

			const contextBlock = [
				useProjectContext
					? `PROJECT CONTEXT:\n${projectContextLines || `Project: ${project.name}`}`
					: null,
				sceneCtx,
				`Shot A (start): ${fromShot.description}`,
				`Shot B (end): ${toShot.description}`,
			]
				.filter(Boolean)
				.join("\n\n");

			const systemPrompt = `You are an expert prompt engineer for Kling AI video generation.
You are generating a motion prompt for a video transition between two consecutive shots.

The video will start at the first frame image of Shot A and end at the first frame image of Shot B.
Your prompt must describe the MOTION and CAMERA MOVEMENT that naturally bridges these two shots.

${contextBlock}

Focus on:
1. Camera movement direction and speed (zoom, pan, tilt, dolly, aerial ascent/descent, etc.)
2. How the visual composition evolves from Shot A's state to Shot B's state
3. Subject motion during the transition
4. Environmental continuity

Use this exact structured format:

[Cinematography]: Camera movement from Shot A composition to Shot B composition — direction, speed, technique.

[Subject]: How subjects move or transform during the transition.

[Action]: The specific motion arc — what changes between the two frames.

[Context]: Environmental elements and how they shift during the transition.

[Style & Ambiance]: Visual feel, lighting changes, mood continuity.

Rules:
- Write in present tense
- Be specific about direction and speed
- The motion must feel like a NATURAL continuation from Shot A into Shot B
- Do NOT describe static elements — focus on what MOVES
${!useProjectContext ? "- Generate a vivid, specific motion prompt based solely on the shot descriptions provided" : ""}

Return ONLY the structured prompt, nothing else.`;

			const replicate = new Replicate({ auth: apiKey });
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				REPLICATE_TIMEOUT_MS,
			);

			try {
				const chunks: string[] = [];
				for await (const event of replicate.stream(
					"anthropic/claude-4.5-haiku",
					{
						input: { prompt: systemPrompt, max_tokens: 1024, temperature: 0.7 },
						signal: controller.signal,
					},
				)) {
					chunks.push(String(event));
				}
				const generatedPrompt = chunks.join("").trim();
				if (!generatedPrompt)
					throw new Error("AI returned an empty response — please try again");
				return { prompt: generatedPrompt };
			} finally {
				clearTimeout(timeout);
			}
		},
	);

// ---------------------------------------------------------------------------
// generateTransitionVideo
// ---------------------------------------------------------------------------

export const generateTransitionVideo = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			fromShotId: string;
			toShotId: string;
			prompt: string;
			videoModel?: "v3-omni" | "v2.5-turbo";
			mode?: "standard" | "pro";
			generateAudio?: boolean;
			negativePrompt?: string;
			duration?: number;
		}) => data,
	)
	.handler(
		async ({
			data: {
				fromShotId,
				toShotId,
				prompt,
				videoModel = "v3-omni",
				mode = "pro",
				generateAudio = false,
				negativePrompt = "",
				duration,
			},
		}) => {
			const {
				userId,
				shot: fromShot,
				scene,
			} = await assertShotOwner(fromShotId);
			const { scene: toScene } = await assertShotOwner(toShotId);

			if (toScene.projectId !== scene.projectId) {
				throw new Error(
					"Cannot generate transition between shots from different projects",
				);
			}

			const apiKey = await getUserApiKey(userId);

			// Get selected image for from shot
			const fromImage = await db.query.assets.findFirst({
				where: and(
					eq(assets.shotId, fromShotId),
					inArray(assets.type, ["start_image", "end_image", "image"]),
					eq(assets.isSelected, true),
					eq(assets.status, "done"),
					isNull(assets.deletedAt),
				),
			});
			if (!fromImage?.url)
				throw new Error(
					"No selected image for source shot — select an image first",
				);

			// Get selected image for to shot
			const toImage = await db.query.assets.findFirst({
				where: and(
					eq(assets.shotId, toShotId),
					inArray(assets.type, ["start_image", "end_image", "image"]),
					eq(assets.isSelected, true),
					eq(assets.status, "done"),
					isNull(assets.deletedAt),
				),
			});
			if (!toImage?.url)
				throw new Error(
					"No selected image for destination shot — select an image first",
				);

			// Kling requires jpg/jpeg/png — webp is not supported
			function isKlingSupportedFormat(url: string): boolean {
				return /\.(jpg|jpeg|png)(\?|$)/i.test(url);
			}
			if (!isKlingSupportedFormat(fromImage.url)) {
				throw new Error(
					"Start frame image is in WebP format. Kling requires PNG or JPEG. Re-generate images and select a PNG image.",
				);
			}
			if (!isKlingSupportedFormat(toImage.url)) {
				throw new Error(
					"End frame image is in WebP format. Kling requires PNG or JPEG. Re-generate images and select a PNG image.",
				);
			}

			// Build model-specific input
			const replicate = new Replicate({ auth: apiKey });
			const isV25Turbo = videoModel === "v2.5-turbo";
			const modelId = isV25Turbo
				? "kwaivgi/kling-v2.5-turbo-pro"
				: "kwaivgi/kling-v3-omni-video";
			// V2.5 Turbo only supports duration 5 or 10
			const v25Duration = (duration ?? fromShot.durationSec) <= 7 ? 5 : 10;

			const replicateInput = isV25Turbo
				? {
						prompt,
						start_image: fromImage.url,
						end_image: toImage.url,
						duration: v25Duration,
						negative_prompt: negativePrompt || undefined,
					}
				: {
						prompt,
						start_image: fromImage.url,
						end_image: toImage.url,
						duration: Math.max(
							3,
							Math.min(15, duration ?? fromShot.durationSec),
						),
						mode,
						generate_audio: generateAudio,
					};

			const prediction = await replicate.predictions.create({
				model: modelId as `${string}/${string}`,
				input: replicateInput,
			});

			const [placeholder] = await db
				.insert(transitionVideos)
				.values({
					sceneId: scene.id,
					fromShotId,
					toShotId,
					fromImageId: fromImage.id,
					toImageId: toImage.id,
					prompt,
					model: modelId,
					modelSettings: isV25Turbo
						? { duration: v25Duration, negativePrompt }
						: { duration: fromShot.durationSec, mode, generateAudio },
					generationId: prediction.id,
					status: "generating",
					isSelected: false,
					stale: false,
				})
				.returning({ id: transitionVideos.id });

			return { transitionVideoId: placeholder.id };
		},
	);

// ---------------------------------------------------------------------------
// pollTransitionVideo
// ---------------------------------------------------------------------------

export const pollTransitionVideo = createServerFn({ method: "POST" })
	.inputValidator((data: { transitionVideoId: string }) => data)
	.handler(async ({ data: { transitionVideoId } }) => {
		// Get the transition video
		const tv = await db.query.transitionVideos.findFirst({
			where: and(
				eq(transitionVideos.id, transitionVideoId),
				isNull(transitionVideos.deletedAt),
			),
		});
		if (!tv) throw new Error("Transition video not found");

		// Assert ownership on fromShot and verify toShot belongs to the same project
		const { userId, project } = await assertShotOwner(tv.fromShotId);
		const { scene: toScene } = await assertShotOwner(tv.toShotId);
		if (toScene.projectId !== project.id) throw new Error("Unauthorized");
		const apiKey = await getUserApiKey(userId);

		if (tv.status === "done") return { status: "done" as const, url: tv.url };
		if (tv.status === "error")
			return { status: "error" as const, errorMessage: tv.errorMessage };

		if (!tv.generationId) throw new Error("No generation ID found");
		const replicate = new Replicate({ auth: apiKey });

		const prediction = await replicate.predictions.get(tv.generationId);

		if (prediction.status === "succeeded") {
			const output = prediction.output;
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			// biome-ignore lint/suspicious/noExplicitAny: Replicate SDK FileOutput has no typed .url property; cast needed to call String()
			const raw = output as any;
			const str = typeof raw === "string" ? raw : String(raw);
			if (!str.startsWith("http")) {
				throw new Error(
					`Unexpected output format from Kling: ${summarizeReplicateOutput(output)}`,
				);
			}

			const storageKey = `projects/${project.id}/scenes/${tv.sceneId}/transitions/${transitionVideoId}.mp4`;
			const storedUrl = await uploadFromUrl(str, storageKey, "video/mp4");

			await db
				.update(transitionVideos)
				.set({ url: storedUrl, storageKey, status: "done", errorMessage: null })
				.where(eq(transitionVideos.id, transitionVideoId));

			return { status: "done" as const, url: storedUrl };
		}

		if (prediction.status === "failed" || prediction.status === "canceled") {
			const rawErr = prediction.error;
			const errorMessage = rawErr
				? typeof rawErr === "string"
					? rawErr
					: (((rawErr as Record<string, unknown>).detail as string) ??
						JSON.stringify(rawErr))
				: "Video generation failed";
			await db
				.update(transitionVideos)
				.set({ status: "error", errorMessage })
				.where(eq(transitionVideos.id, transitionVideoId));
			return { status: "error" as const, errorMessage };
		}

		return { status: "generating" as const };
	});

// ---------------------------------------------------------------------------
// selectTransitionVideo
// ---------------------------------------------------------------------------

export const selectTransitionVideo = createServerFn({ method: "POST" })
	.inputValidator((data: { transitionVideoId: string }) => data)
	.handler(async ({ data: { transitionVideoId } }) => {
		const tv = await db.query.transitionVideos.findFirst({
			where: and(
				eq(transitionVideos.id, transitionVideoId),
				isNull(transitionVideos.deletedAt),
			),
		});
		if (!tv) throw new Error("Transition video not found");
		if (tv.status !== "done")
			throw new Error("Only completed transition videos can be selected");

		// Assert ownership on fromShot and verify toShot belongs to the same project
		const { scene: fromScene } = await assertShotOwner(tv.fromShotId);
		const { scene: toScene } = await assertShotOwner(tv.toShotId);
		if (toScene.projectId !== fromScene.projectId)
			throw new Error("Unauthorized");

		await db.transaction(async (tx) => {
			// Deselect all for this (from, to) pair
			await tx
				.update(transitionVideos)
				.set({ isSelected: false })
				.where(
					and(
						eq(transitionVideos.fromShotId, tv.fromShotId),
						eq(transitionVideos.toShotId, tv.toShotId),
						isNull(transitionVideos.deletedAt),
					),
				);
			// Select this one
			await tx
				.update(transitionVideos)
				.set({ isSelected: true })
				.where(eq(transitionVideos.id, transitionVideoId));
		});
	});

// ---------------------------------------------------------------------------
// deleteTransitionVideo
// ---------------------------------------------------------------------------

export const deleteTransitionVideo = createServerFn({ method: "POST" })
	.inputValidator((data: { transitionVideoId: string }) => data)
	.handler(async ({ data: { transitionVideoId } }) => {
		const tv = await db.query.transitionVideos.findFirst({
			where: and(
				eq(transitionVideos.id, transitionVideoId),
				isNull(transitionVideos.deletedAt),
			),
		});
		if (!tv) throw new Error("Transition video not found");

		await assertShotOwner(tv.fromShotId);

		if (tv.storageKey) {
			await deleteObject(tv.storageKey).catch((err) =>
				console.error("R2 deleteObject failed for key:", tv.storageKey, err),
			);
		}

		await db
			.update(transitionVideos)
			.set({ deletedAt: new Date() })
			.where(eq(transitionVideos.id, transitionVideoId));
	});

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

		const elevenLabsKey = await getUserElevenLabsKey(userId);

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
			})
			.returning({ id: assets.id });

		try {
			const { audio, contentType } = await generateSpeech({
				apiKey: elevenLabsKey,
				text: script,
				voiceId,
			});

			const storageKey = `projects/${project.id}/scenes/${scene.id}/voiceover/${placeholder.id}.mp3`;
			const publicUrl = await uploadBuffer(audio, storageKey, contentType);

			// Estimate duration from audio size (mp3 ~128kbps = 16KB/s)
			const estimatedDurationMs = Math.round((audio.length / 16_000) * 1000);

			await db
				.update(assets)
				.set({
					url: publicUrl,
					storageKey,
					status: "done" as const,
					durationMs: estimatedDurationMs,
					fileSizeBytes: audio.length,
					errorMessage: null,
				})
				.where(eq(assets.id, placeholder.id));

			return {
				assetId: placeholder.id,
				url: publicUrl,
				durationMs: estimatedDurationMs,
			};
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Voiceover generation failed";
			await db
				.update(assets)
				.set({ status: "error" as const, errorMessage })
				.where(eq(assets.id, placeholder.id));
			throw err;
		}
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
		const elevenLabsKey = await getUserElevenLabsKey(userId);

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
			})
			.returning({ id: assets.id });

		try {
			const { audio, contentType } = await generateSoundEffect({
				apiKey: elevenLabsKey,
				text: prompt,
				durationSeconds,
			});

			const storageKey = `projects/${project.id}/scenes/${scene.id}/sfx/${placeholder.id}.mp3`;
			const publicUrl = await uploadBuffer(audio, storageKey, contentType);
			const estimatedDurationMs = Math.round((audio.length / 16_000) * 1000);

			await db
				.update(assets)
				.set({
					url: publicUrl,
					storageKey,
					status: "done" as const,
					durationMs: estimatedDurationMs,
					fileSizeBytes: audio.length,
					errorMessage: null,
				})
				.where(eq(assets.id, placeholder.id));

			return {
				assetId: placeholder.id,
				url: publicUrl,
				durationMs: estimatedDurationMs,
			};
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : "Sound effect generation failed";
			await db
				.update(assets)
				.set({ status: "error" as const, errorMessage })
				.where(eq(assets.id, placeholder.id));
			throw err;
		}
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
		const apiKey = await getUserApiKey(userId);

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
			})
			.returning({ id: assets.id });

		try {
			const replicate = new Replicate({ auth: apiKey });
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				REPLICATE_TIMEOUT_MS,
			);

			let output: unknown;
			try {
				output = await replicate.run("meta/musicgen" as `${string}/${string}`, {
					input: {
						prompt,
						duration: durationSeconds ?? 8,
						model_version: "stereo-melody-large",
						output_format: "mp3",
					},
					signal: controller.signal,
				});
			} finally {
				clearTimeout(timeout);
			}

			// MusicGen returns a URL string or FileOutput
			const urls = parseReplicateImageUrls(output);
			if (urls.length === 0) {
				throw new Error(
					`MusicGen returned no audio URL. Output: ${summarizeReplicateOutput(output)}`,
				);
			}

			const audioUrl = urls[0];
			const storageKey = `projects/${project.id}/scenes/${scene.id}/music/${placeholder.id}.mp3`;
			const publicUrl = await uploadFromUrl(audioUrl, storageKey);

			const estimatedDurationMs = (durationSeconds ?? 8) * 1000;

			await db
				.update(assets)
				.set({
					url: publicUrl,
					storageKey,
					status: "done" as const,
					durationMs: estimatedDurationMs,
					errorMessage: null,
				})
				.where(eq(assets.id, placeholder.id));

			return {
				assetId: placeholder.id,
				url: publicUrl,
				durationMs: estimatedDurationMs,
			};
		} catch (err) {
			const errorMessage =
				err instanceof Error
					? err.message
					: "Background music generation failed";
			await db
				.update(assets)
				.set({ status: "error" as const, errorMessage })
				.where(eq(assets.id, placeholder.id));
			throw err;
		}
	});
