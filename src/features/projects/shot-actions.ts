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
import { copyObject, deleteObject, uploadBuffer } from "@/lib/r2.server";
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
	PromptAssetTypeSelection,
	ShotSize,
	ShotType,
	TriggerRunSummary,
	TriggerRunUiStatus,
} from "./project-types";
import {
	buildSceneVisualBrief,
	critiqueAndRewritePrompt,
} from "./prompt-quality.server";
import {
	getPrecisionPromptInstructions,
	resolvePromptAssetType,
} from "./prompt-strategy";
import { isPendingVideoStatus } from "./video-status";

const REPLICATE_TIMEOUT_MS = 60_000;
const REFERENCE_IMAGE_ANALYSIS_TIMEOUT_MS = 45_000;
const PROMPT_MODEL = "openai/gpt-4o-mini";
const STALE_IMAGE_GENERATION_MS = 6 * 60 * 1000;
const ORPHANED_IMAGE_GENERATION_ERROR =
	"Image generation stopped before completion. Please try again.";

async function describeReferenceImage(args: {
	replicate: Replicate;
	imageUrl: string;
	label: string;
	shotDescription: string;
	goal: "image" | "video";
}) {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		REFERENCE_IMAGE_ANALYSIS_TIMEOUT_MS,
	);

	try {
		const chunks: string[] = [];
		for await (const event of args.replicate.stream(PROMPT_MODEL, {
			input: {
				image_input: [args.imageUrl],
				max_completion_tokens: 300,
				system_prompt:
					args.goal === "video"
						? "You analyze a reference image for writing a grounded video generation prompt."
						: "You analyze a reference image for writing a grounded image generation prompt.",
				temperature: 0.3,
				prompt: `This is a ${args.label} reference image for a ${args.goal} generation prompt.

Shot description:
${args.shotDescription}

Describe only the concrete visual information that should guide prompt writing:
- subject appearance, pose, and placement
- framing and camera distance
- environment and key props
- lighting, mood, and visual style

Return 2-4 short sentences. Be specific and visual. Do not speculate beyond what is visible.`,
			},
			signal: controller.signal,
		})) {
			chunks.push(String(event));
		}

		return chunks.join("").trim();
	} finally {
		clearTimeout(timeout);
	}
}

