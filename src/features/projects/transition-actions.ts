"use server";

import { createServerFn } from "@tanstack/react-start";
import { runs } from "@trigger.dev/sdk";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, transitionVideos } from "@/db/schema";
import { assertShotOwner } from "@/lib/assert-project-owner.server";
import { cleanupStorageKeys } from "@/lib/r2-cleanup.server";
import { uploadFromUrl } from "@/lib/r2.server";
import { startTransitionVideoGeneration } from "@/trigger";
import { getUserApiKey } from "./image-generation-helpers.server";
import {
	normalizeProjectSettings,
	normalizeVideoDefaults,
} from "./project-normalize";
import type {
	PromptAssetTypeSelection,
	TriggerRunSummary,
	TriggerRunUiStatus,
	VideoDefaults,
} from "./project-types";
import {
	buildSceneVisualBrief,
	critiqueAndRewritePrompt,
} from "./prompt-quality.server";
import {
	getPrecisionPromptInstructions,
	resolvePromptAssetType,
} from "./prompt-strategy";
import { generateAndSaveTransitionPromptForPair } from "./transition-prompt-drafts.server";
import {
	getVideoGenerationStatus,
	getVideoProviderApiKey,
} from "./video-generation-provider.server";
import { isPendingVideoStatus } from "./video-status";

const REPLICATE_TIMEOUT_MS = 60_000;
const STALE_TRANSITION_VIDEO_MS = 15 * 60 * 1000;
const ORPHANED_TRANSITION_VIDEO_ERROR =
	"Video generation stopped before completion. Please try again.";
const TRANSITION_PROMPT_MODEL = "google/gemini-2.5-flash";
const TRANSITION_PROMPT_MAX_OUTPUT_TOKENS = 8192;

const TRANSITION_MOVEMENT_RULES = `Camera movement is required for transition prompts unless the user explicitly asks for a locked shot.

Strong requirements:
- The [Motion] section must describe a visible continuous transformation from the exact start frame toward the exact end frame.
- The [Camera] section must specify one clear movement pattern such as push-in, dolly-in, crane down, pan right, tilt up, drift left, orbit, or pull-back.
- Name the start framing and the ending framing or distance shift when possible, such as wide to medium, medium to close, elevated to low-angle, or centered to off-axis.
- Use concrete motion verbs like pushes, glides, descends, tilts, arcs, tracks, or sweeps.

Avoid:
- generic wording like "smooth transition" or "camera moves naturally"
- describing only atmosphere without directional movement
- static or nearly static camera language unless the user explicitly asked for that
- vague statements that do not explain what changes between the selected start and end frames`;

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

async function loadSelectedTransitionFrameImage(shotId: string) {
	return db.query.assets.findFirst({
		where: and(
			eq(assets.shotId, shotId),
			inArray(assets.type, ["start_image", "end_image", "image"]),
			eq(assets.isSelected, true),
			eq(assets.status, "done"),
			isNull(assets.deletedAt),
		),
	});
}

async function describeTransitionFrameImage(args: {
	replicate: Replicate;
	imageUrl: string;
	shotLabel: "start" | "end";
	shotDescription: string;
}) {
	void args.replicate;

	return `Selected ${args.shotLabel} frame image is attached as a Gemini image input. Use the visible subject placement, framing, environment, lighting, and any motion cues from that image directly. Shot description: ${args.shotDescription}`;
}

async function buildTransitionImageContext(args: {
	replicate: Replicate;
	fromShotId: string;
	toShotId: string;
	fromShotDescription: string;
	toShotDescription: string;
}) {
	const [fromImage, toImage] = await Promise.all([
		loadSelectedTransitionFrameImage(args.fromShotId),
		loadSelectedTransitionFrameImage(args.toShotId),
	]);

	const [fromFrameVisual, toFrameVisual] = await Promise.all(
		[
			fromImage?.url
				? describeTransitionFrameImage({
						replicate: args.replicate,
						imageUrl: fromImage.url,
						shotLabel: "start",
						shotDescription: args.fromShotDescription,
					})
				: Promise.resolve(null),
			toImage?.url
				? describeTransitionFrameImage({
						replicate: args.replicate,
						imageUrl: toImage.url,
						shotLabel: "end",
						shotDescription: args.toShotDescription,
					})
				: Promise.resolve(null),
		].map(async (promise, index) => {
			try {
				return await promise;
			} catch (error) {
				console.warn(
					`[TransitionPrompt] image-analysis-failed frame=${index === 0 ? "start" : "end"} error=${error instanceof Error ? error.message : String(error)}`,
				);
				return null;
			}
		}),
	);

	return {
		fromFrameImageId: fromImage?.id ?? null,
		fromFrameImageUrl: fromImage?.url ?? null,
		fromFrameVisual,
		toFrameImageId: toImage?.id ?? null,
		toFrameImageUrl: toImage?.url ?? null,
		toFrameVisual,
	};
}

