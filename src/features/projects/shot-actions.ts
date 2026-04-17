"use server";

import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { runs } from "@trigger.dev/sdk";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import {
	assets,
	referenceImages,
	shots,
	transitionVideos,
} from "@/db/schema";
import {
	assertAssetOwner,
	assertProjectOwner,
	assertShotOwner,
} from "@/lib/assert-project-owner.server";
import { cleanupStorageKeys } from "@/lib/r2-cleanup.server";
import { copyObject, uploadBuffer } from "@/lib/r2.server";
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
const PROMPT_MODEL = "google/gemini-2.5-flash";
const PROMPT_MAX_OUTPUT_TOKENS = 8192;
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
	void args.replicate;
	void args.shotDescription;

	return `${args.label} reference image is attached as a Gemini image input for this ${args.goal} prompt. Use the visible subject, framing, setting, and lighting from that image directly.`;
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

async function loadCharacterPromptContext(args: {
	projectId: string;
	characters: Array<{
		id: string;
		name: string;
		visualPromptFragment: string;
		primaryImageId?: string | null;
		referenceImageIds?: string[];
	}>;
	excludedCharacterIds?: string[];
}) {
	const activeCharacters = args.characters.filter(
		(character) => !args.excludedCharacterIds?.includes(character.id),
	);
	if (activeCharacters.length === 0) {
		return { imageUrls: [] as string[] };
	}

	// Only use the primary image for each character (user's explicit selection)
	const preferredImageIds = activeCharacters
		.map((character) => character.primaryImageId)
		.filter((id): id is string => Boolean(id))
		.slice(0, 4);

	const images =
		preferredImageIds.length === 0
			? []
			: await db.query.referenceImages.findMany({
					where: and(
						eq(referenceImages.projectId, args.projectId),
						inArray(referenceImages.id, preferredImageIds),
						isNull(referenceImages.deletedAt),
					),
				});

	const imageMap = new Map(images.map((image) => [image.id, image.url]));
	return {
		imageUrls: preferredImageIds
			.map((id) => imageMap.get(id))
			.filter((url): url is string => Boolean(url))
			.slice(0, 4),
	};
}

function loadLocationPromptContext(args: {
	locations: Array<{
		id: string;
		name: string;
		visualPromptFragment: string;
		primaryImageId?: string | null;
		images?: Array<{ id: string; url: string }>;
	}>;
	excludedLocationIds?: string[];
}) {
	const activeLocations = args.locations.filter(
		(location) => !args.excludedLocationIds?.includes(location.id),
	);
	if (activeLocations.length === 0) {
		return { imageUrls: [] as string[] };
	}

	const preferredImageUrls = activeLocations
		.flatMap((location) => {
			const images = location.images ?? [];
			const primaryImage =
				images.find((image) => image.id === location.primaryImageId) ??
				images[0];
			return primaryImage?.url ? [primaryImage.url] : [];
		})
		.slice(0, 4);

	return {
		imageUrls: preferredImageUrls,
	};
}

// ---------------------------------------------------------------------------
// recomputeProjectTimestamps
// ---------------------------------------------------------------------------

async function recomputeProjectTimestamps(projectId: string) {
	// Load all non-deleted shots for the project, ordered by shot.order ASC
	const allShots = await db
		.select({
			id: shots.id,
			order: shots.order,
			durationSec: shots.durationSec,
		})
		.from(shots)
		.where(and(eq(shots.projectId, projectId), isNull(shots.deletedAt)))
		.orderBy(asc(shots.order));

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
	scope: "shot";
	scopeId: string;
}) {
	const generatingAssets = await db.query.assets.findMany({
		where: and(
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
					data.durationSec > 10
				) {
					throw new Error("durationSec must be between 1 and 10");
				}
			}
			return data;
		},
	)
	.handler(
		async ({
			data: { shotId, description, shotType, shotSize, durationSec },
		}) => {
			const { shot, project } = await assertShotOwner(shotId);

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
				await recomputeProjectTimestamps(project.id);
			}
		},
	);

// ---------------------------------------------------------------------------
// deleteShot
// ---------------------------------------------------------------------------

