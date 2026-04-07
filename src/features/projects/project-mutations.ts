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
	buildShotImagePromptPrompt,
	buildSystemPrompt,
	getUserApiKey,
	parseShotBreakdownResponse,
	parseShotImagePromptResponse,
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
- Audio direction: ${intake.audioMode ?? "Not specified"}
- Audience: ${intake.audience ?? "Not specified"}
- Desired viewer action: ${intake.viewerAction ?? "Not specified"}
- Working title: ${intake.workingTitle || "Not provided"}
- Thumbnail promise: ${intake.thumbnailPromise || "Not provided"}
- Concept: ${intake.concept}

TASK:
- Generate only the opening hook for the first 3-10 seconds.
- Do not outline the full script or scene plan.
- The hook must be specific and visual. Describe what the viewer literally sees on screen, not abstract ideas or generic placeholders.
- The visual direction should include environment, lighting, subject positioning, mood, and any motion or action happening in the frame.
- Match the visual style specified in the brief. Let that style shape your vocabulary and the concrete details you describe.
- The narration should be concise and usable as spoken or on-screen hook copy.
- If the audio direction is "Background music only" or "No narration or music", keep narration empty or minimal and make the visual hook carry the storytelling instead of relying on spoken explanation.
- The visualDirection must be 3-5 sentences minimum so the opening frame has enough production detail to expand into a full scene plan.

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
  "narration": "1-2 lines of opening narration or on-screen hook copy, or an empty string if the selected audio direction should not use narration",
  "visualDirection": "Detailed visual direction for what appears on screen in the hook. Include environment, subject, lighting, framing, mood, and style-specific details. 3-5 sentences minimum."
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
			const styleLabel = intake.style?.length
				? intake.style.join(", ")
				: "a clear visual style";
			const moodLabel = intake.mood?.length
				? intake.mood.join(", ")
				: "the right tone";
			const assistantContent = feedback
				? `I updated the opening hook in the workspace and sharpened the visual direction around ${styleLabel}. If you want, we can push it further in one of these directions:

- More visually specific and production-ready
- More ${moodLabel.toLowerCase()} and emotionally pointed
- More surprising in the first 3 seconds

\`\`\`suggestions
["Make it more visually specific", "Push the emotion further", "Make the first 3 seconds more surprising"]
\`\`\``
				: `Sharper version of your idea: ${intake.concept.trim()}

I drafted an opening hook in the workspace using a ${styleLabel.toLowerCase()} direction. Three possible ways to shape it from here:

- Make it more scientific and explanatory
- Make it more cinematic and emotionally immersive
- Make it more playful and stylized

\`\`\`suggestions
["Make it more scientific", "Make it more cinematic", "Make it more playful"]
\`\`\``;

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
- Audio direction: ${intake.audioMode ?? "Not specified"}
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
- Generate a full breakdown of 3-7 scenes covering the entire video duration.
- Start from the approved opening hook and make Scene 1 match it.
- Each scene must represent a distinct progression beat in the story, not a repetitive rewording of the same idea.
- Each scene description must be a rich, detailed visual narrative with 4-6 sentences minimum.
- Describe the environment in detail: what the space looks like, what objects are present, what the lighting is doing, and what colors dominate.
- Describe the subject(s) in detail: what they are doing, their body language or facial expression, and where they are positioned in the frame.
- Describe the mood and energy of the scene and the key motion or action that changes from the start of the scene to the end.
- Think of each scene as a short chapter with enough visual information that a cinematographer can break it into 2-4 distinct shots without inventing missing details.
- Match the visual style from the brief throughout. If the style is cartoon, describe cartoon-appropriate color, character expressiveness, and painterly lighting. If cinematic, describe lens feel, depth of field, and practical or natural lighting. If 3D render, describe materials, reflections, and volumetric effects. If anime, describe linework, cel shading, and dramatic highlights.
- Respect the selected audio direction. If narration is included, embed concise narration or spoken beats into the scene descriptions where relevant. If the format is music-only or silent, do not write narration-dependent scenes; make the visual action and atmosphere self-sufficient.
- Do not ask another question. Do not return only hook edits.

