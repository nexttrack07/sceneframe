import { eq } from "drizzle-orm";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import { decryptUserApiKey } from "@/lib/encryption.server";
import type {
	IntakeAnswers,
	ShotPlanEntry,
	ShotSize,
	ShotType,
} from "./project-types";

export async function getUserApiKey(userId: string) {
	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
	});
	if (!user?.providerKeyEnc || !user?.providerKeyDek) {
		throw new Error("No Replicate API key found. Update it in onboarding.");
	}
	return decryptUserApiKey(user.providerKeyEnc, user.providerKeyDek);
}

export function parseGeneratedMediaUrls(output: unknown): string[] {
	const urls: string[] = [];
	const walk = (value: unknown) => {
		if (!value) return;
		if (typeof value === "string") {
			if (value.startsWith("http://") || value.startsWith("https://"))
				urls.push(value);
			return;
		}
		if (Array.isArray(value)) {
			value.forEach(walk);
			return;
		}
		if (typeof value === "object") {
			const record = value as Record<string, unknown>;
			if (typeof record.toString === "function") {
				const stringValue = String(record.toString());
				if (
					stringValue.startsWith("http://") ||
					stringValue.startsWith("https://")
				) {
					urls.push(stringValue);
				}
			}
			if (typeof record.url === "function") {
				try {
					const maybeUrl = (record.url as () => unknown).call(record);
					walk(maybeUrl);
				} catch {
					// Ignore malformed file-like objects and keep walking.
				}
			}
			walk(record.url);
			walk(record.output);
			walk(record.images);
			walk(record.video);
			walk(record.videos);
			walk(record.data);
			walk(record.image);
			walk(record.files);
			walk(record.file);
			walk(record.urls);
		}
	};
	walk(output);
	return Array.from(new Set(urls));
}

export function summarizeGenerationOutput(output: unknown): string {
	if (output == null) return "null";
	if (typeof output === "string") return "string";
	if (Array.isArray(output)) return `array(${output.length})`;
	if (typeof output === "object") {
		return `object keys=[${Object.keys(output as Record<string, unknown>).join(", ")}]`;
	}
	return typeof output;
}

export function buildLanePrompt(
	sceneDescription: string,
	lane: "start" | "end",
	intake: IntakeAnswers | undefined,
): string {
	const laneDirection =
		lane === "start"
			? "Generate the START frame of this scene (opening moment)."
			: "Generate the END frame of this scene (closing moment).";

	const intakeHints = intake
		? [
				intake.purpose ? `Video purpose: ${intake.purpose}` : null,
				intake.style?.length
					? `Visual style: ${intake.style.join(", ")}`
					: null,
				intake.mood?.length ? `Mood: ${intake.mood.join(", ")}` : null,
				intake.setting?.length ? `Setting: ${intake.setting.join(", ")}` : null,
				intake.audioMode ? `Audio direction: ${intake.audioMode}` : null,
				intake.audience ? `Target audience: ${intake.audience}` : null,
				intake.workingTitle ? `Working title: ${intake.workingTitle}` : null,
				intake.thumbnailPromise
					? `Thumbnail promise: ${intake.thumbnailPromise}`
					: null,
			]
				.filter(Boolean)
				.join("\n")
		: "No structured creative brief provided.";

	return `${laneDirection}

Scene description:
${sceneDescription}

Creative brief hints:
${intakeHints}

Write a rich text-to-image prompt for a single still image.
Describe in this order: framing and composition, subject(s) and their exact state/action/expression, environment and setting details, lighting and what it is doing, color palette and atmosphere, and style-specific rendering details from the creative brief.
Make the prompt concrete and visually complete enough that the image model does not need to invent missing layout or subject details.
This is a frozen image, not a video prompt: do not describe camera movement, animation, transitions, or temporal progression.`;
}

