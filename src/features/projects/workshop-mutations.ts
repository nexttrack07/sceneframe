import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, messages, projects, shots, transitionVideos } from "@/db/schema";
import { assertProjectOwner } from "@/lib/assert-project-owner.server";
import { withWorkshopLock } from "@/lib/project-lock.server";
import { cleanupStorageKeys } from "@/lib/r2-cleanup.server";
import {
	getUserApiKey,
} from "./image-generation-helpers.server";
import {
	ImagePromptArraySchema,
	OutlineArraySchema,
	parseLlmJson,
	ShotDraftArraySchema,
} from "./lib/llm-schemas";
import { normalizeProjectSettings } from "./project-normalize";
import type {
	IntakeAnswers,
	ProjectSettings,
	ScriptDraft,
	ShotDraftEntry,
	ShotPlanEntry,
} from "./project-types";

const MAX_MESSAGE_LENGTH = 5_000;
const MAX_HISTORY_MESSAGES = 30;
const REPLICATE_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------
// Edit instruction templates (injected when user has selected an item)
// ---------------------------------------------------------------------------

const EDIT_INSTRUCTION_SHOT = `
EDIT MODE: When the user asks you to change, update, or modify the selected shot, respond with TWO parts:
1. A brief conversational acknowledgment (1-2 sentences)
2. A fenced code block with the suggested edit:

\`\`\`workshop-edit
{
  "action": "update_shot",
  "index": <shot index from SELECTED ITEM>,
  "data": {
    "description": "<new shot description>",
    "shotSize": "<optional: wide/medium/close-up/extreme-close-up>",
    "shotType": "<optional: static/pan/tilt/dolly/handheld/drone/tracking>",
    "durationSec": <optional: number>
  }
}
\`\`\`

Only include the workshop-edit block if the user is requesting a change. For questions or discussion, respond conversationally without the block.`;

const EDIT_INSTRUCTION_PROMPT = `
EDIT MODE: When the user asks you to change, update, or modify the selected image prompt, respond with TWO parts:
1. A brief conversational acknowledgment (1-2 sentences)
2. A fenced code block with the suggested edit:

\`\`\`workshop-edit
{
  "action": "update_prompt",
  "index": <shot index from SELECTED ITEM>,
  "data": {
    "prompt": "<new image generation prompt>"
  }
}
\`\`\`

Only include the workshop-edit block if the user is requesting a change. For questions or discussion, respond conversationally without the block.`;

const EDIT_INSTRUCTION_OUTLINE = `
EDIT MODE: When the user asks you to change, update, or modify the selected outline beat, respond with TWO parts:
1. A brief conversational acknowledgment (1-2 sentences)
2. A fenced code block with the suggested edit:

\`\`\`workshop-edit
{
  "action": "update_outline",
  "index": <beat index from SELECTED ITEM>,
  "data": {
    "title": "<optional: new beat title>",
    "summary": "<optional: new beat summary>"
  }
}
\`\`\`

Only include the workshop-edit block if the user is requesting a change. For questions or discussion, respond conversationally without the block.`;

/**
 * Reconcile DB shot rows for a project against a new shot list.
 *
 * Behaviour:
 * - Existing shots are matched to the new list by order. Surviving rows
 *   are updated in place — their IDs and any attached assets stay intact.
 * - If the new list is longer than the existing list, the extra shots are
 *   inserted with fresh IDs.
 * - If the new list is shorter, the trailing shots that no longer have a
 *   counterpart are soft-deleted along with their assets and any
 *   transition videos that referenced them. Their R2 storage keys are
 *   collected and returned so the caller can clean them up after the
 *   transaction commits.
 *
 * This means regenerating shots no longer wipes the project. Only shots
 * that are genuinely removed lose their assets. First-time generation is
 * still a clean insert because there are no existing rows to reconcile.
 */
