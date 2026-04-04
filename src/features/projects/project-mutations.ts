import { createServerFn } from "@tanstack/react-start";
import {
	and,
	asc,
	desc,
	eq,
	inArray,
	isNotNull,
	isNull,
	or,
} from "drizzle-orm";
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
import { parseOpeningHook, parseSceneProposal } from "./lib/script-helpers";
import { normalizeProjectSettings } from "./project-normalize";
import type {
	IntakeAnswers,
	OpeningHookDraft,
	ProjectSettings,
	ScenePlanEntry,
	ScriptEditDraft,
	ScriptEditSelection,
	ShotPlanEntry,
} from "./project-types";

const MAX_MESSAGE_LENGTH = 5_000;
const MAX_HISTORY_MESSAGES = 30;
const REPLICATE_TIMEOUT_MS = 60_000;

function extractJsonBlock<T>(response: string): T | null {
	const parseCandidate = (candidate: string): T | null => {
		try {
			return JSON.parse(candidate.trim()) as T;
		} catch {
			return null;
		}
	};

	const extractBalancedJsonObject = (text: string): string | null => {
		const start = text.indexOf("{");
		if (start === -1) return null;

		let depth = 0;
		let inString = false;
		let isEscaped = false;

		for (let index = start; index < text.length; index += 1) {
			const char = text[index];

			if (inString) {
				if (isEscaped) {
					isEscaped = false;
					continue;
				}
				if (char === "\\") {
					isEscaped = true;
					continue;
				}
				if (char === '"') {
					inString = false;
				}
				continue;
			}

			if (char === '"') {
				inString = true;
				continue;
			}

			if (char === "{") {
				depth += 1;
				continue;
			}

			if (char === "}") {
				depth -= 1;
				if (depth === 0) {
					return text.slice(start, index + 1);
				}
			}
		}

		return null;
	};

	try {
		const fenceMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
		const fencedBlock = fenceMatch?.[1];
		if (fencedBlock) {
			const parsed = parseCandidate(fencedBlock);
			if (parsed) return parsed;
		}

		const parsedRaw = parseCandidate(response);
		if (parsedRaw) return parsedRaw;

		const embeddedJson = extractBalancedJsonObject(
			fencedBlock ? fencedBlock : response,
		);
		if (!embeddedJson) return null;

		return parseCandidate(embeddedJson);
	} catch {
		return null;
	}
}

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

		const settings = normalizeProjectSettings(project.settings);
		const intake = settings?.intake ?? null;
		const openingHook = settings?.workshop?.openingHook ?? null;
		const systemPrompt = buildSystemPrompt(project.name, intake);
		const openingHookContext = openingHook
			? `
CURRENT OPENING HOOK:
- Headline: ${openingHook.headline}
- Narration: ${openingHook.narration}
- Visual direction: ${openingHook.visualDirection}
`
			: "";
		const llmMessages = recentHistory.map((m) =>
			m.role === "user" ? `User: ${m.content}` : `Assistant: ${m.content}`,
		);
		const prompt = `${systemPrompt}${openingHookContext}\n\n${llmMessages.join("\n\n")}`;

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

