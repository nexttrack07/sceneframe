import type Replicate from "replicate";
import type { PromptAssetType } from "./project-types";

const PROMPT_QUALITY_MODEL = "openai/gpt-4o-mini";
const PROMPT_QUALITY_TIMEOUT_MS = 60_000;

async function streamPromptModel(args: {
	replicate: Replicate;
	systemPrompt: string;
	prompt: string;
	temperature?: number;
	maxCompletionTokens?: number;
	timeoutMs?: number;
}) {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		args.timeoutMs ?? PROMPT_QUALITY_TIMEOUT_MS,
	);

	try {
		const chunks: string[] = [];
		for await (const event of args.replicate.stream(PROMPT_QUALITY_MODEL, {
			input: {
				prompt: args.prompt,
				system_prompt: args.systemPrompt,
				max_completion_tokens: args.maxCompletionTokens ?? 700,
				temperature: args.temperature ?? 0.4,
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

export async function buildSceneVisualBrief(args: {
	replicate: Replicate;
	medium: "image" | "video" | "transition";
	projectName: string;
	sceneTitle?: string | null;
	sceneDescription: string;
	projectContext?: string | null;
	shotContext?: string | null;
}) {
	const result = await streamPromptModel({
		replicate: args.replicate,
		systemPrompt:
			"You write concise scene visual briefs for prompt generation. Return only short bullet lines.",
		temperature: 0.35,
		maxCompletionTokens: 350,
		prompt: `Create a scene visual brief for ${args.medium} prompt generation.

Project: ${args.projectName}
Scene title: ${args.sceneTitle?.trim() || "Untitled scene"}
Scene description:
${args.sceneDescription}

${args.projectContext ? `Project context:\n${args.projectContext}\n` : ""}${
	args.shotContext ? `Shot context:\n${args.shotContext}\n` : ""
}
Return exactly 4 short bullets:
- Visual spine: dominant visual idea of the scene
- Light behavior: what light is doing
- Framing language: preferred framing range or compositional tendency
- Texture motif: tactile atmosphere/material detail

Keep each bullet concrete and compact. No intro or outro.`,
	});

	return result;
}

export async function critiqueAndRewritePrompt(args: {
	replicate: Replicate;
	medium: "image" | "video" | "transition";
	assetType: PromptAssetType;
	prompt: string;
	context?: string | null;
}) {
	const structureRule =
		args.medium === "image"
			? "Return a natural-language still-image prompt. Do not add labels."
			: "Preserve the existing labeled structure if present, including section headings like [Subject], [Motion], [Camera], [Style].";
	const mediumSpecificGoals =
		args.medium === "transition"
			? `- make the start frame, end frame, and the bridge between them explicit
- ensure the camera movement is concrete, directional, and visually noticeable
- replace static or weak camera language with a clear move like push-in, pan, tilt, drift, crane, orbit, or pull-back unless a locked shot is explicitly intended`
			: args.medium === "video"
				? "- ensure motion is sustained, directional, and not just implied"
				: "- ensure the image describes a decisive still frame, not a vague concept";

	const result = await streamPromptModel({
		replicate: args.replicate,
		systemPrompt:
			"You are a ruthless prompt critic. Rewrite prompts to maximize specificity, clarity, and visual precision while preserving intent.",
		temperature: 0.3,
		maxCompletionTokens: 900,
		prompt: `Review and rewrite this ${args.medium} prompt for asset type "${args.assetType}".

Goals:
- remove vague filler language
- make the subject, composition, and exact moment more concrete
- make lighting behavior explicit
- preserve continuity with the provided context
- keep the prompt compact but highly specific
- if text, labels, callouts, diagrams, or graphic elements are intended, make them explicit
- if motion is intended, make the motion and temporal change explicit
${mediumSpecificGoals}

Rules:
- do not change the core intent
- do not add generic hype words
- do not return commentary or explanations
- ${structureRule}

${args.context ? `Context:\n${args.context}\n` : ""}Prompt to refine:
${args.prompt}

Return ONLY the final rewritten prompt.`,
	});

	return result || args.prompt;
}