function buildFallbackTransitionPrompt(args: {
	fromShotDescription: string;
	toShotDescription: string;
	sceneDescription: string;
	fromFrameVisual?: string | null;
	toFrameVisual?: string | null;
	userPrompt?: string;
}) {
	const startFrame =
		args.fromFrameVisual?.trim() || `Start frame: ${args.fromShotDescription}`;
	const endFrame =
		args.toFrameVisual?.trim() || `End frame: ${args.toShotDescription}`;
	const userMotion = args.userPrompt?.trim();

	return `[Motion]: ${userMotion ? `${userMotion} ` : ""}Carry the viewer from ${args.fromShotDescription.trim()} into ${args.toShotDescription.trim()}, preserving the shared subject and environment while making the visual state change clearly readable. Anchor the transition to these frame cues: ${startFrame} ${endFrame}

[Camera]: Use a deliberate push-in, pull-back, pan, tilt, or lateral drift that bridges the start and end framing in one continuous move, with the camera path chosen to make the shift between the two shots feel physically connected.

[Style]: Keep the scene's visual language consistent with ${args.sceneDescription.trim()}, maintaining coherent lighting, atmosphere, color palette, and texture across the transition.`;
}

async function runTransitionPromptModel(args: {
	replicate: Replicate;
	input: {
		images: string[];
		prompt: string;
		system_instruction: string;
		max_output_tokens: number;
		dynamic_thinking: boolean;
		thinking_budget: number;
		temperature: number;
	};
	signal: AbortSignal;
}) {
	const output: unknown = await args.replicate.run(TRANSITION_PROMPT_MODEL, {
		input: args.input,
		signal: args.signal,
		wait: { mode: "block", timeout: 60 },
	});

	if (Array.isArray(output)) {
		return output
			.map((event) => String(event))
			.join("")
			.trim();
	}

	if (typeof output === "string") {
		return output.trim();
	}

	if (output == null) {
		return "";
	}

	return String(output).trim();
}