async function upsertShotRowsInTx(
	tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
	projectId: string,
	shotPlan: ShotPlanEntry[],
): Promise<{ assetKeys: string[]; transitionKeys: string[] }> {
	const now = new Date();

	const existing = await tx
		.select({ id: shots.id, order: shots.order })
		.from(shots)
		.where(and(eq(shots.projectId, projectId), isNull(shots.deletedAt)))
		.orderBy(asc(shots.order));

	let cursor = 0;
	const timestamped = shotPlan.map((shot) => {
		const start = cursor;
		cursor += shot.durationSec;
		return { ...shot, timestampStart: start, timestampEnd: cursor };
	});

	const overlap = Math.min(existing.length, timestamped.length);

	// Update overlapping shots in place. Surviving shot IDs stay stable so
	// their attached assets/transitions remain valid (though their content
	// may now be stale relative to the new description — that's a UX
	// concern, not a data integrity one).
	for (let i = 0; i < overlap; i++) {
		const target = existing[i];
		const next = timestamped[i];
		await tx
			.update(shots)
			.set({
				description: next.description,
				imagePrompt: next.imagePrompt?.trim() || next.description,
				shotType: next.shotType,
				shotSize: next.shotSize ?? "medium",
				durationSec: next.durationSec,
				timestampStart: next.timestampStart,
				timestampEnd: next.timestampEnd,
			})
			.where(eq(shots.id, target.id));
	}

	// Insert any shots beyond the existing count.
	const toInsert = timestamped.slice(overlap);
	if (toInsert.length > 0) {
		await tx.insert(shots).values(
			toInsert.map((shot, i) => ({
				projectId,
				order: overlap + i + 1,
				description: shot.description,
				imagePrompt: shot.imagePrompt?.trim() || shot.description,
				shotType: shot.shotType,
				shotSize: shot.shotSize ?? "medium",
				durationSec: shot.durationSec,
				timestampStart: shot.timestampStart,
				timestampEnd: shot.timestampEnd,
			})),
		);
	}

	// Soft-delete any existing shots beyond the new length and clean up
	// their attached assets + transitions. Collect storage keys before
	// the soft-delete so the caller can do R2 cleanup post-commit.
	const orphanShots = existing.slice(overlap);
	const assetKeys: string[] = [];
	const transitionKeys: string[] = [];

	if (orphanShots.length > 0) {
		const orphanIds = orphanShots.map((s) => s.id);

		const orphanAssets = await tx
			.select({ storageKey: assets.storageKey })
			.from(assets)
			.where(
				and(inArray(assets.shotId, orphanIds), isNull(assets.deletedAt)),
			);
		for (const a of orphanAssets) {
			if (a.storageKey) assetKeys.push(a.storageKey);
		}

		const orphanTransitions = await tx
			.select({ storageKey: transitionVideos.storageKey })
			.from(transitionVideos)
			.where(
				and(
					or(
						inArray(transitionVideos.fromShotId, orphanIds),
						inArray(transitionVideos.toShotId, orphanIds),
					),
					isNull(transitionVideos.deletedAt),
				),
			);
		for (const t of orphanTransitions) {
			if (t.storageKey) transitionKeys.push(t.storageKey);
		}

		await tx
			.update(shots)
			.set({ deletedAt: now })
			.where(inArray(shots.id, orphanIds));

		await tx
			.update(assets)
			.set({ deletedAt: now })
			.where(
				and(inArray(assets.shotId, orphanIds), isNull(assets.deletedAt)),
			);

		await tx
			.update(transitionVideos)
			.set({ deletedAt: now })
			.where(
				and(
					or(
						inArray(transitionVideos.fromShotId, orphanIds),
						inArray(transitionVideos.toShotId, orphanIds),
					),
					isNull(transitionVideos.deletedAt),
				),
			);
	}

	return { assetKeys, transitionKeys };
}