async function buildReferenceImageContext(args: {
	replicate: Replicate;
	imageUrls: string[];
	shotDescription: string;
	goal: "image" | "video";
}) {
	if (args.imageUrls.length === 0) {
		return [] as string[];
	}

	return Promise.all(
		args.imageUrls.slice(0, 4).map(async (imageUrl, index) => {
			try {
				const description = await describeReferenceImage({
					replicate: args.replicate,
					imageUrl,
					label: index === 0 ? "primary" : `additional ${index}`,
					shotDescription: args.shotDescription,
					goal: args.goal,
				});
				return description;
			} catch (error) {
				console.warn(
					`[PromptContext] reference-image-analysis-failed goal=${args.goal} index=${index} error=${error instanceof Error ? error.message : String(error)}`,
				);
				return null;
			}
		}),
	).then((results) =>
		results.filter((value): value is string => Boolean(value)),
	);
}

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
			shotSize?: ShotSize;
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
	.handler(
		async ({
			data: { shotId, description, shotType, shotSize, durationSec },
		}) => {
			const { shot, scene } = await assertShotOwner(shotId);

			const hasUpdates =
				description !== undefined ||
				shotType !== undefined ||
				shotSize !== undefined ||
				durationSec !== undefined;
			if (hasUpdates) {
				await db
					.update(shots)
					.set({
						...(description !== undefined && { description }),
						...(shotType !== undefined && { shotType }),
						...(shotSize !== undefined && { shotSize }),
						...(durationSec !== undefined && { durationSec }),
					})
					.where(eq(shots.id, shotId));
			}

			if (durationSec !== undefined && durationSec !== shot.durationSec) {
				await recomputeProjectTimestamps(scene.projectId);
			}
		},
	);

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
			shotSize?: ShotSize;
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
	.handler(
		async ({
			data: { sceneId, description, shotType, shotSize, afterOrder },
		}) => {
			const { scene } = await assertSceneOwner(sceneId);

			const newOrder = afterOrder + 0.5;

			await db.insert(shots).values({
				sceneId,
				order: newOrder,
				description,
				shotType,
				shotSize: shotSize ?? "medium",
				durationSec: 5,
			});

			await recomputeProjectTimestamps(scene.projectId);
		},
	);

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
			referenceImageUrls?: string[];
			assetTypeOverride?: PromptAssetTypeSelection;
		}) => data,
	)
	.handler(
		async ({
			data: {
				shotId,
				useProjectContext = true,
				usePrevShotContext = true,
				referenceImageUrls = [],
				assetTypeOverride,
			},
		}) => {
			const { userId, shot, scene, project } = await assertShotOwner(shotId);
			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);
			const resolvedAssetType = resolvePromptAssetType({
				override: assetTypeOverride,
				text: `${shot.description}\n${scene.description}\n${referenceImageUrls.join("\n")}`,
				medium: "image",
			});

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
${getPrecisionPromptInstructions({ type: resolvedAssetType, medium: "image" })}

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

			const replicate = new Replicate({ auth: apiKey });
			const [referenceImageContext, sceneVisualBrief] = await Promise.all([
				buildReferenceImageContext({
					replicate,
					imageUrls: referenceImageUrls,
					shotDescription: shot.description,
					goal: "image",
				}),
				buildSceneVisualBrief({
					replicate,
					medium: "image",
					projectName: project.name,
					sceneTitle: scene.title,
					sceneDescription: scene.description,
					projectContext: useProjectContext ? projectContext : null,
					shotContext: [
						prevShot ? `Previous shot: ${prevShot.description}` : null,
						`Current shot: ${shot.description}`,
						nextShot ? `Next shot: ${nextShot.description}` : null,
					]
						.filter(Boolean)
						.join("\n"),
				}),
			]);
			const userMessage = [
				contextParts,
				sceneVisualBrief ? `SCENE VISUAL BRIEF:\n${sceneVisualBrief}` : null,
				referenceImageContext.length > 0
					? `REFERENCE IMAGES:\n${referenceImageContext.map((entry, index) => `Reference ${index + 1}: ${entry}`).join("\n\n")}`
					: null,
			]
				.filter(Boolean)
				.join("\n\n");
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				REPLICATE_TIMEOUT_MS,
			);

			try {
				const chunks: string[] = [];
				for await (const event of replicate.stream(PROMPT_MODEL, {
					input: {
						prompt: `${systemPrompt}\n\n${userMessage}`,
						system_prompt:
							"You are an expert prompt writer for modern text-to-image models.",
						max_completion_tokens: 1024,
						temperature: 0.8,
					},
					signal: controller.signal,
				})) {
					chunks.push(String(event));
				}
				const generatedPrompt = chunks.join("").trim();
				if (!generatedPrompt)
					throw new Error("AI returned an empty response — please try again");
				const finalPrompt = await critiqueAndRewritePrompt({
					replicate,
					medium: "image",
					assetType: resolvedAssetType,
					prompt: generatedPrompt,
					context: [
						sceneVisualBrief
							? `Scene visual brief:\n${sceneVisualBrief}`
							: null,
						`Shot description: ${shot.description}`,
						referenceImageContext.length > 0
							? `Reference images:\n${referenceImageContext.join("\n")}`
							: null,
					]
						.filter(Boolean)
						.join("\n\n"),
				});

				await db
					.update(shots)
					.set({ imagePrompt: finalPrompt })
					.where(eq(shots.id, shotId));
				return { prompt: finalPrompt, assetType: resolvedAssetType };
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
			referenceImageUrls?: string[];
			assetTypeOverride?: PromptAssetTypeSelection;
		}) => data,
	)
	.handler(
		async ({
			data: {
				shotId,
				userPrompt,
				useProjectContext = true,
				usePrevShotContext = true,
				referenceImageUrls = [],
				assetTypeOverride,
			},
		}) => {
			const { userId, shot, scene, project } = await assertShotOwner(shotId);
			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);
			const resolvedAssetType = resolvePromptAssetType({
				override: assetTypeOverride,
				text: `${shot.description}\n${userPrompt}\n${scene.description}`,
				medium: "image",
			});

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
${getPrecisionPromptInstructions({ type: resolvedAssetType, medium: "image" })}
${useProjectContext && projectContext ? `\nProject context:\n${projectContext}` : ""}
${useProjectContext ? `Scene: ${scene.description}` : ""}
Shot: ${shot.description}
${usePrevShotContext && prevShot ? `\nPrevious shot: ${prevShot.description}` : ""}
${usePrevShotContext && nextShot ? `\nNext shot: ${nextShot.description}` : ""}
Return ONLY the final prompt, nothing else.`;

			const replicate = new Replicate({ auth: apiKey });
			const [referenceImageContext, sceneVisualBrief] = await Promise.all([
				buildReferenceImageContext({
					replicate,
					imageUrls: referenceImageUrls,
					shotDescription: shot.description,
					goal: "image",
				}),
				buildSceneVisualBrief({
					replicate,
					medium: "image",
					projectName: project.name,
					sceneTitle: scene.title,
					sceneDescription: scene.description,
					projectContext: useProjectContext ? projectContext : null,
					shotContext: [
						prevShot ? `Previous shot: ${prevShot.description}` : null,
						`Current shot: ${shot.description}`,
						nextShot ? `Next shot: ${nextShot.description}` : null,
					]
						.filter(Boolean)
						.join("\n"),
				}),
			]);
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				REPLICATE_TIMEOUT_MS,
			);
			try {
				const chunks: string[] = [];
				for await (const event of replicate.stream(PROMPT_MODEL, {
					input: {
						prompt: `${systemPrompt}${
							referenceImageContext.length > 0
								? `\n\nReference images:\n${referenceImageContext.map((entry, index) => `Reference ${index + 1}: ${entry}`).join("\n\n")}`
								: ""
						}\n\nUser's prompt to enhance:\n${userPrompt}`,
						system_prompt:
							"You are an expert prompt writer for modern text-to-image models.",
						max_completion_tokens: 1024,
						temperature: 0.7,
					},
					signal: controller.signal,
				})) {
					chunks.push(String(event));
				}
				const enhanced = chunks.join("").trim();
				if (!enhanced)
					throw new Error("AI returned an empty response — please try again");
				const finalPrompt = await critiqueAndRewritePrompt({
					replicate,
					medium: "image",
					assetType: resolvedAssetType,
					prompt: enhanced,
					context: [
						sceneVisualBrief
							? `Scene visual brief:\n${sceneVisualBrief}`
							: null,
						`Shot description: ${shot.description}`,
						referenceImageContext.length > 0
							? `Reference images:\n${referenceImageContext.join("\n")}`
							: null,
					]
						.filter(Boolean)
						.join("\n\n"),
				});
				return { prompt: finalPrompt, assetType: resolvedAssetType };
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
							referenceImageUrls:
								referenceImageUrls.length > 0 ? referenceImageUrls : undefined,
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
	.inputValidator(
		(data: {
			shotId: string;
			referenceImageIds?: string[];
			assetTypeOverride?: PromptAssetTypeSelection;
		}) => data,
	)
	.handler(
		async ({ data: { shotId, referenceImageIds = [], assetTypeOverride } }) => {
			const { userId, shot, project } = await assertShotOwner(shotId);
			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);
			const resolvedAssetType = resolvePromptAssetType({
				override: assetTypeOverride,
				text: `${shot.description}`,
				medium: "video",
			});
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
${getPrecisionPromptInstructions({ type: resolvedAssetType, medium: "video" })}
${settings?.intake?.style?.length ? `- Visual style: ${settings.intake.style.join(", ")}` : ""}
${settings?.intake?.mood?.length ? `- Mood: ${settings.intake.mood.join(", ")}` : ""}
${characterContext ? `- ${characterContext}` : ""}

Return ONLY the final prompt, nothing else.`;

			const replicate = new Replicate({ auth: apiKey });
			const referenceAssets =
				referenceImageIds.length > 0
					? await db.query.assets.findMany({
							where: and(
								inArray(assets.id, referenceImageIds),
								inArray(assets.type, ["start_image", "end_image", "image"]),
								eq(assets.status, "done"),
								isNull(assets.deletedAt),
							),
						})
					: [];
			const [referenceImageContext, sceneVisualBrief] = await Promise.all([
				buildReferenceImageContext({
					replicate,
					imageUrls: referenceAssets
						.map((asset) => asset.url)
						.filter((url): url is string => Boolean(url)),
					shotDescription: shot.description,
					goal: "video",
				}),
				buildSceneVisualBrief({
					replicate,
					medium: "video",
					projectName: project.name,
					sceneTitle: null,
					sceneDescription: shot.description,
					projectContext: [
						settings?.intake?.concept
							? `Project concept: ${settings.intake.concept}`
							: null,
						settings?.intake?.style?.length
							? `Visual style: ${settings.intake.style.join(", ")}`
							: null,
						settings?.intake?.mood?.length
							? `Mood: ${settings.intake.mood.join(", ")}`
							: null,
						characterContext,
					]
						.filter(Boolean)
						.join("\n"),
					shotContext: `Current shot: ${shot.description}`,
				}),
			]);
			const userMessage = [
				`Shot description: ${shot.description}`,
				sceneVisualBrief ? `Scene visual brief:\n${sceneVisualBrief}` : null,
				referenceImageContext.length > 0
					? `Reference images:\n${referenceImageContext.map((entry, index) => `Reference ${index + 1}: ${entry}`).join("\n\n")}`
					: null,
			]
				.filter(Boolean)
				.join("\n\n");
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				REPLICATE_TIMEOUT_MS,
			);

			try {
				const chunks: string[] = [];
				for await (const event of replicate.stream(PROMPT_MODEL, {
					input: {
						prompt: `${systemPrompt}\n\n${userMessage}`,
						system_prompt:
							"You are an expert prompt writer for modern video generation models like Kling.",
						max_completion_tokens: 1024,
						temperature: 0.7,
					},
					signal: controller.signal,
				})) {
					chunks.push(String(event));
				}
				const generatedPrompt = chunks.join("").trim();
				if (!generatedPrompt)
					throw new Error("AI returned an empty response — please try again");
				const finalPrompt = await critiqueAndRewritePrompt({
					replicate,
					medium: "video",
					assetType: resolvedAssetType,
					prompt: generatedPrompt,
					context: [
						sceneVisualBrief
							? `Scene visual brief:\n${sceneVisualBrief}`
							: null,
						`Shot description: ${shot.description}`,
						referenceImageContext.length > 0
							? `Reference images:\n${referenceImageContext.join("\n")}`
							: null,
					]
						.filter(Boolean)
						.join("\n\n"),
				});
				return { prompt: finalPrompt, assetType: resolvedAssetType };
			} finally {
				clearTimeout(timeout);
			}
		},
	);

// ---------------------------------------------------------------------------
// generateShotVideo — fire-and-forget, returns immediately with assetId
// ---------------------------------------------------------------------------

export const generateShotVideo = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			shotId: string;
			prompt: string;
			videoSettings?: unknown;
			referenceImageIds?: string[];
		}) => data,
	)
	.handler(
		async ({ data: { shotId, prompt, videoSettings, referenceImageIds } }) => {
			const { userId, shot, scene } = await assertShotOwner(shotId);
			const normalizedVideo = normalizeVideoDefaults(videoSettings);
			const safeReferenceImageIds = Array.isArray(referenceImageIds)
				? referenceImageIds.filter((id): id is string => typeof id === "string")
				: [];

			// If referenceImageIds were provided, verify they all exist.
			if (safeReferenceImageIds.length > 0) {
				const refAssets = await db.query.assets.findMany({
					where: and(
						inArray(assets.id, safeReferenceImageIds),
						inArray(assets.type, ["start_image", "end_image", "image"]),
						eq(assets.status, "done"),
						isNull(assets.deletedAt),
					),
				});
				const validIds = new Set(
					refAssets.filter((asset) => asset.url).map((asset) => asset.id),
				);
				const hasAllRequestedRefs = safeReferenceImageIds.every((id) =>
					validIds.has(id),
				);
				if (!hasAllRequestedRefs) {
					throw new Error(
						"One or more reference images were not found or not ready",
					);
				}
			}

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
					status: "queued" as const,
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
				referenceImageIds:
					safeReferenceImageIds.length > 0 ? safeReferenceImageIds : undefined,
			});

			await db
				.update(assets)
				.set({ jobId: handle.id })
				.where(eq(assets.id, placeholder.id));

			return { assetId: placeholder.id, jobId: handle.id };
		},
	);

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

		return { status: asset.status };
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
// uploadShotReferenceImage
// ---------------------------------------------------------------------------

export const uploadShotReferenceImage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { shotId: string; fileBase64: string; fileName: string }) => data,
	)
	.handler(async ({ data: { shotId, fileBase64, fileName } }) => {
		const { project, scene } = await assertShotOwner(shotId);

		// Decode base64 to buffer
		const base64Data = fileBase64.replace(/^data:image\/\w+;base64,/, "");
		const buffer = Buffer.from(base64Data, "base64");

		// Validate file size (20MB max)
		const MAX_SIZE_BYTES = 20 * 1024 * 1024;
		if (buffer.length > MAX_SIZE_BYTES) {
			throw new Error("File size exceeds 20MB limit");
		}

		// Determine content type from filename
		const ext = fileName.split(".").pop()?.toLowerCase() ?? "jpg";
		const contentTypeMap: Record<string, string> = {
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			png: "image/png",
			webp: "image/webp",
			gif: "image/gif",
		};
		const contentType = contentTypeMap[ext] ?? "image/jpeg";

		// Generate unique storage key
		const uniqueId = randomUUID();
		const storageKey = `projects/${project.id}/scenes/${scene.id}/shots/${shotId}/references/${uniqueId}.${ext}`;

		// Upload to R2
		const url = await uploadBuffer(buffer, storageKey, contentType);

		return { url, storageKey };
	});

// ---------------------------------------------------------------------------
// enhanceShotVideoPrompt
// ---------------------------------------------------------------------------

const STALE_SHOT_VIDEO_MS = 15 * 60 * 1000;
const ORPHANED_SHOT_VIDEO_ERROR =
	"Video generation stopped before completion. Please try again.";

export const enhanceShotVideoPrompt = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			shotId: string;
			userPrompt: string;
			useProjectContext?: boolean;
			usePrevShotContext?: boolean;
			referenceImageIds?: string[];
			assetTypeOverride?: PromptAssetTypeSelection;
		}) => data,
	)
	.handler(
		async ({
			data: {
				shotId,
				userPrompt,
				useProjectContext = true,
				usePrevShotContext = true,
				referenceImageIds = [],
				assetTypeOverride,
			},
		}) => {
			const { userId, shot, project, scene } = await assertShotOwner(shotId);
			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);
			const resolvedAssetType = resolvePromptAssetType({
				override: assetTypeOverride,
				text: `${shot.description}\n${userPrompt}\n${scene.description}`,
				medium: "video",
			});

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
				`Shot description: ${shot.description}`,
			]
				.filter(Boolean)
				.join("\n\n");

			const systemPrompt = `You are an expert prompt writer for modern video generation models like Kling.
The user wrote a motion idea for a shot video. Rewrite it into a strong, concise prompt while preserving the user's intent.

Use this exact lightweight structure:

[Subject]: Describe the subject only as needed to anchor the motion in 1 short sentence.

[Motion]: Describe what the subject does during the clip in 1-2 short sentences.

[Camera]: Describe the camera behavior in 1 short sentence, only if it materially helps.

[Style]: Describe mood, lighting, and pacing in 1 short sentence.

Rules:
- Preserve all important motion elements the user mentioned
- Keep it motion-first; do not over-describe static appearance
- Be specific about direction and pacing when relevant
- Write in present tense
- Keep every section compact
- The start frame image already establishes appearance, so focus on motion
${getPrecisionPromptInstructions({ type: resolvedAssetType, medium: "video" })}

Shot context:
${contextBlock}

Return ONLY the final prompt, nothing else.`;

			const replicate = new Replicate({ auth: apiKey });
			const referenceAssets =
				referenceImageIds.length > 0
					? await db.query.assets.findMany({
							where: and(
								inArray(assets.id, referenceImageIds),
								inArray(assets.type, ["start_image", "end_image", "image"]),
								eq(assets.status, "done"),
								isNull(assets.deletedAt),
							),
						})
					: [];
			const [referenceImageContext, sceneVisualBrief] = await Promise.all([
				buildReferenceImageContext({
					replicate,
					imageUrls: referenceAssets
						.map((asset) => asset.url)
						.filter((url): url is string => Boolean(url)),
					shotDescription: shot.description,
					goal: "video",
				}),
				buildSceneVisualBrief({
					replicate,
					medium: "video",
					projectName: project.name,
					sceneTitle: scene.title,
					sceneDescription: scene.description,
					projectContext: projectContextLines,
					shotContext: `Current shot: ${shot.description}`,
				}),
			]);
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				REPLICATE_TIMEOUT_MS,
			);
			try {
				const chunks: string[] = [];
				for await (const event of replicate.stream(PROMPT_MODEL, {
					input: {
						prompt: `${systemPrompt}${
							referenceImageContext.length > 0
								? `\n\nReference images:\n${referenceImageContext.map((entry, index) => `Reference ${index + 1}: ${entry}`).join("\n\n")}`
								: ""
						}\n\nUser's prompt to enhance:\n${userPrompt}`,
						system_prompt:
							"You are an expert prompt writer for modern video generation models like Kling.",
						max_completion_tokens: 1024,
						temperature: 0.7,
					},
					signal: controller.signal,
				})) {
					chunks.push(String(event));
				}
				const enhanced = chunks.join("").trim();
				if (!enhanced)
					throw new Error("AI returned an empty response — please try again");
				const finalPrompt = await critiqueAndRewritePrompt({
					replicate,
					medium: "video",
					assetType: resolvedAssetType,
					prompt: enhanced,
					context: [
						sceneVisualBrief
							? `Scene visual brief:\n${sceneVisualBrief}`
							: null,
						`Shot description: ${shot.description}`,
						referenceImageContext.length > 0
							? `Reference images:\n${referenceImageContext.join("\n")}`
							: null,
					]
						.filter(Boolean)
						.join("\n\n"),
				});
				return { prompt: finalPrompt, assetType: resolvedAssetType };
			} finally {
				clearTimeout(timeout);
			}
		},
	);

