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

Write a concise prompt for a single still image.
Keep it specific but compact, focused on the subject, environment, framing, and lighting.
This is a frozen image, not a video prompt: do not describe camera movement, animation, transitions, or how the scene changes over time.`;
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
- Ask clarifying questions about mood, tone, audience, and visual style — but keep it conversational, not interrogative. Ask ONLY ONE question per message, never two.
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
): string {
	const sceneList = scenes
		.map((s, i) => {
			const dur =
				s.durationSec ??
				Math.round(targetDurationSec / Math.max(scenes.length, 1));
			return `Scene ${i}: "${s.title || `Scene ${i + 1}`}" (${dur}s) — ${s.description}`;
		})
		.join("\n");

	return `You are an award-winning cinematographer breaking scenes into visually distinct shots.

Each shot is a SEQUENTIAL KEYFRAME in the same scene, designed to become a still image first and then connect naturally to the next shot through a transition video.

Your goal is not to make isolated standalone b-roll. Your goal is to design a short visual progression inside each scene: shot 1 establishes an initial state, shot 2 advances that state, shot 3 pushes it further or lands the scene beat.

Adjacent shots must preserve enough shared visual anchors to transition smoothly (same subject, environment, key object, or directional motion), while changing one or two clear state variables such as intensity, subject pose, weather force, camera distance, or focus target.

Each shot must still capture a decisive instant, but it should feel like the next frame in a coherent sequence. Light should DO something (rake, rim, silhouette, bloom). Include one tactile texture detail.

SCENES TO BREAK DOWN:
${sceneList}

SHOT SIZE OPTIONS (adjacent shots MUST use different sizes):
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
- Adjacent shots must not reuse the same shotSize.
- Each imagePrompt must be 15-25 words and describe: shot size, specific subject moment, light doing something, and one texture or atmosphere detail.
- Each shot description must describe a distinct state in a connected visual progression, not a disconnected new setup.
- For every scene, choose a clear progression axis and make it visible across shots. Examples:
  - calm wind -> stronger wind -> violent sand gusts against the same dunes and vegetation
  - distant silhouette -> clearer subject form -> close detail reveal
  - intact object -> first sign of stress -> dramatic close-up of the critical detail
- Keep continuity anchors stable enough that a transition video between shot N and shot N+1 can plausibly animate from one image to the next.
- Do not make consecutive shots near-duplicates. The change between shots must be concrete and visible, but continuous.
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
      "description": "Brief shot description",
      "imagePrompt": "15-25 words: [size], [subject in specific moment], [light doing something], [texture/atmosphere detail]"
    }
  ]
}
\`\`\`

CRITICAL: Each scene's shots must read as a connected visual sequence with escalating or evolving state, not as unrelated coverage and not as duplicate descriptions with tiny wording changes. Never repeat the same shot size twice in a row.

Return ONLY the JSON block.`;
}

export function parseShotBreakdownResponse(
	response: string,
	sceneCount: number,
): ShotPlanEntry[] | null {
	try {
		// Extract JSON from fenced code block
		const fenceMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
		const jsonStr = fenceMatch ? fenceMatch[1] : response;

		const parsed = JSON.parse(jsonStr.trim());
		const rawShots = Array.isArray(parsed) ? parsed : parsed?.shots;
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
				const imagePrompt =
					typeof s.imagePrompt === "string" && s.imagePrompt.trim().length > 0
						? s.imagePrompt.trim()
						: null;

				return {
					sceneIndex: Number(s.sceneIndex),
					description: imagePrompt ?? (s.description as string).trim(),
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