export const deleteShot = createServerFn({ method: "POST" })
	.inputValidator((data: { shotId: string }) => data)
	.handler(async ({ data: { shotId } }) => {
		const { project } = await assertShotOwner(shotId);

		const now = new Date();

		// Collect R2 keys BEFORE the transaction so cleanup runs safely after commit
		const shotAssets = await db
			.select({ storageKey: assets.storageKey })
			.from(assets)
			.where(and(eq(assets.shotId, shotId), isNull(assets.deletedAt)));
		const storageKeys = shotAssets
			.map((r) => r.storageKey)
			.filter((k): k is string => k !== null);

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

		// R2 cleanup AFTER transaction commits — safe to delete now
		await cleanupStorageKeys([...storageKeys, ...tvStorageKeys]);

		await recomputeProjectTimestamps(project.id);
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
		const { project, shot } = await assertShotOwner(shotId);

		// Get sibling shots to calculate insertion order
		const siblingShots = await db
			.select({ id: shots.id, order: shots.order })
			.from(shots)
			.where(and(eq(shots.projectId, shot.projectId), isNull(shots.deletedAt)))
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
				projectId: shot.projectId,
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
					const newStorageKey = `projects/${project.id}/shots/${newShot.id}/images/${newBatchId}/image-${i + 1}.${ext}`;

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
						newThumbKey = `projects/${project.id}/shots/${newShot.id}/images/${newBatchId}/thumb-${i + 1}.${thumbExt}`;
						newThumbUrl = await copyObject(
							asset.thumbnailStorageKey,
							newThumbKey,
						);
					}

					return {
						projectId: shot.projectId,
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

		await recomputeProjectTimestamps(project.id);
	});

// ---------------------------------------------------------------------------
// addShot
// ---------------------------------------------------------------------------

export const addShot = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
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
			data: { projectId, description, shotType, shotSize, afterOrder },
		}) => {
			await assertProjectOwner(projectId, "error");

			const newOrder = afterOrder + 0.5;

			await db.insert(shots).values({
				projectId,
				order: newOrder,
				description,
				shotType,
				shotSize: shotSize ?? "medium",
				durationSec: 5,
			});

			await recomputeProjectTimestamps(projectId);
		},
	);

// ---------------------------------------------------------------------------
// reorderShot
// ---------------------------------------------------------------------------