// ---------------------------------------------------------------------------
// pollShotVideos — poll all video assets for a shot
// ---------------------------------------------------------------------------

export const pollShotVideos = createServerFn({ method: "POST" })
	.inputValidator((data: { shotId: string }) => data)
	.handler(async ({ data: { shotId } }) => {
		const { userId } = await assertShotOwner(shotId);

		await reconcileGeneratingShotVideos({ shotId, userId });

		const videos = await db.query.assets.findMany({
			where: and(
				eq(assets.shotId, shotId),
				eq(assets.type, "video"),
				eq(assets.stage, "video"),
				isNull(assets.deletedAt),
			),
			orderBy: desc(assets.createdAt),
		});

		const generating = videos.filter((v) => isPendingVideoStatus(v.status));
		const done = videos.filter((v) => v.status === "done");
		const errored = videos.filter((v) => v.status === "error");
		const selectedDone = done.find((v) => v.isSelected) ?? null;

		if (generating.length === 0) {
			console.info("[ShotVideoServer] poll:complete", {
				shotId,
				doneCount: done.length,
				erroredCount: errored.length,
			});
		}

		return {
			generatingCount: generating.length,
			doneCount: done.length,
			erroredCount: errored.length,
			isGenerating: generating.length > 0,
			latestDoneId: done[0]?.id ?? null,
			selectedDoneId: selectedDone?.id ?? null,
			latestErrorMessage: errored[0]?.errorMessage ?? null,
		};
	});