function buildSelectionContext(
	selectedItemId: string | undefined,
	scriptDraft: ScriptDraft | null,
): string {
	if (!selectedItemId || !scriptDraft) return "";

	const match = selectedItemId.match(/^(outline|shot|prompt)-(\d+)$/);
	if (!match) return "";

	const kind = match[1] as "outline" | "shot" | "prompt";
	const index = Number.parseInt(match[2], 10);
	if (Number.isNaN(index)) return "";

	if (kind === "outline") {
		const entry = scriptDraft.outline?.[index];
		if (!entry) return "";
		return `

SELECTED ITEM — the user is pointing at this beat:
Outline beat ${index + 1}: "${entry.title}"
Summary: ${entry.summary}

When the user says "this", "that", "it", or gives instructions without naming a target, apply them to THIS beat only. Do not touch the other beats.`;
	}

	if (kind === "shot") {
		const shot = scriptDraft.shots?.[index];
		if (!shot) return "";
		return `

SELECTED ITEM — the user is pointing at this shot:
Shot ${index + 1} (${shot.shotSize}, ${shot.shotType}, ${shot.durationSec}s): ${shot.description}

When the user says "this", "that", "it", or gives instructions without naming a target, apply them to THIS shot only. Do not touch the other shots.`;
	}

	// prompt
	const promptEntry = scriptDraft.imagePrompts?.find(
		(p) => p.shotIndex === index,
	);
	const shot = scriptDraft.shots?.[index];
	if (!promptEntry && !shot) return "";
	return `

SELECTED ITEM — the user is pointing at this image prompt:
Shot ${index + 1}${shot ? ` (${shot.description})` : ""}
Current prompt: ${promptEntry?.prompt ?? "(none yet)"}

When the user says "this", "that", "it", or gives instructions without naming a target, apply them to THIS prompt only. Do not touch the other prompts.`;
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
	.inputValidator(
		(data: {
			projectId: string;
			content: string;
			stage?: "outline" | "shots" | "prompts";
			clientMessageId?: string;
			selectedItemId?: string;
		}) => {
			const trimmed = data.content.trim();
			if (trimmed.length === 0) throw new Error("Message cannot be empty");
			if (trimmed.length > MAX_MESSAGE_LENGTH)
				throw new Error(
					`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`,
				);
			return {
				projectId: data.projectId,
				content: trimmed,
				stage: data.stage,
				clientMessageId: data.clientMessageId,
				selectedItemId: data.selectedItemId,
			};
		},
	)
	.handler(async ({ data: { projectId, content, stage, clientMessageId, selectedItemId } }) => {
		const { userId, project } = await assertProjectOwner(projectId, "error");

		// Idempotency: if the client retried with the same clientMessageId, short-circuit.
		if (clientMessageId) {
			const existing = await db.query.messages.findFirst({
				where: and(
					eq(messages.projectId, projectId),
					eq(messages.clientMessageId, clientMessageId),
				),
			});
			if (existing) {
				const assistant = await db.query.messages.findFirst({
					where: and(
						eq(messages.projectId, projectId),
						eq(messages.role, "assistant"),
						gt(messages.createdAt, existing.createdAt),
					),
					orderBy: asc(messages.createdAt),
				});
				if (assistant) return { content: assistant.content };

				// If the user message is older than 5 minutes with no assistant response,
				// it's orphaned (original request failed). Delete it and allow retry.
				const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
				if (existing.createdAt < fiveMinutesAgo) {
					await db.delete(messages).where(eq(messages.id, existing.id));
					// Fall through to create a new message below
				} else {
					throw new Error(
						"Message is still being processed — please wait before retrying",
					);
				}
			}
		}

		await db
			.insert(messages)
			.values({ projectId, role: "user", content, clientMessageId });

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
		const scriptDraft = project.scriptDraft ?? null;

		const currentStage = stage ?? scriptDraft?.stage ?? "outline";

		const intakeContext = intake
			? `
CREATIVE DIRECTION (from project setup):
- Target duration: ${intake.targetDurationSec ? `${intake.targetDurationSec}s` : "Not specified"}
- Visual style: ${intake.style?.join(", ") ?? "Not specified"}
- Mood / tone: ${intake.mood?.join(", ") ?? "Not specified"}
- Setting: ${intake.setting?.join(", ") ?? "Not specified"}
`
			: "";

		const draftContext = scriptDraft?.outline
			? `\nCURRENT OUTLINE (${scriptDraft.outline.length} beats generated)`
			: "";

		const selectionContext = buildSelectionContext(selectedItemId, scriptDraft);

		const hasOutline = Boolean(scriptDraft?.outline?.length);
		const stageInstruction =
			currentStage === "outline" && !hasOutline
				? `You are in the OUTLINE phase, but no outline has been generated yet. Your job is to understand what video the user wants to create through conversation.

STRICT RULES:
- Ask specific, cinematographer-style questions: What's the core concept? What camera style? Any special effects? How many characters? What's the emotional arc? What's the pacing?
- Ask ONE or TWO questions per response. Not more.
- NEVER generate outlines, scripts, narration, or any structured content. This is a conversation, not a generation step.
- NEVER return any fenced code blocks (no \`\`\`outline, \`\`\`json, or similar). Plain conversational text only.
- NEVER write narration, dialogue, or script copy. That comes in later stages.
- Do NOT make assumptions about details the user hasn't specified — ask instead.
- When you have gathered enough information (concept, tone, pacing, visual style, key subjects, narrative arc), say something like: "I think I have a solid picture of what you want. Ready for me to draft an outline?" and WAIT for the user to confirm.
- You may offer quick-reply suggestions using a \`\`\`suggestions block at the end.`
				: currentStage === "outline"
					? `You are in the OUTLINE phase. A narrative outline is visible in the right panel.
- Help the user refine individual beats in the outline through conversation.
- If a SELECTED ITEM is included below, the user is pointing directly at that beat — focus your suggestions there.
- Do NOT regenerate the entire outline unless explicitly asked.
- Do NOT write shot descriptions — that's the next stage.
${selectedItemId ? EDIT_INSTRUCTION_OUTLINE : ""}`
					: currentStage === "shots"
						? `You are in the SHOTS phase. A flat shot list is visible in the right panel.
- Help the user refine specific shot descriptions through conversation.
- If a SELECTED ITEM is included below, the user is pointing directly at that shot — focus there.
- Focus on cinematography, framing, visual detail, and production-ready direction.
- Each shot should be visually distinct from its neighbors.
- Do NOT regenerate all shots unless explicitly asked.
${selectedItemId ? EDIT_INSTRUCTION_SHOT : ""}`
						: `You are in the IMAGE PROMPTS phase. Per-shot image prompts are visible in the right panel.
- Help the user refine image generation prompts for specific shots.
- If a SELECTED ITEM is included below, the user is pointing directly at that prompt — focus there.
- Each prompt should be a standalone visual description suitable for AI image generation.
${selectedItemId ? EDIT_INSTRUCTION_PROMPT : ""}`;

		const systemPrompt = `You are a creative director and cinematographer helping plan a video project called "${project.name}".

${stageInstruction}

${intakeContext}${draftContext}${selectionContext}

Global rules:
- Be conversational and collaborative, like a real cinematographer in a creative session.
- Keep responses short and focused. No walls of text.
- Match the user's energy — if they're brief, be brief back.
- The user has action buttons in the UI to trigger generation (outline, shots, prompts). You do NOT need to generate structured content yourself — just have the conversation and let the user click the button when ready.`;

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

// ---------------------------------------------------------------------------
// applyWorkshopEdit — applies a single edit suggested by the LLM
// ---------------------------------------------------------------------------

export const applyWorkshopEdit = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			action: "update_shot" | "update_prompt" | "update_outline";
			index: number;
			data: Record<string, unknown>;
		}) => {
			if (typeof data.index !== "number" || data.index < 0) {
				throw new Error("Invalid index");
			}
			if (!data.action || !data.data) {
				throw new Error("Missing action or data");
			}
			return data;
		},
	)
	.handler(async ({ data: { projectId, action, index, data: editData } }) => {
		const { project } = await assertProjectOwner(projectId, "error");
		const draft = (project.scriptDraft ?? {}) as ScriptDraft;

		if (action === "update_outline") {
			if (!draft.outline || !draft.outline[index]) {
				throw new Error(`Outline beat ${index + 1} not found`);
			}
			const { title, summary } = editData as { title?: string; summary?: string };
			if (title) draft.outline[index].title = title;
			if (summary) draft.outline[index].summary = summary;
		} else if (action === "update_shot") {
			if (!draft.shots || !draft.shots[index]) {
				throw new Error(`Shot ${index + 1} not found`);
			}
			const { description, shotSize, shotType, durationSec } = editData as {
				description?: string;
				shotSize?: ShotDraftEntry["shotSize"];
				shotType?: ShotDraftEntry["shotType"];
				durationSec?: number;
			};
			if (description) draft.shots[index].description = description;
			if (shotSize) draft.shots[index].shotSize = shotSize;
			if (shotType) draft.shots[index].shotType = shotType;
			if (typeof durationSec === "number") draft.shots[index].durationSec = durationSec;

			// Also update the shots table if this shot has been promoted
			const shotRows = await db
				.select()
				.from(shots)
				.where(and(eq(shots.projectId, projectId), isNull(shots.deletedAt)))
				.orderBy(shots.order);

			if (shotRows[index]) {
				await db
					.update(shots)
					.set({
						description: description ?? shotRows[index].description,
						updatedAt: new Date(),
					})
					.where(eq(shots.id, shotRows[index].id));
			}
		} else if (action === "update_prompt") {
			if (!draft.imagePrompts) {
				draft.imagePrompts = [];
			}
			const { prompt } = editData as { prompt: string };
			if (!prompt) throw new Error("Prompt is required");

			const existing = draft.imagePrompts.find((p) => p.shotIndex === index);
			if (existing) {
				existing.prompt = prompt;
			} else {
				draft.imagePrompts.push({ shotIndex: index, prompt });
			}

			// Also update the shots table imagePrompt field if this shot has been promoted
			const shotRows = await db
				.select()
				.from(shots)
				.where(and(eq(shots.projectId, projectId), isNull(shots.deletedAt)))
				.orderBy(shots.order);

			if (shotRows[index]) {
				await db
					.update(shots)
					.set({
						imagePrompt: prompt,
						updatedAt: new Date(),
					})
					.where(eq(shots.id, shotRows[index].id));
			}
		}

		// Save the updated draft
		await db
			.update(projects)
			.set({ scriptDraft: draft })
			.where(eq(projects.id, projectId));

		return { success: true };
	});

