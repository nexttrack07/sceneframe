import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import {
	assets,
	messages,
	projects,
	scenes,
	shots,
	transitionVideos,
} from "@/db/schema";
import { assertProjectOwner } from "@/lib/assert-project-owner.server";
import { deleteObject } from "@/lib/r2.server";
import {
	buildShotBreakdownPrompt,
	buildSystemPrompt,
	getUserApiKey,
	parseShotBreakdownResponse,
} from "./image-generation-helpers.server";
import { normalizeProjectSettings } from "./project-normalize";
import type {
	IntakeAnswers,
	ProjectSettings,
	ScenePlanEntry,
	ShotPlanEntry,
} from "./project-types";

const MAX_MESSAGE_LENGTH = 5_000;
const MAX_HISTORY_MESSAGES = 30;
const REPLICATE_TIMEOUT_MS = 60_000;

export const saveIntake = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string; intake: IntakeAnswers }) => {
		const { intake } = data;
		if (!intake.channelPreset) throw new Error("Channel preset is required");
		if (!intake.concept?.trim() || intake.concept.trim().length < 10) {
			throw new Error("Concept must be at least 10 characters");
		}
		return data;
	})
	.handler(async ({ data: { projectId, intake } }) => {
		const { project } = await assertProjectOwner(projectId, "error");

		const existing = normalizeProjectSettings(project.settings);
		const merged: ProjectSettings = {
			...existing,
			intake,
		};

		await db
			.update(projects)
			.set({ settings: merged })
			.where(eq(projects.id, projectId));
	});

export const sendMessage = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string; content: string }) => {
		const trimmed = data.content.trim();
		if (trimmed.length === 0) throw new Error("Message cannot be empty");
		if (trimmed.length > MAX_MESSAGE_LENGTH)
			throw new Error(
				`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`,
			);
		return { projectId: data.projectId, content: trimmed };
	})
	.handler(async ({ data: { projectId, content } }) => {
		const { userId, project } = await assertProjectOwner(projectId, "error");

		await db.insert(messages).values({ projectId, role: "user", content });

		const recentHistory = await db.query.messages
			.findMany({
				where: eq(messages.projectId, projectId),
				orderBy: desc(messages.createdAt),
				limit: MAX_HISTORY_MESSAGES,
			})
			.then((rows) => rows.reverse());
		const apiKey = await getUserApiKey(userId);

		const intake = normalizeProjectSettings(project.settings)?.intake ?? null;
		const systemPrompt = buildSystemPrompt(project.name, intake);
		const llmMessages = recentHistory.map((m) =>
			m.role === "user" ? `User: ${m.content}` : `Assistant: ${m.content}`,
		);
		const prompt = `${systemPrompt}\n\n${llmMessages.join("\n\n")}`;

		const replicate = new Replicate({ auth: apiKey });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

		try {
			const chunks: string[] = [];
			for await (const event of replicate.stream("anthropic/claude-4.5-haiku", {
				input: { prompt, max_tokens: 2048, temperature: 0.7 },
				signal: controller.signal,
			})) {
				chunks.push(String(event));
			}
			const assistantContent = chunks.join("");

			if (!assistantContent.trim()) {
				throw new Error("AI returned an empty response — please try again");
			}

			await db
				.insert(messages)
				.values({ projectId, role: "assistant", content: assistantContent });

			return { content: assistantContent };
		} finally {
			clearTimeout(timeout);
		}
	});