export function buildSystemPrompt(
	projectName: string,
	intake?: IntakeAnswers | null,
) {
	const intakeBlock = intake
		? `
CREATIVE BRIEF (from structured intake):
- Channel preset: ${intake.channelPreset}
- Purpose: ${intake.purpose}
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
`
		: "";

	const firstResponseRule = intake
		? `- The user has already provided a structured creative brief. Your FIRST response must summarize their brief back to them in a friendly, conversational way and confirm you understand their vision. Do NOT propose scenes yet in your first response — wait for the user to confirm or adjust.`
		: `- If the user hasn't described their concept yet, ask what the video is about.`;

	return `You are a creative director helping a user develop scenes for a short video project called "${projectName}".

Your job is to understand what the user wants and help them craft 3-8 distinct visual scenes.
${intakeBlock}
CONVERSATION RULES:
${firstResponseRule}
- In your first meaningful response after brief confirmation, propose an explicit opening hook that is optimized for the first 3-10 seconds.
- Ask clarifying questions about mood, tone, audience, visual style, and audio approach — but keep it conversational, not interrogative. Ask ONLY ONE question per message, never two.
${intake ? `- The scenes you propose MUST sum to approximately ${intake.targetDurationSec ?? 300} seconds total. For example, a ${intake.targetDurationSec ?? 300}s video with 6 scenes needs each scene averaging ${Math.round((intake.targetDurationSec ?? 300) / 6)}s. Do NOT default to 10-15s per scene regardless of video length.` : ""}
- At the end of every response (except when proposing scenes), include a suggestions block with 2-4 concrete quick-reply options the user can pick from:

\`\`\`suggestions
["Option A", "Option B", "Option C"]
\`\`\`

- Make the options specific to your question, not generic. They should reflect real choices the user might want.
- When you have enough context and the user is happy, propose a scene breakdown.
- When proposing scenes, include a JSON block in your response with this exact format:

\`\`\`scenes
[
  {
    "title": "Short title",
    "description": "Detailed visual description for image generation (2-4 sentences). Be specific about lighting, camera angle, mood, subjects, and environment.",
    "durationSec": 6,
    "beat": "Hook / Problem / Proof / Payoff / CTA",
    "hookRole": "hook|body|cta"
  },
  ...
]
\`\`\`

- After proposing scenes, ask the user if they want to adjust anything.
- Each scene description must stand alone as an image generation prompt — no references to other scenes.
- Keep your conversational text brief and friendly. The scene descriptions should be the detailed part.`;
}

export function qualityPresetToSteps(
	quality: "fast" | "balanced" | "high",
): number {
	if (quality === "fast") return 20;
	if (quality === "high") return 40;
	return 30;
}

export function buildShotBreakdownPrompt(
	scenes: { title: string; description: string; durationSec?: number }[],
	targetDurationSec: number,
	intake?: IntakeAnswers | null,
): string {
	const sceneList = scenes
		.map((s, i) => {
			const dur =
				s.durationSec ??
				Math.round(targetDurationSec / Math.max(scenes.length, 1));
			return `Scene ${i}: "${s.title || `Scene ${i + 1}`}" (${dur}s) — ${s.description}`;
		})
		.join("\n");

	return `You are a cinematographer breaking scenes into sequential keyframes for a video production pipeline.

CREATIVE BRIEF CONTEXT:
- Visual style: ${intake?.style?.join(", ") ?? "Not specified"}
- Mood / tone: ${intake?.mood?.join(", ") ?? "Not specified"}
- Audio direction: ${intake?.audioMode ?? "Not specified"}

IMPORTANT CONTEXT — HOW THIS PIPELINE WORKS:
Each shot you create becomes a still image first. Then the image from shot N and the image from shot N+1 are used together as start/end frames for a transition video. That means adjacent shots must work as implicit image pairs even though they are stored as individual shots in the current app.

Your goal is not to make isolated standalone b-roll. Your goal is to design a short visual progression inside each scene: shot 1 establishes an initial state, shot 2 advances that state, shot 3 pushes it further or lands the scene beat. The change between shot N and shot N+1 must be specific enough that a transition model can visibly animate from one image to the next.

Adjacent shots must preserve enough shared visual anchors to transition smoothly (same subject, environment, key object, or directional motion), while changing one or two clear state variables such as intensity, subject pose, weather force, camera distance, or focus target.

Each shot must still be a strong standalone frame, but it should feel like the next image in a coherent sequence. Light should DO something (rake, rim, silhouette, bloom). Include tactile texture and style-specific visual detail.

SCENES TO BREAK DOWN:
${sceneList}

SHOT SIZE OPTIONS (choose what serves the story beat; no forced rotation rule):
- extreme-wide: landscape establishing, subject small in frame
- wide: full scene, subject in environment
- medium: waist-up, balance of context and detail
- close-up: face or key object, emotion and detail
- extreme-close-up: single detail, texture, intensity
- insert: cutaway to specific object or action

EXAMPLES OF EXCEPTIONAL IMAGE PROMPTS:
- "Wide, lone figure silhouetted against floor-to-ceiling window, city lights blooming in rain, reflection doubling the solitude"
- "Extreme close-up, weathered fingers hovering over key mid-press, desk lamp rim-lighting knuckles, moment of decision"
- "Medium, woman mid-laugh coffee cup suspended, golden hour raking across steam and flyaway hair, bokeh of strangers"
- "Insert, phone screen glowing with notification, thumb hovering, face reflected in glass, blue light on skin"

NEVER USE: beautiful, stunning, amazing, high quality, 4K, highly detailed, cinematic, professional

CRITICAL RULES:
- shotType is either "talking" (person speaking to camera) or "visual" (b-roll, graphics, environment).
- shotSize is REQUIRED and must be one of the six values above.
- Choose shotSize based on what best serves the story and continuity. If two consecutive shots should both be wide, use two wide shots.
- If consecutive shots use the same shotSize, make the subject state, environmental force, lighting, or focus target clearly evolve so the sequence still progresses.
- Do NOT write the final image-generation prompt in this stage. This stage only creates shot descriptions and continuity structure. A second prompt-engineering pass will turn each shot description into an image prompt.
- Each shot description must describe a distinct state in a connected visual progression, not a disconnected new setup.
- For every scene, choose a clear progression axis and make it visible across shots. Examples:
  - calm wind -> stronger wind -> violent sand gusts against the same dunes and vegetation
  - distant silhouette -> clearer subject form -> close detail reveal
  - intact object -> first sign of stress -> dramatic close-up of the critical detail
- Keep continuity anchors stable enough that a transition video between shot N and shot N+1 can plausibly animate from one image to the next.
- Do not make consecutive shots near-duplicates. The change between shots must be concrete and visible, but continuous.
- Do not make consecutive shots so different that the transition video would need to hallucinate an entirely new environment or subject.
- Match the visual style implied by the scene and upstream creative brief language. Weave style into the description naturally instead of appending generic tags.
- If the audio direction includes narration, make sure shot descriptions leave room for narration-driven story beats; if it is music-only or no-audio, make the visual progression carry the scene more strongly without leaning on spoken explanation.
- sceneIndex is zero-based matching the scene list above.
- durationSec is REQUIRED for every shot (integer, min 2, max 10).
- The sum of shot durationSec values within each scene should closely match that scene's durationSec.

Return a JSON block with this exact format:

\`\`\`json
{
  "shots": [
    {
      "sceneIndex": 0,
      "shotSize": "wide",
      "shotType": "visual",
      "durationSec": 5,
      "description": "Detailed description of this keyframe as a still image in a sequential shot progression. Mention the continuity anchor it shares with adjacent shots and the specific visual state it represents."
    }
  ]
}
\`\`\`

CRITICAL: Each scene's shots must read as connected implicit shot pairs: shot 1 should transition naturally into shot 2, shot 2 into shot 3, and so on. The sequence must show an escalating or evolving state, not unrelated coverage and not duplicate descriptions with tiny wording changes.

Return ONLY the JSON block.`;
}