export const generateOpeningHook = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string; feedback?: string }) => ({
		projectId: data.projectId,
		feedback: data.feedback?.trim() || undefined,
	}))
	.handler(async ({ data: { projectId, feedback } }) => {
		const { userId, project } = await assertProjectOwner(projectId, "error");
		const settings = normalizeProjectSettings(project.settings) ?? {};
		const intake = settings.intake ?? null;
		if (!intake) {
			throw new Error("Save the creative brief before generating a hook");
		}

		const existingHook = settings.workshop?.openingHook ?? null;
		const apiKey = await getUserApiKey(userId);
		const replicate = new Replicate({ auth: apiKey });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);
		const prompt = `You are a creative director developing only the opening hook for a video.

CREATIVE BRIEF:
- Channel preset: ${intake.channelPreset}
- Purpose: ${intake.purpose ?? "Not specified"}
- Target length: ${intake.length}
- Target duration: ${intake.targetDurationSec ?? 300} seconds total
- Visual style: ${intake.style?.join(", ") ?? "Not specified"}
- Mood / tone: ${intake.mood?.join(", ") ?? "Not specified"}
- Setting: ${intake.setting?.join(", ") ?? "Not specified"}
- Audience: ${intake.audience ?? "Not specified"}
- Desired viewer action: ${intake.viewerAction ?? "Not specified"}
- Working title: ${intake.workingTitle || "Not provided"}
- Thumbnail promise: ${intake.thumbnailPromise || "Not provided"}
- Concept: ${intake.concept}

TASK:
- Generate only the opening hook for the first 3-10 seconds.
- Do not outline the full script or scene plan.
- The hook should be specific, visually direct, and strong enough to build the rest of the script around.
- The visual direction must describe what the viewer sees, not generic placeholders.
- The narration should be concise and usable as spoken or on-screen hook copy.

${
	existingHook
		? `CURRENT OPENING HOOK:
- Headline: ${existingHook.headline}
- Narration: ${existingHook.narration}
- Visual direction: ${existingHook.visualDirection}
`
		: ""
}${
	feedback
		? `USER FEEDBACK TO APPLY:
${feedback}
`
		: ""
}
Return only this fenced block:
\`\`\`opening_hook
{
  "headline": "Short internal label for the hook",
  "narration": "1-2 lines of opening narration or on-screen hook copy",
  "visualDirection": "Specific visual direction for what appears on screen in the hook"
}
\`\`\``;

		try {
			const chunks: string[] = [];
			for await (const event of replicate.stream("anthropic/claude-4.5-haiku", {
				input: { prompt, max_tokens: 1200, temperature: 0.5 },
				signal: controller.signal,
			})) {
				chunks.push(String(event));
			}
			const content = chunks.join("");
			const openingHook =
				parseOpeningHook(content) ??
				buildFallbackOpeningHook(existingHook, intake.concept, feedback);
			const nextSettings: ProjectSettings = {
				...settings,
				workshop: {
					...(settings.workshop ?? {}),
					openingHook,
				},
			};
			const assistantContent = feedback
				? "I updated the opening hook in the workspace. Tell me what to sharpen next."
				: "I drafted an opening hook in the workspace. Tell me what to change before we expand it.";

			await db.transaction(async (tx) => {
				if (feedback) {
					await tx.insert(messages).values({
						projectId,
						role: "user",
						content: feedback,
					});
				}

				await tx
					.update(projects)
					.set({ settings: nextSettings })
					.where(eq(projects.id, projectId));

				await tx.insert(messages).values({
					projectId,
					role: "assistant",
					content: assistantContent,
				});
			});

			return { openingHook, assistantContent };
		} finally {
			clearTimeout(timeout);
		}
	});