/**
 * @deprecated Shot promotion now happens automatically inside generateShots,
 * reviewAndFixShots, and generateImagePrompts. This server function is kept
 * as a no-op for backward compatibility with any cached client bundles.
 * Safe to remove once all clients have updated.
 */
export const approveWorkshop = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			shots: ShotDraftEntry[];
			imagePrompts?: Array<{ shotIndex: number; prompt: string }>;
		}) => data,
	)
	.handler(async ({ data: { projectId } }) => {
		await assertProjectOwner(projectId, "error");
		// no-op: kept for backward compatibility, see deprecation note above
	});

export const setWorkshopStage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			stage: import("./project-types").WorkshopStage;
		}) => data,
	)
	.handler(async ({ data: { projectId, stage } }) => {
		const { project } = await assertProjectOwner(projectId, "error");
		const currentDraft = (project.scriptDraft ?? {}) as ScriptDraft;
		await db
			.update(projects)
			.set({ scriptDraft: { ...currentDraft, stage } })
			.where(eq(projects.id, projectId));
	});

export const generateOutline = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string; feedback?: string }) => ({
		projectId: data.projectId,
		feedback: data.feedback?.trim() || undefined,
	}))
	.handler(async ({ data: { projectId, feedback } }) => {
		const { userId } = await assertProjectOwner(projectId, "error");
		return withWorkshopLock(projectId, async (project) => {
		const settings = normalizeProjectSettings(project.settings) ?? {};
		const intake = settings.intake ?? null;
		if (!intake) {
			throw new Error("Save the creative brief before generating an outline");
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

		const existingDraft = (project.scriptDraft ?? {}) as ScriptDraft;

		const replicate = new Replicate({ auth: apiKey });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

		const prompt = `You are a creative director creating a scene-by-scene outline for a video. Generate 3-7 scenes with a title and one-line summary each.

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

RECENT WORKSHOP CONTEXT:
${historyBlock || "No prior chat context."}

${feedback ? `USER DIRECTION FOR THIS OUTLINE:\n${feedback}\n` : ""}
Return a short note plus this exact fenced JSON block:

\`\`\`outline
[{"title": "Scene title", "summary": "One-line description"}]
\`\`\``;

		try {
			const chunks: string[] = [];
			for await (const event of replicate.stream("anthropic/claude-4.5-haiku", {
				input: { prompt, max_tokens: 2048, temperature: 0.6 },
				signal: controller.signal,
			})) {
				chunks.push(String(event));
			}

			const assistantContent = chunks.join("").trim();
			if (!assistantContent) {
				throw new Error("AI returned an empty outline — please try again");
			}

			const parsed = parseLlmJson(
				assistantContent,
				OutlineArraySchema,
				"generateOutline",
			);

			const nextDraft: ScriptDraft = {
				...existingDraft,
				outline: parsed,
				stage: "outline",
			};

			await db
				.update(projects)
				.set({ scriptDraft: nextDraft })
				.where(eq(projects.id, projectId));

			return { content: assistantContent };
		} finally {
			clearTimeout(timeout);
		}
		});
	});

export const generateShots = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string; feedback?: string }) => ({
		projectId: data.projectId,
		feedback: data.feedback?.trim() || undefined,
	}))
	.handler(async ({ data: { projectId, feedback } }) => {
		const { userId } = await assertProjectOwner(projectId, "error");
		return withWorkshopLock(projectId, async (project) => {
		const settings = normalizeProjectSettings(project.settings) ?? {};
		const intake = settings.intake ?? null;

		const existingDraft = (project.scriptDraft ?? {}) as ScriptDraft;
		const outlineList = existingDraft.outline;
		if (!outlineList || outlineList.length === 0) {
			throw new Error("Generate an outline before breaking down into shots");
		}

		const apiKey = await getUserApiKey(userId);
		const replicate = new Replicate({ auth: apiKey });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

		const outlineBlock = outlineList
			.map((s, i) => `${i + 1}. ${s.title}: ${s.summary}`)
			.join("\n");

		const targetDuration = intake?.targetDurationSec ?? 300;
		// Suggest a shot count range based on duration — avg 5-8 seconds per shot
		const minShots = Math.max(3, Math.floor(targetDuration / 10));
		const maxShots = Math.max(minShots + 5, Math.ceil(targetDuration / 4));

		const prompt = `You are a cinematographer creating a shot list for a video.

PROJECT:
- Name: ${project.name}
- Target duration: ${targetDuration} seconds
- Visual style: ${intake?.style?.join(", ") ?? "Not specified"}
- Mood / tone: ${intake?.mood?.join(", ") ?? "Not specified"}
- Setting: ${intake?.setting?.join(", ") ?? "Not specified"}

OUTLINE (narrative structure, not shot boundaries):
${outlineBlock}

${feedback ? `USER DIRECTION:\n${feedback}\n` : ""}
TASK:
- Generate a flat, chronological shot list for the ENTIRE video. The outline is narrative context only — do NOT subdivide each outline entry into its own shots. Think of shots as cinematic beats that flow through the story, not chunks of scenes.
- Total shot count should be around ${minShots} to ${maxShots} shots, sized to fit the ${targetDuration}-second duration.
- Each shot must be VISUALLY DISTINCT from every other shot — different framing, different subject, different action, different composition. NEVER describe the same view twice. If two shots would look similar, merge them or cut one.
- Each shot must specify: shotType ("talking" or "visual"), shotSize (exactly one of: "extreme-wide", "wide", "medium", "close-up", "extreme-close-up", "insert"), durationSec (integer from 1 to 10, no decimals), and a detailed visual description.
- Shot descriptions should be self-contained, production-ready, and specific enough for a camera operator to frame without additional context. Include environment, subject, lighting, composition, action, and camera movement.
- Vary shot sizes across the list — don't use all wides or all close-ups. A good sequence alternates framing to create rhythm.
- The sum of all durationSec values should roughly equal the target duration.

SCHEMA CONSTRAINTS (must follow exactly):
- shotType: exactly "talking" or "visual"
- shotSize: exactly one of "extreme-wide", "wide", "medium", "close-up", "extreme-close-up", "insert"
- durationSec: integer from 1 to 10 (no decimals, no values above 10)

Return only this fenced JSON block with a flat array of shots in playback order:

\`\`\`shots
[
  {"description": "Detailed shot description...", "shotType": "visual", "shotSize": "wide", "durationSec": 8}
]
\`\`\``;

		try {
			const chunks: string[] = [];
			for await (const event of replicate.stream("anthropic/claude-4.5-haiku", {
				input: { prompt, max_tokens: 4096, temperature: 0.5 },
				signal: controller.signal,
			})) {
				chunks.push(String(event));
			}

			const assistantContent = chunks.join("").trim();
			if (!assistantContent) {
				throw new Error("AI returned an empty response — please try again");
			}

			const parsed = parseLlmJson(
				assistantContent,
				ShotDraftArraySchema,
				"generateShots",
			);

			const nextDraft: ScriptDraft = {
				...existingDraft,
				shots: parsed,
				stage: "shots",
			};

			let cleanup: { assetKeys: string[]; transitionKeys: string[] } = {
				assetKeys: [],
				transitionKeys: [],
			};

			await db.transaction(async (tx) => {
				cleanup = await upsertShotRowsInTx(tx, projectId, parsed);
				await tx
					.update(projects)
					.set({ scriptDraft: nextDraft, scriptStatus: "done" })
					.where(eq(projects.id, projectId));
			});

			await cleanupStorageKeys([
				...cleanup.assetKeys,
				...cleanup.transitionKeys,
			]);

			return { content: assistantContent };
		} finally {
			clearTimeout(timeout);
		}
		});
	});

