import "dotenv/config";

import { and, asc, eq, isNull } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { assets, projects, scenes, shots } from "@/db/schema";
import {
	normalizeProjectSettings,
} from "@/features/projects/project-normalize";
import {
	getPrecisionPromptInstructions,
	resolvePromptAssetType,
} from "@/features/projects/prompt-strategy";

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

async function main() {
	const projectScenes = await db.query.scenes.findMany({
		where: isNull(scenes.deletedAt),
		orderBy: asc(scenes.order),
		limit: 20,
	});

	const pairs: Array<{
		project: typeof projects.$inferSelect;
		scene: typeof scenes.$inferSelect;
		fromShot: typeof shots.$inferSelect;
		toShot: typeof shots.$inferSelect;
		fromImageUrl: string;
		toImageUrl: string;
	}> = [];

	for (const scene of projectScenes) {
		const sceneShots = await db.query.shots.findMany({
			where: and(eq(shots.sceneId, scene.id), isNull(shots.deletedAt)),
			orderBy: asc(shots.order),
		});

		for (let index = 0; index < sceneShots.length - 1; index += 1) {
			const fromShot = sceneShots[index];
			const toShot = sceneShots[index + 1];
			const [fromImage, toImage] = await Promise.all([
				db.query.assets.findFirst({
					where: and(
						eq(assets.shotId, fromShot.id),
						eq(assets.isSelected, true),
						eq(assets.status, "done"),
						isNull(assets.deletedAt),
					),
				}),
				db.query.assets.findFirst({
					where: and(
						eq(assets.shotId, toShot.id),
						eq(assets.isSelected, true),
						eq(assets.status, "done"),
						isNull(assets.deletedAt),
					),
				}),
			]);

			if (fromImage?.url && toImage?.url) {
				const project = await db.query.projects.findFirst({
					where: eq(projects.id, scene.projectId),
				});
				if (!project) continue;
				pairs.push({
					project,
					scene,
					fromShot,
					toShot,
					fromImageUrl: fromImage.url,
					toImageUrl: toImage.url,
				});
			}
		}

		if (pairs.length >= 8) break;
	}

	if (pairs.length === 0) {
		console.log("NO_PAIR_WITH_SELECTED_IMAGES");
		return;
	}

	const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
	for (const pair of pairs) {
		const settings = normalizeProjectSettings(pair.project.settings);
		const intake = settings?.intake;
		const projectContextBlock = [
			intake?.concept ? `Project concept: ${intake.concept}` : null,
			intake?.purpose ? `Purpose: ${intake.purpose}` : null,
			intake?.style?.length
				? `Visual style: ${intake.style.join(", ")}`
				: null,
			intake?.mood?.length ? `Mood: ${intake.mood.join(", ")}` : null,
			intake?.audioMode ? `Audio direction: ${intake.audioMode}` : null,
		]
			.filter(Boolean)
			.join("\n");
		const resolvedAssetType = resolvePromptAssetType({
			override: "auto",
			text: `${pair.fromShot.description}\n${pair.toShot.description}`,
			medium: "transition",
		});
		const contextBlock = [
			`PROJECT CONTEXT:\n${projectContextBlock || `Project: ${pair.project.name}`}`,
			`Scene: ${pair.scene.description}`,
			`Shot A (start): ${pair.fromShot.description}`,
			`Shot B (end): ${pair.toShot.description}`,
			`Selected start frame image:\nSelected start frame image is attached as a Gemini image input. Use the visible subject placement, framing, environment, lighting, and any motion cues from that image directly. Shot description: ${pair.fromShot.description}`,
			`Selected end frame image:\nSelected end frame image is attached as a Gemini image input. Use the visible subject placement, framing, environment, lighting, and any motion cues from that image directly. Shot description: ${pair.toShot.description}`,
		].join("\n\n");
		const prompt = `You are an expert prompt writer for modern video generation models like Kling.
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

Transition context:
${contextBlock}

Return ONLY the final prompt, nothing else.`;

		let output = "";
		let chunkCount = 0;

		try {
			for await (const event of replicate.stream("google/gemini-2.5-flash", {
				input: {
					images: [pair.fromImageUrl, pair.toImageUrl],
					prompt,
					system_instruction:
						"You are an expert prompt writer for modern video generation models like Kling.",
					max_output_tokens: 8192,
					dynamic_thinking: false,
					thinking_budget: 0,
					temperature: 0.7,
				},
			})) {
				chunkCount += 1;
				output += String(event);
			}

			console.log(
				JSON.stringify(
					{
						project: pair.project.name,
						sceneId: pair.scene.id,
						fromShotId: pair.fromShot.id,
						toShotId: pair.toShot.id,
						chunkCount,
						outputLength: output.trim().length,
						preview: output.trim().slice(0, 240),
					},
					null,
					2,
				),
			);
		} catch (error) {
			console.log(
				JSON.stringify(
					{
						project: pair.project.name,
						sceneId: pair.scene.id,
						fromShotId: pair.fromShot.id,
						toShotId: pair.toShot.id,
						error: error instanceof Error ? error.message : String(error),
					},
					null,
					2,
				),
			);
		}
	}
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await db.$client.end();
	});