async function reconcileGeneratingShotVideos(args: {
	shotId: string;
	userId: string;
}) {
	const generatingVideos = await db.query.assets.findMany({
		where: and(
			eq(assets.shotId, args.shotId),
			eq(assets.type, "video"),
			eq(assets.stage, "video"),
			inArray(assets.status, ["queued", "generating", "finalizing"]),
			isNull(assets.deletedAt),
		),
		orderBy: desc(assets.createdAt),
	});

	await Promise.all(
		generatingVideos.map(async (video) => {
			if (Date.now() - video.createdAt.getTime() > STALE_SHOT_VIDEO_MS) {
				console.warn("[ShotVideoServer] reconcile:timed-out", {
					videoId: video.id,
				});
				await db
					.update(assets)
					.set({
						status: "error",
						errorMessage:
							video.status === "queued"
								? "This model stayed queued too long because provider capacity was full. Try again or choose a faster model."
								: "Video generation timed out before the provider returned a result. Try again or choose a faster model.",
					})
					.where(eq(assets.id, video.id));
				return;
			}

			if (!video.jobId) {
				console.warn("[ShotVideoServer] reconcile:missing-job", {
					videoId: video.id,
				});
				await db
					.update(assets)
					.set({
						status: "error",
						errorMessage: ORPHANED_SHOT_VIDEO_ERROR,
					})
					.where(eq(assets.id, video.id));
				return;
			}

			try {
				const run = await runs.retrieve(video.jobId);
				const runStatus = mapTriggerRunStatus(run);
				if (runStatus === "failed" || runStatus === "canceled") {
					await db
						.update(assets)
						.set({
							status: "error",
							errorMessage: run.error?.message ?? ORPHANED_SHOT_VIDEO_ERROR,
						})
						.where(eq(assets.id, video.id));
					console.warn("[ShotVideoServer] reconcile:trigger-failed", {
						videoId: video.id,
						runStatus,
					});
				} else if (runStatus === "completed") {
					// Trigger job completed but asset is still "generating" — DB update was lost
					// Re-check the asset status in case it was updated between our query and now
					const freshAsset = await db.query.assets.findFirst({
						where: eq(assets.id, video.id),
					});
					if (freshAsset && isPendingVideoStatus(freshAsset.status)) {
						// The job really did complete but DB wasn't updated — mark as error
						await db
							.update(assets)
							.set({
								status: "error",
								errorMessage:
									"Video generation completed but failed to save. Please try again.",
							})
							.where(eq(assets.id, video.id));
						console.warn(
							"[ShotVideoServer] reconcile:completed-run-db-mismatch",
							{
								videoId: video.id,
							},
						);
					}
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message.toLowerCase() : "";
				const looksMissingRun =
					message.includes("not found") ||
					message.includes("no run") ||
					message.includes("404");

				if (looksMissingRun) {
					console.warn("[ShotVideoServer] reconcile:missing-trigger-run", {
						videoId: video.id,
						jobId: video.jobId,
					});
					await db
						.update(assets)
						.set({
							status: "error",
							errorMessage: ORPHANED_SHOT_VIDEO_ERROR,
						})
						.where(eq(assets.id, video.id));
				}
			}
		}),
	);
}

// ---------------------------------------------------------------------------
// getShotVideoRunStatuses
// ---------------------------------------------------------------------------

export const getShotVideoRunStatuses = createServerFn({ method: "POST" })
	.inputValidator((data: { shotId: string }) => data)
	.handler(async ({ data: { shotId } }) => {
		await assertShotOwner(shotId);

		const generatingVideos = await db.query.assets.findMany({
			where: and(
				eq(assets.shotId, shotId),
				eq(assets.type, "video"),
				eq(assets.stage, "video"),
				inArray(assets.status, ["queued", "generating", "finalizing"]),
				isNull(assets.deletedAt),
			),
			orderBy: desc(assets.createdAt),
		});

		const statuses = await Promise.all(
			generatingVideos.map(async (video): Promise<TriggerRunSummary> => {
				if (!video.jobId) {
					return {
						assetId: video.id,
						jobId: "",
						status: "unknown",
						attemptCount: 0,
						createdAt: video.createdAt.toISOString(),
						startedAt: null,
						finishedAt: null,
						errorMessage: null,
					};
				}

				try {
					const run = await runs.retrieve(video.jobId);

					return {
						assetId: video.id,
						jobId: video.jobId,
						status: mapTriggerRunStatus(run),
						attemptCount: run.attemptCount,
						createdAt: run.createdAt.toISOString(),
						startedAt: run.startedAt?.toISOString() ?? null,
						finishedAt: run.finishedAt?.toISOString() ?? null,
						errorMessage: run.error?.message ?? null,
					};
				} catch (error) {
					return {
						assetId: video.id,
						jobId: video.jobId,
						status: "unknown",
						attemptCount: 0,
						createdAt: video.createdAt.toISOString(),
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
// selectShotVideo
// ---------------------------------------------------------------------------

export const selectShotVideo = createServerFn({ method: "POST" })
	.inputValidator((data: { videoId: string }) => data)
	.handler(async ({ data: { videoId } }) => {
		const { asset, shot } = await assertAssetOwnerViaShot(videoId);

		if (asset.type !== "video" || asset.stage !== "video") {
			throw new Error("Only video assets can be selected here");
		}
		if (asset.status !== "done") {
			throw new Error("Only completed videos can be selected");
		}

		// Deselect all video assets for this shot, then select the target
		await db.transaction(async (tx) => {
			await tx
				.update(assets)
				.set({ isSelected: false })
				.where(
					and(
						eq(assets.shotId, shot.id),
						eq(assets.type, "video"),
						eq(assets.stage, "video"),
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
// deleteShotVideo
// ---------------------------------------------------------------------------

export const deleteShotVideo = createServerFn({ method: "POST" })
	.inputValidator((data: { videoId: string }) => data)
	.handler(async ({ data: { videoId } }) => {
		const { asset } = await assertAssetOwnerViaShot(videoId);

		if (asset.type !== "video" || asset.stage !== "video") {
			throw new Error("Only video assets can be deleted here");
		}

		if (asset.storageKey) {
			await deleteObject(asset.storageKey).catch((err) =>
				console.error("R2 deleteObject failed for key:", asset.storageKey, err),
			);
		}

		await db
			.update(assets)
			.set({ deletedAt: new Date() })
			.where(eq(assets.id, videoId));
	});