export function parseShotBreakdownResponse(
	response: string,
	sceneCount: number,
): ShotPlanEntry[] | null {
	try {
		const parseCandidate = (candidate: string) => {
			try {
				return JSON.parse(candidate.trim()) as unknown;
			} catch {
				return null;
			}
		};

		const extractBalancedJson = (text: string) => {
			const objectStart = text.indexOf("{");
			const arrayStart = text.indexOf("[");
			const start =
				objectStart === -1
					? arrayStart
					: arrayStart === -1
						? objectStart
						: Math.min(objectStart, arrayStart);
			if (start === -1) return null;

			const opening = text[start];
			const closing = opening === "{" ? "}" : "]";
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

				if (char === opening) {
					depth += 1;
					continue;
				}

				if (char === closing) {
					depth -= 1;
					if (depth === 0) {
						return text.slice(start, index + 1);
					}
				}
			}

			return null;
		};

		const fenceMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
		const fencedBody = fenceMatch?.[1]?.trim();
		const parsed =
			(fencedBody ? parseCandidate(fencedBody) : null) ??
			parseCandidate(response) ??
			parseCandidate(extractBalancedJson(fencedBody ?? response) ?? "");

		const rawShots = Array.isArray(parsed)
			? parsed
			: parsed && typeof parsed === "object"
				? (parsed as { shots?: unknown }).shots
				: null;
		if (!Array.isArray(rawShots) || rawShots.length === 0) return null;

		const validShotTypes: ShotType[] = ["talking", "visual"];
		const validShotSizes: ShotSize[] = [
			"extreme-wide",
			"wide",
			"medium",
			"close-up",
			"extreme-close-up",
			"insert",
		];

		const result: ShotPlanEntry[] = rawShots
			.filter(
				(s: unknown): s is Record<string, unknown> =>
					typeof s === "object" && s !== null,
			)
			.filter((s) => {
				const idx = Number(s.sceneIndex);
				return Number.isFinite(idx) && idx >= 0 && idx < sceneCount;
			})
			.filter(
				(s) =>
					typeof s.description === "string" &&
					(s.description as string).trim().length > 0,
			)
			.map((s) => {
				const rawType = String(s.shotType ?? "visual");
				const shotType: ShotType = validShotTypes.includes(rawType as ShotType)
					? (rawType as ShotType)
					: "visual";
				const rawSize = String(s.shotSize ?? "medium");
				const shotSize: ShotSize = validShotSizes.includes(rawSize as ShotSize)
					? (rawSize as ShotSize)
					: "medium";
				const rawDuration = Number(s.durationSec ?? 5);
				const durationSec =
					rawDuration >= 1 && rawDuration <= 10 ? rawDuration : 5;
				return {
					sceneIndex: Number(s.sceneIndex),
					description: (s.description as string).trim(),
					shotType,
					shotSize,
					durationSec,
				};
			});

		return result.length > 0 ? result : null;
	} catch {
		return null;
	}
}

