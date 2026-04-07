"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, transitionVideos } from "@/db/schema";
import { assertShotOwner } from "@/lib/assert-project-owner.server";
import { getUserApiKey } from "./image-generation-helpers.server";
import { normalizeProjectSettings } from "./project-normalize";
import type { PromptAssetTypeSelection } from "./project-types";
import {
	buildSceneVisualBrief,
	critiqueAndRewritePrompt,
} from "./prompt-quality.server";
import {
	getPrecisionPromptInstructions,
	resolvePromptAssetType,
} from "./prompt-strategy";

const REPLICATE_TIMEOUT_MS = 60_000;
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
}) {
	const startFrame =
		args.fromFrameVisual?.trim() || `Start frame: ${args.fromShotDescription}`;
	const endFrame =
		args.toFrameVisual?.trim() || `End frame: ${args.toShotDescription}`;

	return `[Motion]: Carry the viewer from ${args.fromShotDescription.trim()} into ${args.toShotDescription.trim()}, preserving the shared subject and environment while making the visual state change clearly readable. Anchor the transition to these frame cues: ${startFrame} ${endFrame}

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

async function saveTransitionPromptDraft(args: {
	sceneId: string;
	fromShotId: string;
	toShotId: string;
	fromImageId: string | null;
	toImageId: string | null;
	prompt: string;
}) {
	if (!args.fromImageId || !args.toImageId || !args.prompt.trim()) {
		return;
	}

	await db.insert(transitionVideos).values({
		sceneId: args.sceneId,
		fromShotId: args.fromShotId,
		toShotId: args.toShotId,
		fromImageId: args.fromImageId,
		toImageId: args.toImageId,
		prompt: args.prompt,
		status: "done",
		stale: false,
		isSelected: false,
	});
}

export async function generateAndSaveTransitionPromptForPair({
	fromShotId,
	toShotId,
	useProjectContext = true,
	usePrevShotContext = true,
	assetTypeOverride,
}: {
	fromShotId: string;
	toShotId: string;
	useProjectContext?: boolean;
	usePrevShotContext?: boolean;
	assetTypeOverride?: PromptAssetTypeSelection;
}) {
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
	const resolvedAssetType = resolvePromptAssetType({
		override: assetTypeOverride,
		text: `${fromShot.description}\n${toShot.description}`,
		medium: "transition",
	});
	const intake = settings?.intake;

	const projectContextBlock = useProjectContext
		? [
				intake?.concept ? `Project concept: ${intake.concept}` : null,
				intake?.purpose ? `Purpose: ${intake.purpose}` : null,
				intake?.style?.length
					? `Visual style: ${intake.style.join(", ")}`
					: null,
				intake?.mood?.length ? `Mood: ${intake.mood.join(", ")}` : null,
				intake?.audioMode ? `Audio direction: ${intake.audioMode}` : null,
			]
				.filter(Boolean)
				.join("\n")
		: null;
	const replicate = new Replicate({ auth: apiKey });
	const [
		{
			fromFrameImageId,
			fromFrameImageUrl,
			fromFrameVisual,
			toFrameImageId,
			toFrameImageUrl,
			toFrameVisual,
		},
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
			sceneTitle: scene.title,
			sceneDescription: scene.description,
			projectContext: projectContextBlock,
			shotContext: `Start shot: ${fromShot.description}\nEnd shot: ${toShot.description}`,
		}),
	]);

	const sceneCtx =
		usePrevShotContext && scene.description
			? `Scene: ${scene.description}`
			: null;

	const contextBlock = [
		useProjectContext
			? `PROJECT CONTEXT:\n${projectContextBlock || `Project: ${project.name}`}`
			: null,
		sceneCtx,
		`Shot A (start): ${fromShot.description}`,
		`Shot B (end): ${toShot.description}`,
		sceneVisualBrief ? `Scene visual brief:\n${sceneVisualBrief}` : null,
		fromFrameVisual ? `Selected start frame image:\n${fromFrameVisual}` : null,
		toFrameVisual ? `Selected end frame image:\n${toFrameVisual}` : null,
	]
		.filter(Boolean)
		.join("\n\n");

	const systemPrompt = `You are an expert prompt writer for modern video generation models like Kling.
You are generating a motion prompt for a transition video between two consecutive shots.

IMPORTANT CONTEXT — HOW THIS PIPELINE WORKS:
The current app stores individual shots, but this transition prompt effectively treats Shot A's selected image and Shot B's selected image as one implicit image pair. Your job is to describe the exact motion bridge between those two frames.

The video starts on Shot A and ends on Shot B. Describe the motion and camera behavior that naturally bridges those two frames.

Use this exact lightweight structure:

[Motion]: Describe how the composition, subject state, and environment evolve from Shot A to Shot B in 1-2 specific sentences. Name what moves, how strongly it moves, and what visible state change the viewer should see.

[Camera]: Describe the camera behavior in 1 specific sentence. A real camera move is required unless the user explicitly asked for a locked shot.

[Style]: Describe mood, lighting continuity, atmosphere, and style consistency in 1 sentence.

Rules:
- Present tense
- Use the audio direction as timing context: if narration is present, keep the visual bridge paced so it can sit under spoken lines; if music-only or silent, make the motion transition self-explanatory.
- Be specific about direction, pacing, and camera behavior when relevant
- The motion should feel like a natural continuation from Shot A into Shot B
- Preserve shared continuity anchors from both shots while describing the concrete state change between them
- Focus on what changes and moves, but do not omit the subject/environment details needed to keep the transition grounded
- Explicitly bridge the actual selected start frame and selected end frame
- Describe a movement path the video model can clearly execute, not just a mood or abstract transition
- If Shot A and Shot B differ in framing, explain how the camera bridges that framing shift
- Do not use vague filler like "cinematic", "beautiful", or "smoothly transitions" unless you specify the exact visual mechanism
${TRANSITION_MOVEMENT_RULES}
${getPrecisionPromptInstructions({ type: resolvedAssetType, medium: "transition" })}
${!useProjectContext ? "- Base the motion prompt only on the shot descriptions provided" : ""}

Transition context:
${contextBlock}

Return ONLY the final prompt, nothing else.`;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS);

	try {
		const modelOutput = await runTransitionPromptModel({
			replicate,
			input: {
				images: [fromFrameImageUrl, toFrameImageUrl].filter(
					(url): url is string => Boolean(url),
				),
				prompt: systemPrompt,
				system_instruction:
					"You are an expert prompt writer for modern video generation models like Kling.",
				max_output_tokens: TRANSITION_PROMPT_MAX_OUTPUT_TOKENS,
				dynamic_thinking: false,
				thinking_budget: 0,
				temperature: 0.7,
			},
			signal: controller.signal,
		});
		const generatedPrompt =
			modelOutput ||
			buildFallbackTransitionPrompt({
				fromShotDescription: fromShot.description,
				toShotDescription: toShot.description,
				sceneDescription: scene.description,
				fromFrameVisual,
				toFrameVisual,
			});
		if (!modelOutput) {
			console.warn("[TransitionPrompt] generate-empty-response:fallback", {
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
			prompt: generatedPrompt,
			context: [
				sceneVisualBrief ? `Scene visual brief:\n${sceneVisualBrief}` : null,
				fromFrameVisual ? `Selected start frame:\n${fromFrameVisual}` : null,
				toFrameVisual ? `Selected end frame:\n${toFrameVisual}` : null,
			]
				.filter(Boolean)
				.join("\n\n"),
		});

		await saveTransitionPromptDraft({
			sceneId: scene.id,
			fromShotId,
			toShotId,
			fromImageId: fromFrameImageId,
			toImageId: toFrameImageId,
			prompt: finalPrompt,
		});

		return { prompt: finalPrompt, assetType: resolvedAssetType };
	} finally {
		clearTimeout(timeout);
	}
}