export const enhanceTransitionVideoPrompt = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			fromShotId: string;
			toShotId: string;
			userPrompt: string;
			useProjectContext?: boolean;
			usePrevShotContext?: boolean;
			assetTypeOverride?: PromptAssetTypeSelection;
		}) => data,
	)
	.handler(
		async ({
			data: {
				fromShotId,
				toShotId,
				userPrompt,
				useProjectContext = true,
				usePrevShotContext: _usePrevShotContext = true,
				assetTypeOverride,
			},
		}) => {
			const {
				userId,
				shot: fromShot,
				project,
			} = await assertShotOwner(fromShotId);
			const { shot: toShot, project: toProject } = await assertShotOwner(toShotId);

			if (toProject.id !== project.id) {
				throw new Error(
					"Cannot enhance transition prompt between shots from different projects",
				);
			}

			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);
			const resolvedAssetType = resolvePromptAssetType({
				override: assetTypeOverride,
				text: `${fromShot.description}\n${toShot.description}\n${userPrompt}`,
				medium: "transition",
			});
			const intake = settings?.intake;
			const styleCtx =
				useProjectContext && intake?.style?.length
					? `Visual style: ${intake.style.join(", ")}`
					: "";

			const projectContextBlock = useProjectContext
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
			const replicate = new Replicate({ auth: apiKey });
			const [
				{ fromFrameImageUrl, fromFrameVisual, toFrameImageUrl, toFrameVisual },
				sceneVisualBrief,
			] = await Promise.all([
				buildTransitionImageContext({
					replicate,
					fromShotId,
					toShotId,
					fromShotDescription: fromShot.description,
					toShotDescription: toShot.description,
				}),
				buildSceneVisualBrief({
					replicate,
					medium: "transition",
					projectName: project.name,
					sceneDescription: `${fromShot.description} into ${toShot.description}`,
					projectContext: projectContextBlock,
					shotContext: `Start shot: ${fromShot.description}\nEnd shot: ${toShot.description}`,
				}),
			]);

			const contextBlock = [
				useProjectContext
					? `PROJECT CONTEXT:\n${projectContextBlock || `Project: ${project.name}`}`
					: null,
				`From: ${fromShot.description}`,
				`To: ${toShot.description}`,
				sceneVisualBrief ? `Scene visual brief:\n${sceneVisualBrief}` : null,
				fromFrameVisual
					? `Selected start frame image:\n${fromFrameVisual}`
					: null,
				toFrameVisual ? `Selected end frame image:\n${toFrameVisual}` : null,
			]
				.filter(Boolean)
				.join("\n\n");

			const systemPrompt = `You are an expert prompt writer for modern video generation models like Kling.
The user wrote a motion idea for a transition video. Rewrite it into a strong, concrete prompt while preserving the user's intent.

IMPORTANT CONTEXT — HOW THIS PIPELINE WORKS:
The selected start-frame image and end-frame image are effectively one implicit shot pair. The transition prompt must tell the video model exactly how to animate from the start image state to the end image state without losing continuity.

Use this exact lightweight structure:

[Motion]: Describe the main visual change from the start frame to the end frame in 1-2 specific sentences. Name what moves, how it moves, and what visible state change occurs.

[Camera]: Describe the camera behavior in 1 specific sentence. A real camera move is required unless the user explicitly asked for a locked shot.

[Style]: Describe mood, lighting continuity, atmosphere, and style consistency in 1 sentence.

Rules:
- Preserve all important motion elements the user mentioned
- Keep it motion-first, but anchor the motion to the actual shared subject/environment details visible in both frames
- Be specific about direction and pacing when relevant
- Anchor the movement to the actual selected start and end frames, not just the shot descriptions
- The start and end frames must share continuity anchors, and the prompt should explain how those anchors evolve rather than jumping to an unrelated composition
- Write in present tense
- Use the audio direction as timing context: transitions under narration should leave room for the spoken beat, while music-only or silent transitions should make the visual change read clearly on its own.
- Do not settle for vague phrasing like "smooth transition" or "camera moves closer" unless you specify what visually changes in the image
${TRANSITION_MOVEMENT_RULES}
${getPrecisionPromptInstructions({ type: resolvedAssetType, medium: "transition" })}

Transition context:
${contextBlock}

Return ONLY the final prompt, nothing else.`;

			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				REPLICATE_TIMEOUT_MS,
			);
			try {
				const modelOutput = await runTransitionPromptModel({
					replicate,
					input: {
						images: [fromFrameImageUrl, toFrameImageUrl].filter(
							(url): url is string => Boolean(url),
						),
						prompt: `${systemPrompt}\n\nUser's prompt to enhance:\n${userPrompt}`,
						system_instruction:
							"You are an expert prompt writer for modern video generation models like Kling.",
						max_output_tokens: TRANSITION_PROMPT_MAX_OUTPUT_TOKENS,
						dynamic_thinking: false,
						thinking_budget: 0,
						temperature: 0.7,
					},
					signal: controller.signal,
				});
				const enhanced =
					modelOutput ||
					buildFallbackTransitionPrompt({
						fromShotDescription: fromShot.description,
						toShotDescription: toShot.description,
						sceneDescription: `${fromShot.description} into ${toShot.description}`,
						fromFrameVisual,
						toFrameVisual,
						userPrompt,
					});
				if (!modelOutput) {
					console.warn("[TransitionPrompt] enhance-empty-response:fallback", {
						fromShotId,
						toShotId,
						hasStartFrameImage: Boolean(fromFrameImageUrl),
						hasEndFrameImage: Boolean(toFrameImageUrl),
					});
				}
				const finalPrompt = await critiqueAndRewritePrompt({
					replicate,
					medium: "transition",
					assetType: resolvedAssetType,
					prompt: enhanced,
					context: [
						sceneVisualBrief
							? `Scene visual brief:\n${sceneVisualBrief}`
							: null,
						fromFrameVisual
							? `Selected start frame:\n${fromFrameVisual}`
							: null,
						toFrameVisual ? `Selected end frame:\n${toFrameVisual}` : null,
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

export const generateTransitionVideoPrompt = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			fromShotId: string;
			toShotId: string;
			useProjectContext?: boolean;
			usePrevShotContext?: boolean;
			assetTypeOverride?: PromptAssetTypeSelection;
		}) => data,
	)
	.handler(
		async ({
			data: {
				fromShotId,
				toShotId,
				useProjectContext = true,
				usePrevShotContext = true,
				assetTypeOverride,
			},
		}) =>
			generateAndSaveTransitionPromptForPair({
				fromShotId,
				toShotId,
				useProjectContext,
				usePrevShotContext,
				assetTypeOverride,
			}),
	);

export const generateTransitionVideo = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			fromShotId: string;
			toShotId: string;
			prompt: string;
			videoSettings?: VideoDefaults | unknown;
		}) => data,
	)
	.handler(
		async ({ data: { fromShotId, toShotId, prompt, videoSettings } }) => {
			const {
				userId,
				shot: fromShot,
				project,
			} = await assertShotOwner(fromShotId);
			const { project: toProject } = await assertShotOwner(toShotId);
			const normalizedVideo = normalizeVideoDefaults(videoSettings);

			if (toProject.id !== project.id) {
				throw new Error(
					"Cannot generate transition between shots from different projects",
				);
			}

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

			const modelId = normalizedVideo.model;
			const normalizedModelOptions = {
				...normalizedVideo.modelOptions,
				duration:
					typeof normalizedVideo.modelOptions.duration === "number"
						? normalizedVideo.modelOptions.duration
						: fromShot.durationSec,
			};

			const [placeholder] = await db
				.insert(transitionVideos)
				.values({
					projectId: project.id,
					fromShotId,
					toShotId,
					fromImageId: fromImage.id,
					toImageId: toImage.id,
					prompt,
					model: modelId,
					modelSettings: normalizedModelOptions,
					status: "queued",
					isSelected: false,
					stale: false,
				})
				.returning({ id: transitionVideos.id });

			const handle = await startTransitionVideoGeneration.trigger({
				transitionVideoId: placeholder.id,
				userId,
				modelId,
				prompt,
				modelOptions: normalizedModelOptions,
			});

			await db
				.update(transitionVideos)
				.set({ jobId: handle.id })
				.where(eq(transitionVideos.id, placeholder.id));

			return { transitionVideoId: placeholder.id, jobId: handle.id };
		},
	);