export const generateScenePlan = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string; feedback?: string }) => ({
		projectId: data.projectId,
		feedback: data.feedback?.trim() || undefined,
	}))
	.handler(async ({ data: { projectId, feedback } }) => {
		const { userId, project } = await assertProjectOwner(projectId, "error");
		const settings = normalizeProjectSettings(project.settings) ?? {};
		const intake = settings.intake ?? null;
		const openingHook = settings.workshop?.openingHook ?? null;
		if (!intake) {
			throw new Error("Save the creative brief before generating scenes");
		}
		if (!openingHook) {
			throw new Error("Generate an opening hook before expanding into scenes");
		}

		const apiKey = await getUserApiKey(userId);
		const recentHistory = await db.query.messages
			.findMany({
				where: eq(messages.projectId, projectId),
				orderBy: desc(messages.createdAt),
				limit: MAX_HISTORY_MESSAGES,
			})
			.then((rows) => rows.reverse());
		const historyBlock = recentHistory
			.map((m) =>
				m.role === "user" ? `User: ${m.content}` : `Assistant: ${m.content}`,
			)
			.join("\n\n");

		const replicate = new Replicate({ auth: apiKey });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);
		const prompt = `You are a creative director expanding an approved opening hook into a full scene-by-scene script plan.

PROJECT:
- Name: ${project.name}
- Channel preset: ${intake.channelPreset}
- Purpose: ${intake.purpose ?? "Not specified"}
- Target duration: ${intake.targetDurationSec ?? 300} seconds
- Visual style: ${intake.style?.join(", ") ?? "Not specified"}
- Mood / tone: ${intake.mood?.join(", ") ?? "Not specified"}
- Setting: ${intake.setting?.join(", ") ?? "Not specified"}
- Audience: ${intake.audience ?? "Not specified"}
- Desired viewer action: ${intake.viewerAction ?? "Not specified"}
- Working title: ${intake.workingTitle || "Not provided"}
- Thumbnail promise: ${intake.thumbnailPromise || "Not provided"}
- Concept: ${intake.concept}

APPROVED OPENING HOOK:
- Headline: ${openingHook.headline}
- Narration: ${openingHook.narration}
- Visual direction: ${openingHook.visualDirection}

RECENT WORKSHOP CONTEXT:
${historyBlock || "No prior chat context."}

${
	feedback
		? `USER DIRECTION FOR THIS SCENE PLAN:
${feedback}
`
		: ""
}
TASK:
- Generate the full scene breakdown now.
- Start from the approved opening hook and make the first scene match it.
- Each scene should represent a distinct progression beat in the story, not repetitive rewording.
- Scene descriptions must be production-ready visual descriptions that can later be broken into shots.
- Keep each scene description specific about what appears on screen, lighting, framing, action, and narration/audio when relevant.
- Do not ask another question. Do not return only hook edits.

Return a short note plus this exact fenced JSON block:

\`\`\`scenes
[
  {
    "sceneNumber": 1,
    "title": "Short scene title",
    "description": "Detailed scene description with visuals, action, camera/framing, and narration/audio when relevant.",
    "durationSec": 8,
    "beat": "Hook / Problem / Proof / Payoff / CTA",
    "hookRole": "hook"
  }
]
\`\`\``;

		try {
			const chunks: string[] = [];
			for await (const event of replicate.stream("anthropic/claude-4.5-haiku", {
				input: { prompt, max_tokens: 4096, temperature: 0.6 },
				signal: controller.signal,
			})) {
				chunks.push(String(event));
			}

			const assistantContent = chunks.join("").trim();
			if (!assistantContent) {
				throw new Error("AI returned an empty scene plan — please try again");
			}
			if (!parseSceneProposal(assistantContent)) {
				throw new Error("AI did not return a valid scene plan");
			}

			await db.transaction(async (tx) => {
				if (feedback) {
					await tx.insert(messages).values({
						projectId,
						role: "user",
						content: feedback,
					});
				}
				await tx.insert(messages).values({
					projectId,
					role: "assistant",
					content: assistantContent,
				});
			});

			return { content: assistantContent };
		} finally {
			clearTimeout(timeout);
		}
	});