export const approveScenes = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			parsedScenes: ScenePlanEntry[];
			targetDurationSec?: number;
		}) => {
			if (!Array.isArray(data.parsedScenes) || data.parsedScenes.length < 1) {
				throw new Error("At least one scene is required");
			}
			if (data.parsedScenes.length > 10) {
				throw new Error("Too many scenes (max 10)");
			}
			for (const scene of data.parsedScenes) {
				if (!scene.description?.trim()) {
					throw new Error("Every scene must have a description");
				}
			}
			return data;
		},
	)
	.handler(
		async ({ data: { projectId, parsedScenes, targetDurationSec = 300 } }) => {
			const { userId } = await assertProjectOwner(projectId, "error");

			// ---------------------------------------------------------------
			// 1. OUTSIDE transaction: call AI to generate shot breakdown
			// ---------------------------------------------------------------
			let shotPlan: ShotPlanEntry[];

			try {
				const apiKey = await getUserApiKey(userId);
				const prompt = buildShotBreakdownPrompt(
					parsedScenes.map((s) => ({
						title: s.title || "",
						description: s.description,
						durationSec: s.durationSec,
					})),
					targetDurationSec,
				);

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
							input: { prompt, max_tokens: 4096, temperature: 0.5 },
							signal: controller.signal,
						},
					)) {
						chunks.push(String(event));
					}
					const aiResponse = chunks.join("");
					const parsed = parseShotBreakdownResponse(
						aiResponse,
						parsedScenes.length,
					);
					shotPlan = parsed ?? buildFallbackShotPlan(parsedScenes);
				} finally {
					clearTimeout(timeout);
				}
			} catch {
				// AI failed entirely — fall back to 1 shot per scene
				shotPlan = buildFallbackShotPlan(parsedScenes);
			}

			// ---------------------------------------------------------------
			// 2. Compute cumulative timestamps
			// ---------------------------------------------------------------
			let cursor = 0;
			const timestampedShots = shotPlan.map((shot) => {
				const start = cursor;
				cursor += shot.durationSec;
				return { ...shot, timestampStart: start, timestampEnd: cursor };
			});

			// ---------------------------------------------------------------
			// 2b. OUTSIDE transaction: collect existing assets for R2 cleanup
			// ---------------------------------------------------------------
			const existingSceneIdsForCleanup = (
				await db
					.select({ id: scenes.id })
					.from(scenes)
					.where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)))
			).map((r) => r.id);

			if (existingSceneIdsForCleanup.length > 0) {
				const existingAssets = await db
					.select({ storageKey: assets.storageKey })
					.from(assets)
					.where(
						and(
							inArray(assets.sceneId, existingSceneIdsForCleanup),
							isNull(assets.deletedAt),
						),
					);

				for (const a of existingAssets) {
					if (a.storageKey) {
						deleteObject(a.storageKey).catch((err) =>
							console.error("R2 cleanup failed for key:", a.storageKey, err),
						);
					}
				}

				// Also fire R2 cleanup for transition videos referencing the existing shots
				const existingShotIdsForCleanup = (
					await db
						.select({ id: shots.id })
						.from(shots)
						.where(
							and(
								inArray(shots.sceneId, existingSceneIdsForCleanup),
								isNull(shots.deletedAt),
							),
						)
				).map((r) => r.id);

				if (existingShotIdsForCleanup.length > 0) {
					const tvRows = await db
						.select({ storageKey: transitionVideos.storageKey })
						.from(transitionVideos)
						.where(
							and(
								or(
									inArray(
										transitionVideos.fromShotId,
										existingShotIdsForCleanup,
									),
									inArray(transitionVideos.toShotId, existingShotIdsForCleanup),
								),
								isNull(transitionVideos.deletedAt),
							),
						);

					for (const tv of tvRows) {
						if (tv.storageKey) {
							deleteObject(tv.storageKey).catch((err) =>
								console.error(
									"R2 cleanup failed for transition video key:",
									tv.storageKey,
									err,
								),
							);
						}
					}
				}
			}

			// ---------------------------------------------------------------
			// 3. INSIDE a single transaction: persist everything
			// ---------------------------------------------------------------
			await db.transaction(async (tx) => {
				// Soft-delete existing shots, transition videos, and assets (via scene IDs)
				const existingSceneIds = (
					await tx
						.select({ id: scenes.id })
						.from(scenes)
						.where(
							and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)),
						)
				).map((r) => r.id);

				if (existingSceneIds.length > 0) {
					const now = new Date();
					const existingShotIds = (
						await tx
							.select({ id: shots.id })
							.from(shots)
							.where(
								and(
									inArray(shots.sceneId, existingSceneIds),
									isNull(shots.deletedAt),
								),
							)
					).map((r) => r.id);

					await tx
						.update(shots)
						.set({ deletedAt: now })
						.where(
							and(
								inArray(shots.sceneId, existingSceneIds),
								isNull(shots.deletedAt),
							),
						);

					await tx
						.update(assets)
						.set({ deletedAt: now })
						.where(
							and(
								inArray(assets.sceneId, existingSceneIds),
								isNull(assets.deletedAt),
							),
						);

					if (existingShotIds.length > 0) {
						await tx
							.update(transitionVideos)
							.set({ deletedAt: now })
							.where(
								and(
									or(
										inArray(transitionVideos.fromShotId, existingShotIds),
										inArray(transitionVideos.toShotId, existingShotIds),
									),
									isNull(transitionVideos.deletedAt),
								),
							);
					}
				}

				// Soft-delete existing scenes
				await tx
					.update(scenes)
					.set({ deletedAt: new Date() })
					.where(
						and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)),
					);

				// Insert new scene rows
				const insertedScenes = await tx
					.insert(scenes)
					.values(
						parsedScenes.map((scene, i) => ({
							projectId,
							order: i + 1,
							title: scene.title || null,
							description: scene.description,
							stage: "script" as const,
						})),
					)
					.returning({ id: scenes.id });

				// Insert new shot rows
				// Group shots by sceneIndex, then assign order within each scene
				const shotsByScene = new Map<number, typeof timestampedShots>();
				for (const shot of timestampedShots) {
					const existing = shotsByScene.get(shot.sceneIndex) ?? [];
					existing.push(shot);
					shotsByScene.set(shot.sceneIndex, existing);
				}

				const shotValues: Array<{
					sceneId: string;
					order: number;
					description: string;
					shotType: "talking" | "visual";
					durationSec: number;
					timestampStart: number;
					timestampEnd: number;
				}> = [];

				for (const [sceneIndex, sceneShots] of shotsByScene) {
					const sceneRow = insertedScenes[sceneIndex];
					if (!sceneRow) continue;
					sceneShots.forEach((shot, i) => {
						shotValues.push({
							sceneId: sceneRow.id,
							order: i + 1,
							description: shot.description,
							shotType: shot.shotType,
							durationSec: shot.durationSec,
							timestampStart: shot.timestampStart,
							timestampEnd: shot.timestampEnd,
						});
					});
				}

				if (shotValues.length > 0) {
					await tx.insert(shots).values(shotValues);
				}

				// Update project
				const summary = parsedScenes.map((s) => s.title).join(" → ");
				await tx
					.update(projects)
					.set({
						scriptStatus: "done",
						directorPrompt: summary,
						scriptRaw: JSON.stringify(parsedScenes),
					})
					.where(eq(projects.id, projectId));
			});
		},
	);

