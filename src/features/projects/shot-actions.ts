"use server";

import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { runs } from "@trigger.dev/sdk";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, scenes, shots, transitionVideos } from "@/db/schema";
import {
	assertAssetOwnerViaShot,
	assertSceneOwner,
	assertShotOwner,
} from "@/lib/assert-project-owner.server";
import { copyObject, deleteObject } from "@/lib/r2.server";
import { generateShotImageAsset, startShotVideoGeneration } from "@/trigger";
import {
	buildLanePrompt,
	getUserApiKey,
} from "./image-generation-helpers.server";
import {
	normalizeImageDefaults,
	normalizeProjectSettings,
	normalizeVideoDefaults,
} from "./project-normalize";
import type {
	ShotType,
	TriggerRunSummary,
	TriggerRunUiStatus,
} from "./project-types";

const REPLICATE_TIMEOUT_MS = 60_000;
const STALE_IMAGE_GENERATION_MS = 6 * 60 * 1000;
const ORPHANED_IMAGE_GENERATION_ERROR =
	"Image generation stopped before completion. Please try again.";

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
// mapTriggerRunStatus
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

// ---------------------------------------------------------------------------
// reconcileGeneratingImageAssets
// ---------------------------------------------------------------------------

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
				? "- CRITICAL: The subject, setting, and visual style must stay consistent with the project concept — do NOT invent new subjects or themes not present in the project"
				: "- Base the prompt only on the current shot description";

			const systemPrompt = `You are an expert prompt writer for modern text-to-image models.

Write a concise, production-quality prompt for a single still image based on the current shot.
Write the result as 1 to 4 natural-language sentences, not a labeled template.

Prompt priorities:
- the main subject and exact frozen pose/expression visible in frame
- the environment and key props/background elements
- framing/composition/camera angle only when it materially improves the image
- lighting, mood, and visual style
- any essential visible text, calligraphy, or graphic elements

Rules:
${consistencyRules}
- This is a still image prompt, not a video prompt
- Do NOT describe camera movement, motion over time, transitions, animation, or what happens next
- Use adjacent shots only for continuity of wardrobe, environment, props, and composition
- Keep it specific but compact; avoid overly verbose taxonomies and stacked adjectives
- If scale matters (tiny subject, huge environment, distant silhouette), state it clearly
- Do NOT include meta-instructions like "generate an image of"

Return ONLY the final prompt, nothing else.`;

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

			const systemPrompt = `You are an expert prompt writer for modern text-to-image models.
The user wrote a natural-language image idea. Rewrite it into a stronger prompt for a single still image while preserving all important intent.

Write the result as 1 to 4 natural-language sentences, not a labeled template.

Rules:
- Preserve all visually important elements the user mentioned
- Improve clarity, composition, lighting, and style wording only where it helps
- Keep it strictly as a still image prompt: no camera movement, animation, transitions, or sequential action
- If adjacent-shot context is present, use it only for continuity of wardrobe, environment, props, and composition
- Keep it specific but compact; remove fluff and avoid over-explaining
- If the user mentioned visible text, calligraphy, signage, or graphics, preserve that explicitly
- If scale matters, preserve it exactly
${useProjectContext && projectContext ? `\nProject context:\n${projectContext}` : ""}
${useProjectContext ? `Scene: ${scene.description}` : ""}
Shot: ${shot.description}
${usePrevShotContext && prevShot ? `\nPrevious shot: ${prevShot.description}` : ""}
${usePrevShotContext && nextShot ? `\nNext shot: ${nextShot.description}` : ""}
Return ONLY the final prompt, nothing else.`;

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
			settingsOverrides?: unknown;
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
				shot.imagePrompt ??
				buildLanePrompt(shot.description, lane, settings?.intake);
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

			// Persist the prompt to the shot so it survives invalidation
			await db
				.update(shots)
				.set({ imagePrompt: finalPrompt })
				.where(eq(shots.id, shot.id));

			// Trigger all image generation tasks in parallel
			const enqueuedRuns = await Promise.all(
				placeholders.map(async (placeholder, index) => {
					const handle = await generateShotImageAsset.trigger({
						assetId: placeholder.id,
						userId,
						projectId: project.id,
						sceneId: scene.id,
						shotId: shot.id,
						generationId: placeholder.generationId ?? batchId,
						batchId,
						sequenceIndex: index,
						prompt: finalPrompt,
						model: imageDefaults.model,
						modelOptions: imageDefaults.modelOptions,
						referenceImageUrls,
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

// ---------------------------------------------------------------------------
// pollShotAssets
// ---------------------------------------------------------------------------

export const pollShotAssets = createServerFn({ method: "POST" })
	.inputValidator((data: { shotId: string }) => data)
	.handler(async ({ data: { shotId } }) => {
		await assertShotOwner(shotId);

		await reconcileGeneratingImageAssets({
			scope: "shot",
			scopeId: shotId,
		});

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
			latestErrorMessage: errored[0]?.errorMessage ?? null,
		};
	});

// ---------------------------------------------------------------------------
// getShotImageRunStatuses
// ---------------------------------------------------------------------------

export const getShotImageRunStatuses = createServerFn({ method: "POST" })
	.inputValidator((data: { shotId: string }) => data)
	.handler(async ({ data: { shotId } }) => {
		await assertShotOwner(shotId);

		const generatingAssets = await db.query.assets.findMany({
			where: and(
				eq(assets.shotId, shotId),
				eq(assets.stage, "images"),
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

		const systemPrompt = `You are an expert prompt writer for modern video generation models like Kling.
Given a shot description, write a concise motion prompt for a short video clip.

Use this exact lightweight structure:

[Subject]: Describe the subject only as needed to anchor the motion in 1 short sentence.

[Motion]: Describe what the subject does during the clip in 1-2 short sentences.

[Camera]: Describe the camera behavior in 1 short sentence, only if it materially helps.

[Style]: Describe mood, lighting, and pacing in 1 short sentence.

Rules:
- Present tense throughout
- Prioritize motion and action; do not over-describe static appearance
- Be precise about direction, pacing, and camera behavior when relevant
- Keep every section compact
- The start frame image already establishes appearance, so focus on motion
${settings?.intake?.style?.length ? `- Visual style: ${settings.intake.style.join(", ")}` : ""}
${settings?.intake?.mood?.length ? `- Mood: ${settings.intake.mood.join(", ")}` : ""}
${characterContext ? `- ${characterContext}` : ""}

Return ONLY the final prompt, nothing else.`;

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
		(data: { shotId: string; prompt: string; videoSettings?: unknown }) => data,
	)
	.handler(async ({ data: { shotId, prompt, videoSettings } }) => {
		const { userId, shot, scene } = await assertShotOwner(shotId);
		const normalizedVideo = normalizeVideoDefaults(videoSettings);

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

		const [placeholder] = await db
			.insert(assets)
			.values({
				sceneId: scene.id,
				shotId: shot.id,
				type: "video" as const,
				stage: "video" as const,
				prompt,
				model: normalizedVideo.model,
				modelSettings: normalizedVideo.modelOptions,
				status: "generating" as const,
				isSelected: false,
				batchId: randomUUID(),
			})
			.returning({ id: assets.id });

		const handle = await startShotVideoGeneration.trigger({
			assetId: placeholder.id,
			userId,
			modelId: normalizedVideo.model,
			prompt,
			modelOptions: normalizedVideo.modelOptions,
		});

		await db
			.update(assets)
			.set({ jobId: handle.id })
			.where(eq(assets.id, placeholder.id));

		return { assetId: placeholder.id, jobId: handle.id };
	});

// ---------------------------------------------------------------------------
// pollVideoAsset — called by client to check generation progress
// ---------------------------------------------------------------------------

export const pollVideoAsset = createServerFn({ method: "POST" })
	.inputValidator((data: { assetId: string }) => data)
	.handler(async ({ data: { assetId } }) => {
		const { asset } = await assertAssetOwnerViaShot(assetId);

		if (asset.status === "done")
			return { status: "done" as const, url: asset.url };
		if (asset.status === "error")
			return { status: "error" as const, errorMessage: asset.errorMessage };

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