export const proposeScriptEdit = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			scope: ScriptEditSelection;
			instructions: string;
		}) => {
			const instructions = data.instructions.trim();
			if (!instructions) throw new Error("Edit instructions cannot be empty");
			return {
				projectId: data.projectId,
				scope: data.scope,
				instructions,
			};
		},
	)
	.handler(async ({ data: { projectId, scope, instructions } }) => {
		const { userId, project } = await assertProjectOwner(projectId, "error");
		const hasSelection =
			scope.project || scope.sceneIds.length > 0 || scope.shotIds.length > 0;
		if (!hasSelection) {
			throw new Error(
				"Select at least one scene, shot, or the project to edit",
			);
		}
		const apiKey = await getUserApiKey(userId);
		const settings = normalizeProjectSettings(project.settings);

		const projectScenes = await db.query.scenes.findMany({
			where: and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)),
			orderBy: asc(scenes.order),
		});
		const sceneIds = projectScenes.map((scene) => scene.id);
		const projectShots =
			sceneIds.length > 0
				? await db.query.shots.findMany({
						where: and(
							inArray(shots.sceneId, sceneIds),
							isNull(shots.deletedAt),
						),
						orderBy: asc(shots.order),
					})
				: [];
		const shotsBySceneId = new Map<string, typeof projectShots>();
		for (const shot of projectShots) {
			const existing = shotsBySceneId.get(shot.sceneId) ?? [];
			existing.push(shot);
			shotsBySceneId.set(shot.sceneId, existing);
		}

		const sceneOrderMap = new Map(
			projectScenes.map((scene, index) => [scene.id, index + 1]),
		);
		const selectedScenes = scope.project
			? projectScenes
			: projectScenes.filter((scene) => scope.sceneIds.includes(scene.id));
		if (selectedScenes.length === 0) {
			// Allow shot-only edits.
			if (scope.shotIds.length === 0) {
				throw new Error("Nothing is selected to edit");
			}
		}
		const scopeLabel = scope.project
			? "the whole project"
			: [
					scope.sceneIds.length
						? `${scope.sceneIds.length} selected scene${scope.sceneIds.length === 1 ? "" : "s"}`
						: null,
					scope.shotIds.length
						? `${scope.shotIds.length} selected shot${scope.shotIds.length === 1 ? "" : "s"}`
						: null,
				]
					.filter(Boolean)
					.join(" and ");

		const selectedSceneBlock = projectScenes
			.filter(
				(scene) =>
					scope.project ||
					scope.sceneIds.includes(scene.id) ||
					(scope.shotIds.length > 0 &&
						(projectShots.some(
							(shot) =>
								shot.sceneId === scene.id && scope.shotIds.includes(shot.id),
						) ||
							false)),
			)
			.map((scene) => {
				const sceneOrder = sceneOrderMap.get(scene.id) ?? 0;
				const sceneShotsForPrompt = shotsBySceneId.get(scene.id) ?? [];
				const shotLines = sceneShotsForPrompt
					.map((shot, index) => ({
						shot,
						shotOrder: index + 1,
					}))
					.filter(
						({ shot }) =>
							scope.project ||
							scope.sceneIds.includes(scene.id) ||
							scope.shotIds.includes(shot.id),
					)
					.map(
						({ shot, shotOrder }) =>
							`  - shotOrder: ${shotOrder}; description: ${shot.description}`,
					)
					.join("\n");
				return [
					`sceneOrder: ${sceneOrder}`,
					`sceneDescription: ${scene.description}`,
					shotLines ? "shots:" : null,
					shotLines || null,
				]
					.filter(Boolean)
					.join("\n");
			})
			.join("\n\n");

		const prompt = `You are a script editor making a targeted draft edit to an existing video outline.

Project: ${project.name}
Concept: ${settings?.intake?.concept ?? "Not provided"}
Purpose: ${settings?.intake?.purpose ?? "Not provided"}

Selected scope: ${scopeLabel}
User edit request:
${instructions}

Current selected material:
${selectedSceneBlock}

Rules:
- Only edit the selected scope.
- If the scope is a scene, rewrite that scene description and all shots in that scene.
- If the scope is a shot, rewrite only that one shot description.
- If the scope is the whole project, you may rewrite any scene and shot descriptions.
- Keep the structure intact. Do not add or remove scenes or shots.
- Be concrete and production-ready.

Return only JSON:
\`\`\`json
{
  "summary": "short one-line summary of what changed",
  "sceneUpdates": [
    { "sceneOrder": 2, "description": "updated description" }
  ],
  "shotUpdates": [
    { "sceneOrder": 2, "shotOrder": 1, "description": "updated shot description" }
  ]
}
\`\`\``;

		const replicate = new Replicate({ auth: apiKey });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

		try {
			const chunks: string[] = [];
			for await (const event of replicate.stream("anthropic/claude-4.5-haiku", {
				input: { prompt, max_tokens: 2048, temperature: 0.5 },
				signal: controller.signal,
			})) {
				chunks.push(String(event));
			}

			const parsed = extractJsonBlock<{
				summary?: string;
				sceneUpdates?: Array<{ sceneOrder?: number; description?: string }>;
				shotUpdates?: Array<{
					sceneOrder?: number;
					shotOrder?: number;
					description?: string;
				}>;
			}>(chunks.join("").trim());
			if (!parsed) {
				throw new Error("AI returned an invalid edit draft");
			}

			const sceneUpdates =
				parsed.sceneUpdates
					?.map((update) => {
						const scene = projectScenes[(update.sceneOrder ?? 0) - 1];
						const description = String(update.description ?? "").trim();
						if (!scene || !description) return null;
						if (!scope.project && !scope.sceneIds.includes(scene.id)) {
							return null;
						}
						return { sceneId: scene.id, description };
					})
					.filter((value): value is { sceneId: string; description: string } =>
						Boolean(value),
					) ?? [];

			const shotUpdates =
				parsed.shotUpdates
					?.map((update) => {
						const scene = projectScenes[(update.sceneOrder ?? 0) - 1];
						if (!scene) return null;
						const sceneShots = shotsBySceneId.get(scene.id) ?? [];
						const shot = sceneShots[(update.shotOrder ?? 0) - 1];
						const description = String(update.description ?? "").trim();
						if (!shot || !description) return null;
						if (
							!scope.project &&
							!scope.sceneIds.includes(scene.id) &&
							!scope.shotIds.includes(shot.id)
						) {
							return null;
						}
						return { shotId: shot.id, description };
					})
					.filter((value): value is { shotId: string; description: string } =>
						Boolean(value),
					) ?? [];

			if (sceneUpdates.length === 0 && shotUpdates.length === 0) {
				throw new Error("The draft did not contain any editable changes");
			}

			const draft: ScriptEditDraft = {
				scope,
				instructions,
				summary:
					String(parsed.summary ?? "Draft updated").trim() || "Draft updated",
				sceneUpdates,
				shotUpdates,
			};

			return draft;
		} finally {
			clearTimeout(timeout);
		}
	});