Return a short note plus this exact fenced JSON block:

\`\`\`scenes
[
  {
    "sceneNumber": 1,
    "title": "Short scene title",
    "description": "Rich, detailed scene description with environment, subjects, lighting, mood, action, and style-specific details. 4-6 sentences minimum. Include narration, on-screen text, music cues, or silence cues only when they match the selected audio direction so that context carries into the shot breakdown.",
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
			const { userId, project } = await assertProjectOwner(projectId, "error");
			const settings = normalizeProjectSettings(project.settings);

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
					settings?.intake,
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

				shotPlan = await populateShotImagePrompts({
					replicate,
					shotPlan,
					parsedScenes,
					intake: settings?.intake,
				});
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
					imagePrompt: string;
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
							imagePrompt: shot.imagePrompt?.trim() || shot.description,
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
	const shotProgression = [
		{
			shotSize: "wide" as const,
			prefix:
				"Opening keyframe: establish the scene's baseline state with the main environment and subject anchors clearly visible.",
		},
		{
			shotSize: "medium" as const,
			prefix:
				"Progression keyframe: move closer to the primary subject or action and show the scene's central change becoming visibly stronger.",
		},
		{
			shotSize: "close-up" as const,
			prefix:
				"Payoff keyframe: isolate the clearest visual consequence of that change in a tighter detail-focused frame while preserving the scene's main continuity anchor.",
		},
		{
			shotSize: "insert" as const,
			prefix:
				"Detail cutaway keyframe: focus on one tactile object, texture, or action detail that reinforces the same scene state and transitions smoothly from the previous frame.",
		},
	];
	const result: ShotPlanEntry[] = [];
	for (let i = 0; i < parsedScenes.length; i++) {
		const scene = parsedScenes[i];
		const sceneDuration = scene.durationSec ?? 30;
		const shotCount = Math.max(1, Math.ceil(sceneDuration / 5));
		const shotDuration = Math.round(sceneDuration / shotCount);
		for (let j = 0; j < shotCount; j++) {
			const fallbackShot = shotProgression[j] ?? shotProgression[3];
			result.push({
				sceneIndex: i,
				description: `${fallbackShot.prefix} Scene context: ${scene.description}`,
				shotType: "visual" as const,
				shotSize: fallbackShot.shotSize,
				durationSec: shotDuration,
			});
		}
	}
	return result;
}

async function populateShotImagePrompts({
	replicate,
	shotPlan,
	parsedScenes,
	intake,
}: {
	replicate: Replicate;
	shotPlan: ShotPlanEntry[];
	parsedScenes: ScenePlanEntry[];
	intake?: IntakeAnswers | null;
}) {
	const shotsByScene = new Map<number, ShotPlanEntry[]>();
	for (const shot of shotPlan) {
		const sceneShots = shotsByScene.get(shot.sceneIndex) ?? [];
		sceneShots.push(shot);
		shotsByScene.set(shot.sceneIndex, sceneShots);
	}

	for (const [sceneIndex, sceneShots] of shotsByScene) {
		const scene = parsedScenes[sceneIndex];
		if (!scene || sceneShots.length === 0) continue;

		const prompt = buildShotImagePromptPrompt(
			{
				title: scene.title || "",
				description: scene.description,
				durationSec: scene.durationSec,
			},
			sceneShots,
			intake,
		);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

		try {
			const chunks: string[] = [];
			for await (const event of replicate.stream("anthropic/claude-4.5-haiku", {
				input: { prompt, max_tokens: 4096, temperature: 0.5 },
				signal: controller.signal,
			})) {
				chunks.push(String(event));
			}

			const imagePrompts = parseShotImagePromptResponse(
				chunks.join(""),
				sceneShots.length,
			);
			if (!imagePrompts) continue;

			sceneShots.forEach((shot, index) => {
				shot.imagePrompt = imagePrompts[index];
			});
		} catch {
			// Keep shot descriptions as fallback image prompts for this scene only.
		} finally {
			clearTimeout(timeout);
		}
	}

	return shotPlan;
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