export function buildShotImagePromptPrompt(
	scene: { title: string; description: string; durationSec?: number },
	sceneShots: ShotPlanEntry[],
	intake?: IntakeAnswers | null,
): string {
	const shotList = sceneShots
		.map(
			(shot, index) => `Shot ${index + 1}
- Shot size: ${shot.shotSize}
- Shot type: ${shot.shotType}
- Duration: ${shot.durationSec}s
- Shot description: ${shot.description}`,
		)
		.join("\n\n");

	return `You are a visual prompt engineer writing production-ready text-to-image prompts from approved shot descriptions.

CREATIVE BRIEF CONTEXT:
- Visual style: ${intake?.style?.join(", ") ?? "Not specified"}
- Mood / tone: ${intake?.mood?.join(", ") ?? "Not specified"}
- Setting: ${intake?.setting?.join(", ") ?? "Not specified"}
- Audio direction: ${intake?.audioMode ?? "Not specified"}
- Project concept: ${intake?.concept ?? "Not specified"}

SCENE CONTEXT:
- Title: ${scene.title || "Untitled scene"}
- Description: ${scene.description}

SHOT DESCRIPTIONS TO EXPAND:
${shotList}

TASK:
Write one detailed still-image prompt for each shot, in the same order.

Rules:
- Each image prompt must be more specific and production-ready than the shot description. Do not merely paraphrase the shot description.
- Write each prompt as a single frozen-frame text-to-image prompt, not a video prompt.
- Describe in this order: framing/composition, subject(s) and exact pose/action/expression, environment and key objects, lighting and what it is doing, color palette and atmosphere, style-specific rendering details from the creative brief.
- Make continuity anchors explicit enough that adjacent shot images still feel connected.
- Do not use camera movement verbs or temporal progression language like "then", "starts", "begins", "camera pans", "dolly", or "zoom".
- Do not use filler quality tags like beautiful, stunning, amazing, high quality, 4K, masterpiece, professional.
- Match the chosen visual style naturally in the description language.

Return ONLY a JSON object in this exact shape:
{
  "imagePrompts": [
    {
      "shotNumber": 1,
      "imagePrompt": "Detailed text-to-image prompt for shot 1"
    }
  ]
}`;
}

export function parseShotImagePromptResponse(
	response: string,
	expectedCount: number,
): string[] | null {
	try {
		const parseCandidate = (candidate: string) => {
			try {
				return JSON.parse(candidate.trim()) as unknown;
			} catch {
				return null;
			}
		};

		const extractBalancedJsonObject = (text: string) => {
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

		const fenceMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
		const fencedBody = fenceMatch?.[1]?.trim();
		const parsed =
			(fencedBody ? parseCandidate(fencedBody) : null) ??
			parseCandidate(response) ??
			parseCandidate(extractBalancedJsonObject(fencedBody ?? response) ?? "");

		const rawPrompts =
			parsed && typeof parsed === "object"
				? (parsed as { imagePrompts?: unknown }).imagePrompts
				: null;
		if (!Array.isArray(rawPrompts) || rawPrompts.length === 0) return null;

		const prompts = rawPrompts
			.slice(0, expectedCount)
			.map((entry) =>
				entry &&
				typeof entry === "object" &&
				typeof (entry as { imagePrompt?: unknown }).imagePrompt === "string"
					? (entry as { imagePrompt: string }).imagePrompt.trim() || null
					: null,
			);

		if (prompts.length !== expectedCount || prompts.some((prompt) => !prompt)) {
			return null;
		}

		return prompts as string[];
	} catch {
		return null;
	}
}
