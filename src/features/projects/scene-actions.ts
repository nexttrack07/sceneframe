import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { runs } from "@trigger.dev/sdk";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, projects, scenes, shots, transitionVideos } from "@/db/schema";
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
import type {
	PromptAssetTypeSelection,
	ScenePlanEntry,
	ShotSize,
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

const MAX_MESSAGE_LENGTH = 5_000;
const REPLICATE_TIMEOUT_MS = 60_000;
const PROMPT_MODEL = "google/gemini-2.5-flash";
const PROMPT_MAX_OUTPUT_TOKENS = 8192;
const AUDIO_PROMPT_MODEL = "google/gemini-2.5-flash";
const AUDIO_PROMPT_MAX_OUTPUT_TOKENS = 2048;
const ELEVENLABS_SFX_MAX_PROMPT_CHARS = 450;
const SCENE_REWRITE_MAX_OUTPUT_TOKENS = 16_384;
const STALE_IMAGE_GENERATION_MS = 6 * 60 * 1000;
const ORPHANED_IMAGE_GENERATION_ERROR =
	"Image generation stopped before completion. Please try again.";

function extractJsonBlock<T>(response: string): T | null {
	try {
		const fenceMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
		const jsonStr = fenceMatch ? fenceMatch[1] : response;
		return JSON.parse(jsonStr.trim()) as T;
	} catch {
		return null;
	}
}

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

export const regenerateSceneAndShots = createServerFn({ method: "POST" })
	.inputValidator((data: { sceneId: string; instructions: string }) => {
		const trimmed = data.instructions.trim();
		if (trimmed.length === 0) throw new Error("Instructions cannot be empty");
		if (trimmed.length > MAX_MESSAGE_LENGTH) {
			throw new Error(
				`Instructions too long (max ${MAX_MESSAGE_LENGTH} characters)`,
			);
		}
		return { sceneId: data.sceneId, instructions: trimmed };
	})
	.handler(async ({ data: { sceneId, instructions } }) => {
		const { userId, scene, project } = await assertSceneOwner(sceneId);
		const apiKey = await getUserApiKey(userId);
		const replicate = new Replicate({ auth: apiKey });
		const settings = normalizeProjectSettings(project.settings);

		const allScenes = await db.query.scenes.findMany({
			where: and(eq(scenes.projectId, project.id), isNull(scenes.deletedAt)),
			orderBy: asc(scenes.order),
		});
		const sceneIndex = allScenes.findIndex((row) => row.id === scene.id);
		if (sceneIndex < 0) throw new Error("Scene not found in project ordering");

		const sceneShots = await db.query.shots.findMany({
			where: and(eq(shots.sceneId, sceneId), isNull(shots.deletedAt)),
			orderBy: asc(shots.order),
		});
		if (sceneShots.length === 0) {
			throw new Error("This scene has no shots to regenerate");
		}

		const totalDurationSec = sceneShots.reduce(
			(sum, currentShot) => sum + currentShot.durationSec,
			0,
		);
		const intake = settings?.intake;
		const projectContext = [
			`Project: ${project.name}`,
			intake?.concept ? `Concept: ${intake.concept}` : null,
			intake?.purpose ? `Purpose: ${intake.purpose}` : null,
			intake?.style?.length ? `Style: ${intake.style.join(", ")}` : null,
			intake?.mood?.length ? `Mood: ${intake.mood.join(", ")}` : null,
			intake?.audioMode ? `Audio direction: ${intake.audioMode}` : null,
			intake?.audience ? `Audience: ${intake.audience}` : null,
		]
			.filter(Boolean)
			.join("\n");
		const shotSummary = sceneShots
			.map(
				(currentShot, index) =>
					`Shot ${index + 1}: type=${currentShot.shotType}, size=${currentShot.shotSize}, duration=${currentShot.durationSec}s, description=${currentShot.description}`,
			)
			.join("\n");
		const sceneVisualBrief = await buildSceneVisualBrief({
			replicate,
			medium: "image",
			projectName: project.name,
			sceneTitle: scene.title,
			sceneDescription: scene.description,
			projectContext,
			shotContext: shotSummary,
		});

		const rewritePrompt = `You are revising a single scene and its existing shot plan for a video project.

You must rewrite:
1. the scene description
2. every shot description in that scene

Constraints:
- Keep the exact same number of shots: ${sceneShots.length}
- Keep each shot's duration exactly as provided
- Keep each shot's shotType exactly as provided
- You may update shotSize for better cinematographic variety
- Rewrite only text/shot metadata; do not mention assets, files, or previous generations
- Make the rewritten scene and shots reflect the user's requested changes
- The scene description should be a strong visual brief
- Each shot description should be visually distinct and specific

Project context:
${projectContext}

Current scene:
Title: ${scene.title ?? "Untitled"}
Description: ${scene.description}
Duration target: ${totalDurationSec}s

Scene visual brief:
${sceneVisualBrief}

Current shots:
${shotSummary}

User instructions:
${instructions}

Return ONLY JSON in this shape:
\`\`\`json
{
  "sceneDescription": "rewritten scene description",
  "shots": [
    {
      "index": 0,
      "shotSize": "wide",
      "description": "rewritten shot description"
    }
  ]
}
\`\`\`
`;

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

		try {
			const chunks: string[] = [];
			for await (const event of replicate.stream(PROMPT_MODEL, {
				input: {
					prompt: rewritePrompt,
					system_instruction:
						"You rewrite scene descriptions and shot plans with precise, production-ready visual language. Return only JSON.",
					max_output_tokens: SCENE_REWRITE_MAX_OUTPUT_TOKENS,
					dynamic_thinking: false,
					thinking_budget: 0,
					temperature: 0.6,
				},
				signal: controller.signal,
			})) {
				chunks.push(String(event));
			}

			const parsed = extractJsonBlock<{
				sceneDescription?: string;
				shots?: Array<{
					index?: number;
					shotSize?: string;
					description?: string;
				}>;
			}>(chunks.join("").trim());

			if (
				!parsed?.sceneDescription?.trim() ||
				!Array.isArray(parsed.shots) ||
				parsed.shots.length !== sceneShots.length
			) {
				throw new Error("AI returned an invalid scene regeneration payload");
			}

			const validShotSizes: ShotSize[] = [
				"extreme-wide",
				"wide",
				"medium",
				"close-up",
				"extreme-close-up",
				"insert",
			];
			const rewrittenShots = parsed.shots.map((candidate, index) => {
				const nextSize = String(
					candidate.shotSize ?? sceneShots[index]?.shotSize,
				);
				const shotSize = validShotSizes.includes(nextSize as ShotSize)
					? (nextSize as ShotSize)
					: ((sceneShots[index]?.shotSize as ShotSize | undefined) ?? "medium");
				const description = String(
					candidate.description ?? sceneShots[index]?.description ?? "",
				).trim();
				if (!description) {
					throw new Error("AI returned an empty shot description");
				}
				return {
					id: sceneShots[index]?.id,
					description,
					shotSize,
				};
			});

			const rewrittenSceneDescription = parsed.sceneDescription.trim();

			await db.transaction(async (tx) => {
				await tx
					.update(scenes)
					.set({ description: rewrittenSceneDescription })
					.where(eq(scenes.id, scene.id));

				for (const rewrittenShot of rewrittenShots) {
					if (!rewrittenShot.id) continue;
					await tx
						.update(shots)
						.set({
							description: rewrittenShot.description,
							shotSize: rewrittenShot.shotSize,
						})
						.where(eq(shots.id, rewrittenShot.id));
				}

				try {
					const parsedScriptRaw = project.scriptRaw
						? (JSON.parse(project.scriptRaw) as ScenePlanEntry[])
						: null;
					if (Array.isArray(parsedScriptRaw) && parsedScriptRaw[sceneIndex]) {
						parsedScriptRaw[sceneIndex] = {
							...parsedScriptRaw[sceneIndex],
							description: rewrittenSceneDescription,
						};
						await tx
							.update(projects)
							.set({ scriptRaw: JSON.stringify(parsedScriptRaw) })
							.where(eq(projects.id, project.id));
					}
				} catch {
					// Keep regeneration non-blocking even if scriptRaw cannot be rewritten.
				}
			});

			return {
				sceneDescription: rewrittenSceneDescription,
				shotCount: rewrittenShots.length,
			};
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
			assetTypeOverride?: PromptAssetTypeSelection;
		}) => data,
	)
	.handler(
		async ({ data: { sceneId, lane, currentPrompt, assetTypeOverride } }) => {
			const { userId, scene, project } = await assertSceneOwner(sceneId);
			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);
			const resolvedAssetType = resolvePromptAssetType({
				override: assetTypeOverride,
				text: `${scene.description}\n${currentPrompt ?? ""}`,
				medium: "image",
			});

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
- Use the audio direction as context: if narration is included, leave visual room for spoken or on-screen text beats; if music-only or no-audio, make the frame carry more of the story visually.
- Keep it specific but compact; avoid bloated lists of adjectives
- Include only details that are visually important
- The prompt must stand alone and should read cleanly if sent directly to an image model
- Do NOT include meta-instructions like "generate an image of"
${settings?.intake?.audience ? `- Target audience: ${settings.intake.audience}` : ""}
${settings?.intake?.viewerAction ? `- Video goal: ${settings.intake.viewerAction}` : ""}
${getPrecisionPromptInstructions({ type: resolvedAssetType, medium: "image" })}

Return ONLY the final prompt, nothing else.`;

			const userMessage = currentPrompt
				? `Scene description: ${scene.description}\n\nCurrent prompt (improve this): ${currentPrompt}`
				: `Scene description: ${scene.description}`;

			const replicate = new Replicate({ auth: apiKey });
			const projectContext = [
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
				settings?.intake?.audience
					? `Target audience: ${settings.intake.audience}`
					: null,
			]
				.filter(Boolean)
				.join("\n");
			const sceneVisualBrief = await buildSceneVisualBrief({
				replicate,
				medium: "image",
				projectName: project.name,
				sceneTitle: scene.title,
				sceneDescription: scene.description,
				projectContext,
				shotContext: `${lane === "start" ? "Opening" : "Closing"} frame for this scene`,
			});
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
						`Scene description: ${scene.description}`,
					]
						.filter(Boolean)
						.join("\n\n"),
				});

				// Persist the generated prompt to the scene
				const col =
					lane === "start"
						? { startFramePrompt: finalPrompt }
						: { endFramePrompt: finalPrompt };
				await db.update(scenes).set(col).where(eq(scenes.id, scene.id));

				return { prompt: finalPrompt, assetType: resolvedAssetType };
			} finally {
				clearTimeout(timeout);
			}
		},
	);

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

export const generateAudioPrompt = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			sceneId: string;
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
	.handler(async ({ data: { sceneId, mode, targetDurationSec } }) => {
		const { userId, scene, project } = await assertSceneOwner(sceneId);
		const apiKey = await getUserApiKey(userId);
		const settings = normalizeProjectSettings(project.settings);
		const intake = settings?.intake;

		const sceneShots = await db.query.shots.findMany({
			where: and(eq(shots.sceneId, sceneId), isNull(shots.deletedAt)),
			orderBy: asc(shots.order),
		});

		const totalDurationSec =
			targetDurationSec ??
			sceneShots.reduce((sum, currentShot) => sum + currentShot.durationSec, 0);

		const shotDescriptions =
			sceneShots
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
			`Scene title: ${scene.title ?? "Untitled"}`,
			`Scene description: ${scene.description}`,
			`Scene duration target: ${totalDurationSec || 8} seconds`,
			`Scene shots:\n${shotDescriptions}`,
		]
			.filter(Boolean)
			.join("\n");

		const systemPrompt =
			mode === "voiceover"
				? `You are a professional narration writer for short-form and long-form video.

Write a narration script for this ONE scene using the project and scene context below.

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

Write one concise but highly specific background music prompt for this scene using the project and scene context below.

${projectContext}

Rules:
- Describe genre, instrumentation, tempo/energy, mood, sonic texture, and how the music should support the scene's emotional progression.
- Keep it instrumental unless the project explicitly calls for vocals.
- Match the project's visual style, mood, audience, and concept.
- Do not mention scene numbers, timestamps, or implementation notes.
- Return one polished prompt in a single paragraph, not a list.

Return ONLY the music prompt text, nothing else.`
					: `You are an expert prompt writer for sound effect and ambience generation models.

Write one concise but highly specific SFX/ambience prompt for this scene using the project and scene context below.

${projectContext}

Rules:
- Describe the concrete environmental sounds, foley details, spatial feel, and intensity changes that should be heard in this scene.
- Anchor the prompt to the scene and shot visuals, but describe sound only.
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
						"You are an expert prompt writer for scene-aware audio generation.",
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
	deleteShotVideo,
	enhanceShotImagePrompt,
	enhanceShotVideoPrompt,
	generateShotImagePrompt,
	generateShotImages,
	generateShotVideo,
	generateShotVideoPrompt,
	getShotImageRunStatuses,
	getShotVideoRunStatuses,
	pollShotAssets,
	pollShotVideos,
	pollVideoAsset,
	reorderShot,
	saveShotPrompt,
	selectShotAsset,
	selectShotVideo,
	updateShot,
	uploadShotReferenceImage,
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
