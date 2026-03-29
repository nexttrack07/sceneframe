"use server";

import { createServerFn } from "@tanstack/react-start";
import { runs } from "@trigger.dev/sdk";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, transitionVideos } from "@/db/schema";
import { assertShotOwner } from "@/lib/assert-project-owner.server";
import { deleteObject, uploadFromUrl } from "@/lib/r2.server";
import { startTransitionVideoGeneration } from "@/trigger";
import {
	getUserApiKey,
	parseGeneratedMediaUrls,
	summarizeGenerationOutput,
} from "./image-generation-helpers.server";
import {
	normalizeProjectSettings,
	normalizeVideoDefaults,
} from "./project-normalize";
import type {
	TriggerRunSummary,
	TriggerRunUiStatus,
	VideoDefaults,
} from "./project-types";

const REPLICATE_TIMEOUT_MS = 60_000;
const STALE_TRANSITION_VIDEO_MS = 15 * 60 * 1000;
const ORPHANED_TRANSITION_VIDEO_ERROR =
	"Video generation stopped before completion. Please try again.";

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

			const systemPrompt = `You are an expert prompt writer for modern video generation models like Kling.
The user wrote a motion idea for a transition video. Rewrite it into a strong, concise prompt while preserving the user's intent.

Use this exact lightweight structure:

[Motion]: Describe the main visual change from the start frame to the end frame in 1-2 short sentences.

[Camera]: Describe the camera behavior in 1 short sentence, only if it materially helps.

[Style]: Describe mood, lighting continuity, and overall feel in 1 short sentence.

Rules:
- Preserve all important motion elements the user mentioned
- Keep it motion-first; do not over-describe static appearance
- Be specific about direction and pacing when relevant
- Write in present tense
- Keep every section compact

Transition context:
${contextBlock}

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

			const systemPrompt = `You are an expert prompt writer for modern video generation models like Kling.
You are generating a motion prompt for a transition video between two consecutive shots.

The video starts on Shot A and ends on Shot B. Describe the motion and camera behavior that naturally bridges those two frames.

Use this exact lightweight structure:

[Motion]: Describe how the composition and subject state evolve from Shot A to Shot B in 1-2 short sentences.

[Camera]: Describe the camera behavior in 1 short sentence, only if it materially helps.

[Style]: Describe mood, lighting continuity, and overall feel in 1 short sentence.

Rules:
- Present tense
- Be specific about direction, pacing, and camera behavior when relevant
- The motion should feel like a natural continuation from Shot A into Shot B
- Focus on what changes and moves; do not over-describe static details
- Keep every section compact
${!useProjectContext ? "- Base the motion prompt only on the shot descriptions provided" : ""}

Transition context:
${contextBlock}

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
				scene,
			} = await assertShotOwner(fromShotId);
			const { scene: toScene } = await assertShotOwner(toShotId);
			const normalizedVideo = normalizeVideoDefaults(videoSettings);

			if (toScene.projectId !== scene.projectId) {
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
					sceneId: scene.id,
					fromShotId,
					toShotId,
					fromImageId: fromImage.id,
					toImageId: toImage.id,
					prompt,
					model: modelId,
					modelSettings: normalizedModelOptions,
					status: "generating",
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
		const { scene: toScene } = await assertShotOwner(toShotId);
		if (toScene.projectId !== project.id) throw new Error("Unauthorized");

		await reconcileGeneratingTransitionVideos({ fromShotId, toShotId, userId });

		const videos = await db.query.transitionVideos.findMany({
			where: and(
				eq(transitionVideos.fromShotId, fromShotId),
				eq(transitionVideos.toShotId, toShotId),
				isNull(transitionVideos.deletedAt),
			),
			orderBy: desc(transitionVideos.createdAt),
		});

		const generating = videos.filter((video) => video.status === "generating");
		const done = videos.filter((video) => video.status === "done");
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
			eq(transitionVideos.status, "generating"),
			isNull(transitionVideos.deletedAt),
		),
		orderBy: desc(transitionVideos.createdAt),
	});

	const apiKey =
		generatingVideos.length > 0 ? await getUserApiKey(args.userId) : null;
	const replicate = apiKey ? new Replicate({ auth: apiKey }) : null;

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
							"Video generation timed out before the provider returned a result. Try again or choose a faster model.",
					})
					.where(eq(transitionVideos.id, video.id));
				return;
			}

			if (!video.jobId) {
				if (!replicate || !video.generationId) {
					console.warn(
						"[TransitionVideoServer] reconcile:missing-job-and-generation",
						{
							videoId: video.id,
							hasReplicate: Boolean(replicate),
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

			if (replicate && video.generationId) {
				try {
					const prediction = await replicate.predictions.get(
						video.generationId,
					);
					if (prediction.status === "succeeded") {
						const urls = parseGeneratedMediaUrls(prediction.output);
						const sourceUrl = urls[0];
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
									errorMessage: `Unexpected output format: ${summarizeGenerationOutput(prediction.output)}`,
								})
								.where(eq(transitionVideos.id, video.id));
							return;
						}

						const storageKey = `projects/${video.sceneId}/transitions/${video.id}.mp4`;
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

					if (
						prediction.status === "failed" ||
						prediction.status === "canceled"
					) {
						const rawErr = prediction.error;
						const errorMessage = rawErr
							? typeof rawErr === "string"
								? rawErr
								: (((rawErr as Record<string, unknown>).detail as string) ??
									JSON.stringify(rawErr))
							: ORPHANED_TRANSITION_VIDEO_ERROR;

						await db
							.update(transitionVideos)
							.set({
								status: "error",
								errorMessage,
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
		const { scene: toScene } = await assertShotOwner(toShotId);
		if (toScene.projectId !== project.id) throw new Error("Unauthorized");

		const generatingVideos = await db.query.transitionVideos.findMany({
			where: and(
				eq(transitionVideos.fromShotId, fromShotId),
				eq(transitionVideos.toShotId, toShotId),
				eq(transitionVideos.status, "generating"),
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