export const reorderShot = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { shotId: string; newOrder: number }) => {
			if (
				typeof data.newOrder !== "number" ||
				!Number.isFinite(data.newOrder)
			) {
				throw new Error("newOrder must be a finite number");
			}
			return data;
		},
	)
	.handler(async ({ data: { shotId, newOrder } }) => {
		const { project } = await assertShotOwner(shotId);

		await db
			.update(shots)
			.set({ order: newOrder })
			.where(eq(shots.id, shotId));
		await recomputeProjectTimestamps(project.id);
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
			useProjectCharacters?: boolean;
			useProjectLocations?: boolean;
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
			const { userId, shot, project } = await assertShotOwner(shotId);
			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);
			const resolvedAssetType = resolvePromptAssetType({
				override: assetTypeOverride,
				text: `${shot.description}\n${referenceImageUrls.join("\n")}`,
				medium: "image",
			});

			// Load all shots in this project for context
			const sceneShots = await db.query.shots.findMany({
				where: and(eq(shots.projectId, project.id), isNull(shots.deletedAt)),
				orderBy: asc(shots.order),
			});
			const shotIdx = sceneShots.findIndex((s) => s.id === shotId);
			const prevShot = shotIdx > 0 ? sceneShots[shotIdx - 1] : null;
			const nextShot =
				shotIdx < sceneShots.length - 1 ? sceneShots[shotIdx + 1] : null;

			const intake = settings?.intake;
			const projectContext = [
				intake?.concept ? `Project concept: ${intake.concept}` : null,
				intake?.purpose ? `Purpose: ${intake.purpose}` : null,
				intake?.style?.length
					? `Visual style: ${intake.style.join(", ")}`
					: null,
				intake?.mood?.length ? `Mood: ${intake.mood.join(", ")}` : null,
				intake?.audioMode ? `Audio direction: ${intake.audioMode}` : null,
				intake?.audience ? `Target audience: ${intake.audience}` : null,
				intake?.viewerAction
					? `Viewer action goal: ${intake.viewerAction}`
					: null,
			]
				.filter(Boolean)
				.join("\n");

			const consistencyRules = useProjectContext
				? "- CRITICAL: The subject, setting, and visual style must stay consistent with the project concept — do NOT invent new subjects or themes not present in the project"
				: "- Base the prompt only on the current shot description";

			const systemPrompt = `You are an expert prompt writer for modern text-to-image models.

Write a rich, production-quality prompt for a single still image based on the current shot.
Write the result as 1 to 4 natural-language sentences, not a labeled template.

Prompt priorities:
- framing and composition first, then the main subject and exact frozen pose/expression visible in frame
- the environment and key props/background elements
- framing/composition/camera angle only when it materially improves the image
- lighting and what it is doing, color palette, atmosphere, mood, and visual style
- any essential visible text, calligraphy, or graphic elements

Rules:
${consistencyRules}
- This is a still image prompt, not a video prompt
- Do NOT describe camera movement, motion over time, transitions, animation, or what happens next
- Use adjacent shots as implicit transition-pair context: the current shot should remain visually compatible with the previous and next shot while still showing a clear, concrete state change
- Make the prompt detailed enough that the image model does not need to invent subject placement, environment layout, lighting behavior, or style-specific rendering details
- Do not keep it artificially short; precision is more important than brevity
- Use the audio direction as context: if narration is present, leave visual room for spoken explanation or on-screen text; if music-only or silent, make the still frame carry more of the story visually.
- If scale matters (tiny subject, huge environment, distant silhouette), state it clearly
- Do NOT include meta-instructions like "generate an image of"
${getPrecisionPromptInstructions({ type: resolvedAssetType, medium: "image" })}

Return ONLY the final prompt, nothing else.`;

			const contextParts = [
				useProjectContext
					? `PROJECT CONTEXT:\n${projectContext || `Project: ${project.name}`}`
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
					sceneTitle: null,
					sceneDescription: shot.description,
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
						images: referenceImageUrls,
						prompt: `${systemPrompt}\n\n${userMessage}`,
						system_instruction:
							"You are an expert prompt writer for modern text-to-image models.",
						max_output_tokens: PROMPT_MAX_OUTPUT_TOKENS,
						dynamic_thinking: false,
						thinking_budget: 0,
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
			useProjectCharacters?: boolean;
			useProjectLocations?: boolean;
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
			const { userId, shot, project } = await assertShotOwner(shotId);
			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);
			const resolvedAssetType = resolvePromptAssetType({
				override: assetTypeOverride,
				text: `${shot.description}\n${userPrompt}`,
				medium: "image",
			});

			// Load adjacent shots for context
			const sceneShots = await db.query.shots.findMany({
				where: and(eq(shots.projectId, project.id), isNull(shots.deletedAt)),
				orderBy: asc(shots.order),
			});
			const shotIdx = sceneShots.findIndex((s) => s.id === shotId);
			const prevShot = shotIdx > 0 ? sceneShots[shotIdx - 1] : null;
			const nextShot =
				shotIdx < sceneShots.length - 1 ? sceneShots[shotIdx + 1] : null;

			const intake = settings?.intake;
			const projectContext = [
				intake?.concept ? `Project concept: ${intake.concept}` : null,
				intake?.style?.length
					? `Visual style: ${intake.style.join(", ")}`
					: null,
				intake?.mood?.length ? `Mood: ${intake.mood.join(", ")}` : null,
				intake?.audioMode ? `Audio direction: ${intake.audioMode}` : null,
			]
				.filter(Boolean)
				.join("\n");

			const systemPrompt = `You are an expert prompt writer for modern text-to-image models.
The user wrote a natural-language image idea. Rewrite it into a stronger prompt for a single still image while preserving all important intent.

Write the result as 1 to 4 natural-language sentences, not a labeled template.

Rules:
- Preserve all visually important elements the user mentioned
- Improve clarity, composition, subject placement, environment detail, lighting behavior, color palette, and style-specific rendering language
- Keep it strictly as a still image prompt: no camera movement, animation, transitions, or sequential action
- If adjacent-shot context is present, use it to preserve continuity anchors and make the current frame a believable bridge between neighboring shots
- Do not keep it artificially short; make it concrete enough that the image model does not need to invent missing visual details
- Use the audio direction as context so the rewritten still frame either supports narration/on-screen text or carries the story visually in music-only/silent scenes.
- If the user mentioned visible text, calligraphy, signage, or graphics, preserve that explicitly
- If scale matters, preserve it exactly
${getPrecisionPromptInstructions({ type: resolvedAssetType, medium: "image" })}
${useProjectContext && projectContext ? `\nProject context:\n${projectContext}` : ""}
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
					sceneDescription: shot.description,
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
						images: referenceImageUrls,
						prompt: `${systemPrompt}${
							referenceImageContext.length > 0
								? `\n\nReference images:\n${referenceImageContext.map((entry, index) => `Reference ${index + 1}: ${entry}`).join("\n\n")}`
								: ""
						}\n\nUser's prompt to enhance:\n${userPrompt}`,
						system_instruction:
							"You are an expert prompt writer for modern text-to-image models.",
						max_output_tokens: PROMPT_MAX_OUTPUT_TOKENS,
						dynamic_thinking: false,
						thinking_budget: 0,
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
			useProjectCharacters?: boolean;
			excludedCharacterIds?: string[];
			useProjectLocations?: boolean;
			excludedLocationIds?: string[];
			referenceImageUrls?: string[];
		}) => {
			const lane = data.lane === "end" ? ("end" as const) : ("start" as const);
			return {
				shotId: data.shotId,
				lane,
				promptOverride: data.promptOverride?.trim() || undefined,
				settingsOverrides: data.settingsOverrides,
				useProjectCharacters: data.useProjectCharacters ?? true,
				excludedCharacterIds: data.excludedCharacterIds?.filter(Boolean) ?? [],
				useProjectLocations: data.useProjectLocations ?? true,
				excludedLocationIds: data.excludedLocationIds?.filter(Boolean) ?? [],
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
				useProjectCharacters,
				excludedCharacterIds,
				useProjectLocations,
				excludedLocationIds,
				referenceImageUrls,
			},
		}) => {
			const { userId, shot, project } = await assertShotOwner(shotId);
			const settings = normalizeProjectSettings(project.settings);
			const [characterPromptContext, locationPromptContext] = await Promise.all(
				[
					useProjectCharacters
						? loadCharacterPromptContext({
								projectId: project.id,
								characters: settings?.characters ?? [],
								excludedCharacterIds,
							})
						: Promise.resolve({ imageUrls: [] as string[] }),
					useProjectLocations
						? Promise.resolve(
								loadLocationPromptContext({
									locations: settings?.locations ?? [],
									excludedLocationIds,
								}),
							)
						: Promise.resolve({ imageUrls: [] as string[] }),
				],
			);
			const effectiveReferenceImageUrls = [
				...referenceImageUrls,
				...characterPromptContext.imageUrls,
				...locationPromptContext.imageUrls,
			]
				.filter(Boolean)
				.filter((url, index, all) => all.indexOf(url) === index)
				.slice(0, 4);

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
						projectId: project.id,
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
								effectiveReferenceImageUrls.length > 0
									? effectiveReferenceImageUrls
									: undefined,
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
					const handle = await generateShotImageAsset.trigger(
						{
							assetId: placeholder.id,
							userId,
							projectId: project.id,
							shotId: shot.id,
							generationId: placeholder.generationId ?? batchId,
							batchId,
							sequenceIndex: index,
							prompt: finalPrompt,
							model: imageDefaults.model,
							modelOptions: imageDefaults.modelOptions,
							referenceImageUrls: effectiveReferenceImageUrls,
						},
						{
							tags: [`project:${project.id}`, `shot:${shot.id}`, `image:${placeholder.id}`, `batch:${batchId}`],
						},
					);

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
			useProjectCharacters?: boolean;
			excludedCharacterIds?: string[];
			useProjectLocations?: boolean;
			excludedLocationIds?: string[];
			assetTypeOverride?: PromptAssetTypeSelection;
		}) => data,
	)
	.handler(
		async ({
			data: {
				shotId,
				referenceImageIds = [],
				useProjectCharacters = true,
				excludedCharacterIds = [],
				useProjectLocations = true,
				excludedLocationIds = [],
				assetTypeOverride,
			},
		}) => {
			const { userId, shot, project } = await assertShotOwner(shotId);
			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);
			const resolvedAssetType = resolvePromptAssetType({
				override: assetTypeOverride,
				text: `${shot.description}`,
				medium: "video",
			});
			const characterPromptContext = useProjectCharacters
				? await loadCharacterPromptContext({
						projectId: project.id,
						characters: settings?.characters ?? [],
						excludedCharacterIds,
					})
				: { imageUrls: [] as string[] };
			const locationPromptContext = useProjectLocations
				? loadLocationPromptContext({
						locations: settings?.locations ?? [],
						excludedLocationIds,
					})
				: { imageUrls: [] as string[] };

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
${settings?.intake?.audioMode ? `- Audio direction: ${settings.intake.audioMode}` : ""}

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
			const effectiveReferenceImageUrls = [
				...referenceAssets
					.map((asset) => asset.url)
					.filter((url): url is string => Boolean(url)),
				...characterPromptContext.imageUrls,
				...locationPromptContext.imageUrls,
			].slice(0, 4);
			const [referenceImageContext, sceneVisualBrief] = await Promise.all([
				buildReferenceImageContext({
					replicate,
					imageUrls: effectiveReferenceImageUrls,
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
						settings?.intake?.audioMode
							? `Audio direction: ${settings.intake.audioMode}`
							: null,
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
						images: effectiveReferenceImageUrls,
						prompt: `${systemPrompt}\n\n${userMessage}`,
						system_instruction:
							"You are an expert prompt writer for modern video generation models like Kling.",
						max_output_tokens: PROMPT_MAX_OUTPUT_TOKENS,
						dynamic_thinking: false,
						thinking_budget: 0,
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
			const { userId, shot } = await assertShotOwner(shotId);
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
					projectId: shot.projectId,
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

			const handle = await startShotVideoGeneration.trigger(
				{
					assetId: placeholder.id,
					userId,
					modelId: normalizedVideo.model,
					prompt,
					modelOptions: normalizedVideo.modelOptions,
					referenceImageIds:
						safeReferenceImageIds.length > 0 ? safeReferenceImageIds : undefined,
				},
				{
					tags: [`project:${shot.projectId}`, `shot:${shot.id}`, `video:${placeholder.id}`],
				},
			);

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
		const { asset } = await assertAssetOwner(assetId);

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
		const { asset, shot } = await assertAssetOwner(assetId);
		if (!shot) {
			throw new Error("Asset is not attached to a shot");
		}

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

			void generateAdjacentTransitionPromptsForShot(asset.shotId).catch(
				(error) => {
					console.error(
						`Failed to regenerate adjacent transition prompts for shot ${asset.shotId}`,
						error,
					);
				},
			);
		}
	});

async function hasSelectedShotImage(shotId: string) {
	const selectedImage = await db.query.assets.findFirst({
		where: and(
			eq(assets.shotId, shotId),
			inArray(assets.type, ["start_image", "end_image", "image"]),
			eq(assets.isSelected, true),
			eq(assets.status, "done"),
			isNull(assets.deletedAt),
		),
	});
	return Boolean(selectedImage?.url);
}

async function generateAdjacentTransitionPromptsForShot(shotId: string) {
	const shotRow = await db.query.shots.findFirst({
		where: and(eq(shots.id, shotId), isNull(shots.deletedAt)),
	});
	if (!shotRow) return;

	const sceneShots = await db.query.shots.findMany({
		where: and(eq(shots.projectId, shotRow.projectId), isNull(shots.deletedAt)),
		orderBy: asc(shots.order),
	});
	const shotIndex = sceneShots.findIndex(
		(sceneShot) => sceneShot.id === shotId,
	);
	if (shotIndex < 0) return;

	const adjacentPairs = [
		shotIndex > 0
			? {
					fromShotId: sceneShots[shotIndex - 1].id,
					toShotId: shotId,
				}
			: null,
		shotIndex < sceneShots.length - 1
			? {
					fromShotId: shotId,
					toShotId: sceneShots[shotIndex + 1].id,
				}
			: null,
	].filter(
		(pair): pair is { fromShotId: string; toShotId: string } => pair !== null,
	);

	await Promise.allSettled(
		adjacentPairs.map(async (pair) => {
			const [hasFromImage, hasToImage] = await Promise.all([
				hasSelectedShotImage(pair.fromShotId),
				hasSelectedShotImage(pair.toShotId),
			]);
			if (!hasFromImage || !hasToImage) return;

			const { generateAndSaveTransitionPromptForPair } = await import(
				"./transition-prompt-drafts.server"
			);
			await generateAndSaveTransitionPromptForPair({
				fromShotId: pair.fromShotId,
				toShotId: pair.toShotId,
				useProjectContext: true,
				usePrevShotContext: true,
				assetTypeOverride: "auto",
			});
		}),
	);
}

// ---------------------------------------------------------------------------
// uploadShotReferenceImage
// ---------------------------------------------------------------------------

export const uploadShotReferenceImage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { shotId: string; fileBase64: string; fileName: string }) => data,
	)
	.handler(async ({ data: { shotId, fileBase64, fileName } }) => {
		const { project } = await assertShotOwner(shotId);

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
		const storageKey = `projects/${project.id}/shots/${shotId}/references/${uniqueId}.${ext}`;

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
			useProjectCharacters?: boolean;
			excludedCharacterIds?: string[];
			useProjectLocations?: boolean;
			excludedLocationIds?: string[];
			assetTypeOverride?: PromptAssetTypeSelection;
		}) => data,
	)
	.handler(
		async ({
			data: {
				shotId,
				userPrompt,
				useProjectContext = true,
				usePrevShotContext: _usePrevShotContext = true,
				referenceImageIds = [],
				useProjectCharacters = true,
				excludedCharacterIds = [],
				useProjectLocations = true,
				excludedLocationIds = [],
				assetTypeOverride,
			},
		}) => {
			const { userId, shot, project } = await assertShotOwner(shotId);
			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);
			const resolvedAssetType = resolvePromptAssetType({
				override: assetTypeOverride,
				text: `${shot.description}\n${userPrompt}`,
				medium: "video",
			});

			const intake = settings?.intake;
			const characterPromptContext = useProjectCharacters
				? await loadCharacterPromptContext({
						projectId: project.id,
						characters: settings?.characters ?? [],
						excludedCharacterIds,
					})
				: { imageUrls: [] as string[] };
			const locationPromptContext = useProjectLocations
				? loadLocationPromptContext({
						locations: settings?.locations ?? [],
						excludedLocationIds,
					})
				: { imageUrls: [] as string[] };
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
						intake?.audioMode ? `Audio direction: ${intake.audioMode}` : null,
					]
						.filter(Boolean)
						.join("\n")
				: null;

			const sceneCtx = null;

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
- If narration is part of the audio direction, keep the rewritten motion prompt compatible with spoken timing; if music-only or silent, make the visual motion itself carry the beat.
- If narration is part of the audio direction, leave room for the spoken beat; if music-only or silent, make the action and camera move communicate the idea without relying on dialogue.
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
			const effectiveReferenceImageUrls = [
				...referenceAssets
					.map((asset) => asset.url)
					.filter((url): url is string => Boolean(url)),
				...characterPromptContext.imageUrls,
				...locationPromptContext.imageUrls,
			].slice(0, 4);
			const [referenceImageContext, sceneVisualBrief] = await Promise.all([
				buildReferenceImageContext({
					replicate,
					imageUrls: effectiveReferenceImageUrls,
					shotDescription: shot.description,
					goal: "video",
				}),
				buildSceneVisualBrief({
					replicate,
					medium: "video",
					projectName: project.name,
					sceneDescription: shot.description,
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
						images: effectiveReferenceImageUrls,
						prompt: `${systemPrompt}${
							referenceImageContext.length > 0
								? `\n\nReference images:\n${referenceImageContext.map((entry, index) => `Reference ${index + 1}: ${entry}`).join("\n\n")}`
								: ""
						}\n\nUser's prompt to enhance:\n${userPrompt}`,
						system_instruction:
							"You are an expert prompt writer for modern video generation models like Kling.",
						max_output_tokens: PROMPT_MAX_OUTPUT_TOKENS,
						dynamic_thinking: false,
						thinking_budget: 0,
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
		const { asset, shot } = await assertAssetOwner(videoId);
		if (!shot) {
			throw new Error("Asset is not attached to a shot");
		}

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
		const { asset } = await assertAssetOwner(videoId);

		if (asset.type !== "video" || asset.stage !== "video") {
			throw new Error("Only video assets can be deleted here");
		}

		await db
			.update(assets)
			.set({ deletedAt: new Date() })
			.where(eq(assets.id, videoId));

		// R2 cleanup AFTER the DB soft-delete
		await cleanupStorageKeys([asset.storageKey]);
	});

// ---------------------------------------------------------------------------
// getProjectShots - List all shots for a project (for audio segment UI)
// ---------------------------------------------------------------------------

export const getProjectShots = createServerFn({ method: "GET" })
	.inputValidator((data: { projectId: string }) => data)
	.handler(async ({ data: { projectId } }) => {
		await assertProjectOwner(projectId);

		const projectShots = await db.query.shots.findMany({
			where: and(eq(shots.projectId, projectId), isNull(shots.deletedAt)),
			orderBy: [asc(shots.order)],
		});

		return projectShots;
	});
