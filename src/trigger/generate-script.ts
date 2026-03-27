import { task } from "@trigger.dev/sdk";
import { and, eq, isNull } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { projects, scenes, users } from "@/db/schema";
import { decryptUserApiKey } from "@/lib/encryption.server";

interface GenerateScriptPayload {
	projectId: string;
}

interface ParsedScene {
	title: string;
	description: string;
}

const SYSTEM_PROMPT = `You are a cinematic scene director. Given a Director Prompt describing a video concept, 
break it into exactly 3 to 5 scenes. Each scene is a distinct visual moment in the video.

Respond with ONLY valid JSON — no markdown, no explanation, nothing else. The format must be:
{
  "scenes": [
    { "title": "Short scene title (max 8 words)", "description": "Detailed visual description for image generation (2-4 sentences). Be specific about lighting, camera angle, mood, subjects, and environment." },
    ...
  ]
}

Rules:
- 3–5 scenes, no more, no less
- Each description must stand alone as an image generation prompt
- Do not reference other scenes or use words like "then", "next", "continuing"
- Focus on concrete visuals, not abstract concepts`;

function parseScenes(rawOutput: string): ParsedScene[] {
	// Strip any markdown code fences the model might add
	const cleaned = rawOutput.replace(/```(?:json)?/gi, "").trim();

	let parsed: { scenes: ParsedScene[] };
	try {
		parsed = JSON.parse(cleaned);
	} catch {
		// Try to extract JSON from the middle of the response
		const match = cleaned.match(/\{[\s\S]*\}/);
		if (!match) throw new Error("LLM did not return parseable JSON");
		parsed = JSON.parse(match[0]);
	}

	if (!Array.isArray(parsed.scenes) || parsed.scenes.length < 3) {
		throw new Error(`Expected 3–5 scenes, got ${parsed.scenes?.length ?? 0}`);
	}

	return parsed.scenes.slice(0, 5).map((s) => ({
		title: String(s.title ?? "").trim(),
		description: String(s.description ?? "").trim(),
	}));
}

export const generateScript = task({
	id: "generate-script",
	queue: {
		name: "script-generation",
		concurrencyLimit: 5,
	},
	retry: {
		maxAttempts: 3,
		factor: 2,
		minTimeoutInMs: 1000,
		maxTimeoutInMs: 30000,
	},

	run: async (payload: GenerateScriptPayload) => {
		const { projectId } = payload;

		// --- 1. Load project ---
		const project = await db.query.projects.findFirst({
			where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
		});
		if (!project) throw new Error(`Project ${projectId} not found`);

		// --- 2. Load user + decrypt API key ---
		const user = await db.query.users.findFirst({
			where: eq(users.id, project.userId),
		});
		if (!user?.providerKeyEnc || !user?.providerKeyDek) {
			throw new Error("No Replicate API key found for user");
		}
		const apiKey = decryptUserApiKey(user.providerKeyEnc, user.providerKeyDek);

		// --- 3. Call Replicate LLM (Claude 4.5 Haiku via streaming) ---
		const replicate = new Replicate({ auth: apiKey });

		const chunks: string[] = [];
		for await (const event of replicate.stream("anthropic/claude-4.5-haiku", {
			input: {
				prompt: `${SYSTEM_PROMPT}\n\nDirector Prompt: ${project.directorPrompt}`,
				max_tokens: 1024,
				temperature: 0.7,
			},
		})) {
			chunks.push(String(event));
		}
		const rawText = chunks.join("");

		// --- 4. Save raw output ---
		await db
			.update(projects)
			.set({ scriptRaw: rawText })
			.where(eq(projects.id, projectId));

		// --- 5. Parse scenes ---
		const parsedScenes = parseScenes(rawText);

		// --- 6. Insert scene rows (soft-delete any from a prior attempt first) ---
		// Use transaction to prevent race conditions with concurrent runs
		await db.transaction(async (tx) => {
			await tx
				.update(scenes)
				.set({ deletedAt: new Date() })
				.where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)));
			await tx.insert(scenes).values(
				parsedScenes.map((scene, i) => ({
					projectId,
					order: (i + 1) * 1.0,
					title: scene.title || null,
					description: scene.description,
					stage: "script" as const,
				})),
			);
		});

		// --- 7. Mark project done ---
		await db
			.update(projects)
			.set({ scriptStatus: "done", scriptJobId: null })
			.where(eq(projects.id, projectId));

		return { scenesCreated: parsedScenes.length };
	},

	// On failure: mark project as errored so the UI can show a retry button
	onFailure: async ({ payload, error }) => {
		await db
			.update(projects)
			.set({ scriptStatus: "error", scriptJobId: null })
			.where(eq(projects.id, payload.projectId));

		console.error(
			`generate-script failed for project ${payload.projectId}:`,
			error,
		);
	},
});