export const pollTransitionVideos = createServerFn({ method: "POST" })
	.inputValidator((data: { fromShotId: string; toShotId: string }) => data)
	.handler(async ({ data: { fromShotId, toShotId } }) => {
		const { userId, project } = await assertShotOwner(fromShotId);
		const { shot: toShot } = await assertShotOwner(toShotId);
		if (toShot.projectId !== project.id) throw new Error("Unauthorized");

		await reconcileGeneratingTransitionVideos({ fromShotId, toShotId, userId });

		const videos = await db.query.transitionVideos.findMany({
			where: and(
				eq(transitionVideos.fromShotId, fromShotId),
				eq(transitionVideos.toShotId, toShotId),
				isNull(transitionVideos.deletedAt),
			),
			orderBy: desc(transitionVideos.createdAt),
		});

		const generating = videos.filter((video) =>
			isPendingVideoStatus(video.status),
		);
		const done = videos.filter((video) => video.status === "done" && video.url);
		const errored = videos.filter((video) => video.status === "error");
		const selectedDone = done.find((video) => video.isSelected) ?? null;

		if (generating.length === 0) {
			console.info("[TransitionVideoServer] poll:complete", {
				fromShotId,
				toShotId,
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

async function reconcileGeneratingTransitionVideos(args: {
	fromShotId: string;
	toShotId: string;
	userId: string;
}) {
	const generatingVideos = await db.query.transitionVideos.findMany({
		where: and(
			eq(transitionVideos.fromShotId, args.fromShotId),
			eq(transitionVideos.toShotId, args.toShotId),
			inArray(transitionVideos.status, ["queued", "generating", "finalizing"]),
			isNull(transitionVideos.deletedAt),
		),
		orderBy: desc(transitionVideos.createdAt),
	});

	await Promise.all(
		generatingVideos.map(async (video) => {
			if (Date.now() - video.createdAt.getTime() > STALE_TRANSITION_VIDEO_MS) {
				console.warn("[TransitionVideoServer] reconcile:timed-out", {
					videoId: video.id,
				});
				await db
					.update(transitionVideos)
					.set({
						status: "error",
						errorMessage:
							video.status === "queued"
								? "This model stayed queued too long because provider capacity was full. Try again or choose a faster model."
								: "Video generation timed out before the provider returned a result. Try again or choose a faster model.",
					})
					.where(eq(transitionVideos.id, video.id));
				return;
			}

			if (!video.jobId) {
				if (!video.generationId) {
					console.warn(
						"[TransitionVideoServer] reconcile:missing-job-and-generation",
						{
							videoId: video.id,
							hasGenerationId: Boolean(video.generationId),
						},
					);
					await db
						.update(transitionVideos)
						.set({
							status: "error",
							errorMessage: ORPHANED_TRANSITION_VIDEO_ERROR,
						})
						.where(eq(transitionVideos.id, video.id));
					return;
				}
			}

			if (video.generationId) {
				try {
					const providerApiKey = await getVideoProviderApiKey({
						userId: args.userId,
						modelId: video.model,
					});
					const prediction = await getVideoGenerationStatus({
						modelId: video.model,
						requestId: video.generationId,
						providerApiKey,
						mode: "transition",
					});
					if (prediction.stage === "done") {
						const sourceUrl = prediction.outputUrl;
						if (!sourceUrl) {
							console.error(
								"[TransitionVideoServer] reconcile:missing-output-url",
								{
									videoId: video.id,
									generationId: video.generationId,
								},
							);
							await db
								.update(transitionVideos)
								.set({
									status: "error",
									errorMessage: "Unexpected output format from video provider",
								})
								.where(eq(transitionVideos.id, video.id));
							return;
						}

						const storageKey = `projects/${video.projectId}/transitions/${video.id}.mp4`;
						const storedUrl = await uploadFromUrl(
							sourceUrl,
							storageKey,
							"video/mp4",
						);
						await db
							.update(transitionVideos)
							.set({
								url: storedUrl,
								storageKey,
								status: "done",
								errorMessage: null,
							})
							.where(eq(transitionVideos.id, video.id));
						console.info(
							"[TransitionVideoServer] reconcile:provider-succeeded",
							{
								videoId: video.id,
							},
						);
						return;
					}

					if (prediction.stage === "error") {
						await db
							.update(transitionVideos)
							.set({
								status: "error",
								errorMessage:
									prediction.errorMessage ?? ORPHANED_TRANSITION_VIDEO_ERROR,
							})
							.where(eq(transitionVideos.id, video.id));
						console.warn("[TransitionVideoServer] reconcile:provider-failed", {
							videoId: video.id,
						});
						return;
					}
				} catch (error) {
					// Fall through to Trigger-run reconciliation below.
					console.warn(
						"[TransitionVideoServer] reconcile:provider-check-failed",
						{
							videoId: video.id,
							generationId: video.generationId,
							error: error instanceof Error ? error.message : String(error),
						},
					);
				}
			}

			if (!video.jobId) {
				return;
			}

			try {
				const run = await runs.retrieve(video.jobId);
				const runStatus = mapTriggerRunStatus(run);

				if (runStatus === "failed" || runStatus === "canceled") {
					await db
						.update(transitionVideos)
						.set({
							status: "error",
							errorMessage:
								run.error?.message ?? ORPHANED_TRANSITION_VIDEO_ERROR,
						})
						.where(eq(transitionVideos.id, video.id));
					console.warn("[TransitionVideoServer] reconcile:trigger-failed", {
						videoId: video.id,
						runStatus,
					});
				}
			} catch (error) {
				const message =
					error instanceof Error ? error.message.toLowerCase() : "";
				const looksMissingRun =
					message.includes("not found") ||
					message.includes("no run") ||
					message.includes("404");

				if (looksMissingRun) {
					console.warn(
						"[TransitionVideoServer] reconcile:missing-trigger-run",
						{
							videoId: video.id,
							jobId: video.jobId,
						},
					);
					await db
						.update(transitionVideos)
						.set({
							status: "error",
							errorMessage: ORPHANED_TRANSITION_VIDEO_ERROR,
						})
						.where(eq(transitionVideos.id, video.id));
				}
			}
		}),
	);
}

export const getTransitionVideoRunStatuses = createServerFn({ method: "POST" })
	.inputValidator((data: { fromShotId: string; toShotId: string }) => data)
	.handler(async ({ data: { fromShotId, toShotId } }) => {
		const { project } = await assertShotOwner(fromShotId);
		const { shot: toShot } = await assertShotOwner(toShotId);
		if (toShot.projectId !== project.id) throw new Error("Unauthorized");

		const generatingVideos = await db.query.transitionVideos.findMany({
			where: and(
				eq(transitionVideos.fromShotId, fromShotId),
				eq(transitionVideos.toShotId, toShotId),
				inArray(transitionVideos.status, [
					"queued",
					"generating",
					"finalizing",
				]),
				isNull(transitionVideos.deletedAt),
			),
			orderBy: desc(transitionVideos.createdAt),
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
		if (tv.status !== "done" || !tv.url)
			throw new Error("Only completed transition videos can be selected");

		// Assert ownership on fromShot and verify toShot belongs to the same project
		const { shot: fromShot } = await assertShotOwner(tv.fromShotId);
		const { shot: toShot } = await assertShotOwner(tv.toShotId);
		if (toShot.projectId !== fromShot.projectId)
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

		await db
			.update(transitionVideos)
			.set({ deletedAt: new Date() })
			.where(eq(transitionVideos.id, transitionVideoId));

		// R2 cleanup AFTER the DB soft-delete
		await cleanupStorageKeys([tv.storageKey]);
	});