export const reviewAndFixShots = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string }) => data)
	.handler(async ({ data: { projectId } }) => {
		const { userId } = await assertProjectOwner(projectId, "error");
		return withWorkshopLock(projectId, async (project) => {
			const existingDraft = (project.scriptDraft ?? {}) as ScriptDraft;
			const shotList = existingDraft.shots;
			if (!shotList || shotList.length === 0) {
				throw new Error("No shots to review");
			}

			const apiKey = await getUserApiKey(userId);
			const replicate = new Replicate({ auth: apiKey });
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

			const shotsBlock = shotList
				.map(
					(shot, idx) =>
						`Shot ${idx + 1}: [${shot.shotSize}, ${shot.shotType}, ${shot.durationSec}s] ${shot.description}`,
				)
				.join("\n\n");

			const prompt = `You are a cinematographer reviewing a shot list for quality and variety.

SHOT LIST TO REVIEW:
${shotsBlock}

REVIEW FOR THESE ISSUES:
1. **Consecutive duplicates**: Two shots back-to-back with the same subject at the same shot size (e.g., two close-ups of an eye). These should be merged or one should be changed to a different framing.
2. **Redundant shots**: Shots that describe essentially the same visual with minor wording differences. Merge them.
3. **Missing variety**: If all shots are the same size (all wides, all close-ups), vary them to create rhythm.
4. **Unclear descriptions**: Shots that are too vague for a camera operator to frame. Add specificity.

RULES:
- Keep the same total shot count if possible, but you MAY merge redundant shots (reducing count) or split one shot into two (increasing count) if it improves the sequence.
- Preserve the narrative flow and timing (total duration should stay roughly the same).
- Each shot must be VISUALLY DISTINCT from adjacent shots.
- Return the corrected shot list, even if no changes were needed.

SCHEMA CONSTRAINTS (must follow exactly):
- shotType: exactly "talking" or "visual"
- shotSize: exactly one of "extreme-wide", "wide", "medium", "close-up", "extreme-close-up", "insert"
- durationSec: integer from 1 to 10 (no decimals, no values above 10)

Return only this fenced JSON block:

\`\`\`shots
[
  {"description": "Detailed shot description...", "shotType": "visual", "shotSize": "wide", "durationSec": 8}
]
\`\`\``;

			try {
				const chunks: string[] = [];
				for await (const event of replicate.stream("anthropic/claude-4.5-haiku", {
					input: { prompt, max_tokens: 4096, temperature: 0.3 },
					signal: controller.signal,
				})) {
					chunks.push(String(event));
				}

				const assistantContent = chunks.join("").trim();
				if (!assistantContent) {
					throw new Error("AI returned empty review — please try again");
				}

				const parsed = parseLlmJson(
					assistantContent,
					ShotDraftArraySchema,
					"reviewAndFixShots",
				);

				const nextDraft: ScriptDraft = {
					...existingDraft,
					shots: parsed,
					stage: "shots",
				};

				let cleanup: { assetKeys: string[]; transitionKeys: string[] } = {
					assetKeys: [],
					transitionKeys: [],
				};

				await db.transaction(async (tx) => {
					cleanup = await upsertShotRowsInTx(tx, projectId, parsed);
					await tx
						.update(projects)
						.set({ scriptDraft: nextDraft, scriptStatus: "done" })
						.where(eq(projects.id, projectId));
				});

				await cleanupStorageKeys([
					...cleanup.assetKeys,
					...cleanup.transitionKeys,
				]);

				return { content: assistantContent, shotCount: parsed.length };
			} finally {
				clearTimeout(timeout);
			}
		});
	});