export const deleteProject = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string }) => data)
	.handler(async ({ data: { projectId } }) => {
		await assertProjectOwner(projectId, "error");

		// Collect all storageKeys (assets + transition videos) for R2 cleanup
		const sceneRows = await db
			.select({ id: scenes.id })
			.from(scenes)
			.where(eq(scenes.projectId, projectId));

		const sceneIds = sceneRows.map((r) => r.id);

		let storageKeys: string[] = [];
		let shotIds: string[] = [];
		if (sceneIds.length > 0) {
			const [assetRows, shotRows, tvRows] = await Promise.all([
				db
					.select({ storageKey: assets.storageKey })
					.from(assets)
					.where(
						and(
							inArray(assets.sceneId, sceneIds),
							isNotNull(assets.storageKey),
						),
					),
				db
					.select({ id: shots.id })
					.from(shots)
					.where(inArray(shots.sceneId, sceneIds)),
				db
					.select({ storageKey: transitionVideos.storageKey })
					.from(transitionVideos)
					.where(
						and(
							inArray(transitionVideos.sceneId, sceneIds),
							isNotNull(transitionVideos.storageKey),
						),
					),
			]);
			storageKeys = [
				...assetRows
					.map((r) => r.storageKey)
					.filter((k): k is string => k !== null),
				...tvRows
					.map((r) => r.storageKey)
					.filter((k): k is string => k !== null),
			];
			shotIds = shotRows.map((r) => r.id);
		}

		// Delete from R2 (fire and forget errors — DB cleanup proceeds regardless)
		const r2Results = await Promise.allSettled(
			storageKeys.map((key) => deleteObject(key)),
		);
		r2Results.forEach((result, i) => {
			if (result.status === "rejected") {
				console.error(
					"R2 deleteObject failed for key:",
					storageKeys[i],
					result.reason,
				);
			}
		});

		// Hard-delete everything from DB in dependency order
		// transitionVideos must be deleted before shots due to FK constraints
		await db.transaction(async (tx) => {
			if (sceneIds.length > 0) {
				await tx
					.delete(transitionVideos)
					.where(inArray(transitionVideos.sceneId, sceneIds));
				await tx.delete(assets).where(inArray(assets.sceneId, sceneIds));
				if (shotIds.length > 0) {
					await tx.delete(shots).where(inArray(shots.id, shotIds));
				}
				await tx.delete(scenes).where(inArray(scenes.id, sceneIds));
			}
			await tx.delete(messages).where(eq(messages.projectId, projectId));
			await tx.delete(projects).where(eq(projects.id, projectId));
		});
	});