export const applyScriptEditDraft = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string; draft: ScriptEditDraft }) => data)
	.handler(async ({ data: { projectId, draft } }) => {
		await assertProjectOwner(projectId, "error");

		await db.transaction(async (tx) => {
			for (const update of draft.sceneUpdates) {
				await tx
					.update(scenes)
					.set({ description: update.description })
					.where(eq(scenes.id, update.sceneId));
			}

			for (const update of draft.shotUpdates) {
				await tx
					.update(shots)
					.set({ description: update.description })
					.where(eq(shots.id, update.shotId));
			}

			const project = await tx.query.projects.findFirst({
				where: eq(projects.id, projectId),
				columns: { scriptRaw: true },
			});
			if (project?.scriptRaw) {
				try {
					const parsed = JSON.parse(project.scriptRaw) as ScenePlanEntry[];
					const projectScenes = await tx.query.scenes.findMany({
						where: and(
							eq(scenes.projectId, projectId),
							isNull(scenes.deletedAt),
						),
						orderBy: asc(scenes.order),
						columns: { id: true },
					});
					const sceneOrderById = new Map(
						projectScenes.map((scene, index) => [scene.id, index]),
					);
					for (const update of draft.sceneUpdates) {
						const sceneIndex = sceneOrderById.get(update.sceneId);
						if (sceneIndex !== undefined && parsed[sceneIndex]) {
							parsed[sceneIndex] = {
								...parsed[sceneIndex],
								description: update.description,
							};
						}
					}
					await tx
						.update(projects)
						.set({ scriptRaw: JSON.stringify(parsed) })
						.where(eq(projects.id, projectId));
				} catch {
					// Non-blocking if scriptRaw cannot be rewritten.
				}
			}
		});

		return { ok: true };
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
					shotSize:
						| "extreme-wide"
						| "wide"
						| "medium"
						| "close-up"
						| "extreme-close-up"
						| "insert";
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
							shotSize: shot.shotSize,
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
				shotSize:
					(["wide", "medium", "close-up", "insert"] as const)[j % 4] ??
					"medium",
				durationSec: shotDuration,
			});
		}
	}
	return result;
}

function buildFallbackOpeningHook(
	existingHook: OpeningHookDraft | null,
	concept: string,
	feedback?: string,
): OpeningHookDraft {
	if (existingHook && feedback) {
		return {
			headline: existingHook.headline,
			narration: `${existingHook.narration} ${feedback}`.trim(),
			visualDirection: existingHook.visualDirection,
		};
	}

	return {
		headline: "Opening hook",
		narration:
			concept.trim().slice(0, 220) ||
			"Lead with the strongest promise in the first few seconds.",
		visualDirection:
			"Open on the single most arresting visual from the concept and frame it so the viewer immediately understands the tension.",
	};
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