export const generateImagePrompts = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string }) => data)
	.handler(async ({ data: { projectId } }) => {
		const { userId } = await assertProjectOwner(projectId, "error");
		return withWorkshopLock(projectId, async (project) => {
		const settings = normalizeProjectSettings(project.settings) ?? {};
		const intake = settings.intake ?? null;

		const existingDraft = (project.scriptDraft ?? {}) as ScriptDraft;
		const outlineList = existingDraft.outline;
		const shotList = existingDraft.shots;
		if (!outlineList || outlineList.length === 0) {
			throw new Error("Generate an outline before creating image prompts");
		}
		if (!shotList || shotList.length === 0) {
			throw new Error("Break outline into shots before creating image prompts");
		}

		const apiKey = await getUserApiKey(userId);
		const replicate = new Replicate({ auth: apiKey });
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

		const shotsBlock = shotList
			.map(
				(shot, shotIdx) =>
					`Shot ${shotIdx} (shotIndex: ${shotIdx}): [${shot.shotSize}, ${shot.shotType}] ${shot.description}`,
			)
			.join("\n");

		const prompt = `Generate a detailed image generation prompt for each shot. Each prompt should be a standalone visual description suitable for an AI image generator like Flux or Stable Diffusion.

PROJECT STYLE:
- Visual style: ${intake?.style?.join(", ") ?? "Not specified"}
- Mood / tone: ${intake?.mood?.join(", ") ?? "Not specified"}
- Setting: ${intake?.setting?.join(", ") ?? "Not specified"}

SHOTS:
${shotsBlock}

Return only this fenced JSON block:

\`\`\`prompts
[{"shotIndex": 0, "prompt": "Detailed image prompt..."}]
\`\`\`

RULES:
- Generate exactly one entry per shot, matching the shotIndex values shown above.
- Each prompt must be a self-contained visual description including framing (the shot size like wide, close-up, etc.), environment, subject, lighting, mood, color palette, and style.
- Do NOT include camera movement, motion, or action — describe only the static visual at a single frozen moment in time. The image represents the key frame of the shot.
- Do not reference other shots.`;

		try {
			const chunks: string[] = [];
			for await (const event of replicate.stream("anthropic/claude-4.5-haiku", {
				input: { prompt, max_tokens: 4096, temperature: 0.5 },
				signal: controller.signal,
			})) {
				chunks.push(String(event));
			}

			const assistantContent = chunks.join("").trim();
			if (!assistantContent) {
				throw new Error("AI returned empty image prompts — please try again");
			}

			const parsed = parseLlmJson(
				assistantContent,
				ImagePromptArraySchema,
				"generateImagePrompts",
			);

			const nextDraft: ScriptDraft = {
				...existingDraft,
				imagePrompts: parsed,
				stage: "prompts",
			};

			// Update DB shot rows with the new image prompts. Match by order
			// (shotIndex 0 -> order 1). This is non-destructive — we only
			// update the imagePrompt column on each shot.
			const projectShots = await db.query.shots.findMany({
				where: and(eq(shots.projectId, projectId), isNull(shots.deletedAt)),
				orderBy: asc(shots.order),
			});

			await db.transaction(async (tx) => {
				for (const promptEntry of parsed) {
					const targetShot = projectShots[promptEntry.shotIndex];
					if (!targetShot) continue;
					await tx
						.update(shots)
						.set({ imagePrompt: promptEntry.prompt })
						.where(eq(shots.id, targetShot.id));
				}
				await tx
					.update(projects)
					.set({ scriptDraft: nextDraft })
					.where(eq(projects.id, projectId));
			});

			return { content: assistantContent };
		} finally {
			clearTimeout(timeout);
		}
		});
	});