function buildFallbackShotPlan(
	parsedScenes: ScenePlanEntry[],
): ShotPlanEntry[] {
	const result: ShotPlanEntry[] = [];
	for (let i = 0; i < parsedScenes.length; i++) {
		const scene = parsedScenes[i];
		const sceneDuration = scene.durationSec ?? 30;
		const shotCount = Math.max(1, Math.ceil(sceneDuration / 5));
		const shotDuration = Math.round(sceneDuration / shotCount);
		for (let j = 0; j < shotCount; j++) {
			result.push({
				sceneIndex: i,
				description:
					j === 0
						? scene.description
						: `${scene.description} (continuation ${j + 1})`,
				shotType: "visual" as const,
				durationSec: shotDuration,
			});
		}
	}
	return result;
}

export const resetWorkshop = createServerFn({ method: "POST" })
	.inputValidator((projectId: string) => projectId)
	.handler(async ({ data: projectId }) => {
		await assertProjectOwner(projectId, "error");

		await db.transaction(async (tx) => {
			// Soft-delete shots via scene IDs before soft-deleting scenes
			const sceneIds = (
				await tx
					.select({ id: scenes.id })
					.from(scenes)
					.where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)))
			).map((r) => r.id);

			if (sceneIds.length > 0) {
				await tx
					.update(shots)
					.set({ deletedAt: new Date() })
					.where(
						and(inArray(shots.sceneId, sceneIds), isNull(shots.deletedAt)),
					);

				// Soft-delete assets for those scenes/shots
				await tx
					.update(assets)
					.set({ deletedAt: new Date() })
					.where(
						and(inArray(assets.sceneId, sceneIds), isNull(assets.deletedAt)),
					);

				// Soft-delete transition videos referencing those scenes
				await tx
					.update(transitionVideos)
					.set({ deletedAt: new Date() })
					.where(
						and(
							inArray(transitionVideos.sceneId, sceneIds),
							isNull(transitionVideos.deletedAt),
						),
					);
			}

			await tx
				.update(scenes)
				.set({ deletedAt: new Date() })
				.where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)));

			// messages table has no deletedAt column — hard delete is intentional
			await tx.delete(messages).where(eq(messages.projectId, projectId));

			await tx
				.update(projects)
				.set({
					scriptStatus: "idle",
					directorPrompt: "",
					scriptRaw: null,
					scriptJobId: null,
					settings: null,
				})
				.where(eq(projects.id, projectId));
		});
	});

// ---------------------------------------------------------------------------
// saveEditorState — persists the editor timeline state as JSON
// ---------------------------------------------------------------------------

export const saveEditorState = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { projectId: string; editorState: Record<string, unknown> }) => {
			if (!data.projectId) throw new Error("projectId is required");
			if (!data.editorState) throw new Error("editorState is required");
			return data;
		},
	)
	.handler(async ({ data: { projectId, editorState } }) => {
		await assertProjectOwner(projectId, "error");

		await db
			.update(projects)
			.set({ editorState })
			.where(eq(projects.id, projectId));
	});