export const resetWorkshop = createServerFn({ method: "POST" })
	.inputValidator((projectId: string) => projectId)
	.handler(async ({ data: projectId }) => {
		await assertProjectOwner(projectId, "error");
		return withWorkshopLock(projectId, async (project) => {
		const currentSettings = normalizeProjectSettings(project.settings);

		// Collect R2 keys BEFORE the transaction so cleanup runs safely after commit
		const resetAssets = await db
			.select({ storageKey: assets.storageKey })
			.from(assets)
			.where(and(eq(assets.projectId, projectId), isNull(assets.deletedAt)));

		const resetAssetKeys: string[] = resetAssets
			.map((a) => a.storageKey)
			.filter((k): k is string => Boolean(k));

		const resetShotIds = (
			await db
				.select({ id: shots.id })
				.from(shots)
				.where(and(eq(shots.projectId, projectId), isNull(shots.deletedAt)))
		).map((r) => r.id);

		const resetTransitionKeys: string[] = [];
		if (resetShotIds.length > 0) {
			const tvRows = await db
				.select({ storageKey: transitionVideos.storageKey })
				.from(transitionVideos)
				.where(
					and(
						or(
							inArray(transitionVideos.fromShotId, resetShotIds),
							inArray(transitionVideos.toShotId, resetShotIds),
						),
						isNull(transitionVideos.deletedAt),
					),
				);
			for (const tv of tvRows) {
				if (tv.storageKey) resetTransitionKeys.push(tv.storageKey);
			}
		}

		await db.transaction(async (tx) => {
			const now = new Date();

			// Soft-delete shots directly by projectId
			const existingShotIds = (
				await tx
					.select({ id: shots.id })
					.from(shots)
					.where(and(eq(shots.projectId, projectId), isNull(shots.deletedAt)))
			).map((r) => r.id);

			await tx
				.update(shots)
				.set({ deletedAt: now })
				.where(and(eq(shots.projectId, projectId), isNull(shots.deletedAt)));

			// Soft-delete assets by projectId
			await tx
				.update(assets)
				.set({ deletedAt: now })
				.where(and(eq(assets.projectId, projectId), isNull(assets.deletedAt)));

			// Soft-delete transition videos referencing those shots
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

			// messages table has no deletedAt column — hard delete is intentional
			await tx.delete(messages).where(eq(messages.projectId, projectId));

			await tx
				.update(projects)
				.set({
					scriptStatus: "idle",
					directorPrompt: "",
					scriptRaw: null,
					scriptJobId: null,
					scriptDraft: null,
					settings: currentSettings
						? {
								intake: currentSettings.intake,
								characters: currentSettings.characters,
								locations: currentSettings.locations,
							}
						: null,
				})
				.where(eq(projects.id, projectId));
		});

		// R2 cleanup AFTER transaction commits — safe to delete now
		await cleanupStorageKeys([...resetAssetKeys, ...resetTransitionKeys]);
		});
	});



