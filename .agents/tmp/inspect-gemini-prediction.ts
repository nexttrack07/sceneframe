import "dotenv/config";

import Replicate from "replicate";
import { getPrecisionPromptInstructions } from "@/features/projects/prompt-strategy";

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
- Be specific about direction, pacing, and camera behavior when relevant
- The motion should feel like a natural continuation from Shot A into Shot B
- Preserve shared continuity anchors from both shots while describing the concrete state change between them
- Focus on what changes and moves, but do not omit the subject/environment details needed to keep the transition grounded
- Explicitly bridge the actual selected start frame and selected end frame
- Describe a movement path the video model can clearly execute, not just a mood or abstract transition
- If Shot A and Shot B differ in framing, explain how the camera bridges that framing shift
- Do not use vague filler like "cinematic", "beautiful", or "smoothly transitions" unless you specify the exact visual mechanism
${TRANSITION_MOVEMENT_RULES}
${getPrecisionPromptInstructions({ type: "transition", medium: "transition" })}

Transition context:
PROJECT CONTEXT:
Project concept: Three little kids are wandering around in the forest and discover something unexpected.
Visual style: Stylized 3D animation
Mood: Dreamlike, slightly eerie, wonder-filled
Audio direction: Narration + background music

Scene: A five-year-old girl stands at the forest's edge, clutching a small stuffed animal as her anchor. Behind her, the familiar world of home fades into soft, misty greens and purples; ahead, towering stylized trees with round, almost face-like trunks create a playful sense of being watched—part magical, part slightly unsettling. Oversized mushrooms in cream and blush tones dot the forest floor like stepping stones, while golden volumetric light filters through the canopy in thick, almost palpable rays, creating pockets of warm glow among cool shadow. The girl's expression flickers between worry (furrowed brow, tight grip on her toy) and brave determination (set jaw, forward lean). She takes a tentative, bouncy first step into the woodland, and the camera gently tracks alongside her as her small silhouette moves deeper into the towering trees, the soft wind-swayed foliage and dancing light rays emphasizing both her vulnerability and her quiet courage.

Shot A (start): Wide shot of a five-year-old girl in earth-tone dress standing at a forest edge, clutching a small stuffed animal, positioned between warm domestic tones (soft beige mist behind her) and the forest ahead. Towering stylized trees with round, almost face-like trunks in soft sage and dusty purple create the scene. Oversized mushrooms in cream and blush scattered across the mossy ground like stepping stones. Golden volumetric light rays filter through the canopy in thick, palpable shafts, creating warm glowing pockets against deep cool shadows. Her expression shows a mix of worry and brave determination. Soft wind animation rustles foliage gently. Calm meditative mood, stylized 3D animation, tactile textures on tree bark and mushroom caps catching light.

Shot B (end): Medium shot of the five-year-old girl in profile, captured from roughly waist-up, as she takes a tentative first step deeper into the forest. Towering round-trunked trees in sage and purple loom larger on either side. Thick golden volumetric light rays rake across her frame, rim-lighting her hair and profile with warm glow. Her stuffed animal is pressed against her chest. Oversized mushrooms visible at ground level. Her expression shows focused determination with wide, watchful eyes. Leaves drift through the light rays with gentle wind animation. The forest environment is noticeably denser than the previous shot, with cooler purples deepening in the tree trunks. Stylized 3D animation with tactile moss and bark textures. Contemplative, slightly vulnerable mood.

Selected start frame image:
Selected start frame image is attached as a Gemini image input. Use the visible subject placement, framing, environment, lighting, and any motion cues from that image directly. Shot description: Wide shot of a five-year-old girl in earth-tone dress standing at a forest edge, clutching a small stuffed animal, positioned between warm domestic tones (soft beige mist behind her) and the forest ahead. Towering stylized trees with round, almost face-like trunks in soft sage and dusty purple create the scene. Oversized mushrooms in cream and blush scattered across the mossy ground like stepping stones. Golden volumetric light rays filter through the canopy in thick, palpable shafts, creating warm glowing pockets against deep cool shadows. Her expression shows a mix of worry and brave determination. Soft wind animation rustles foliage gently. Calm meditative mood, stylized 3D animation, tactile textures on tree bark and mushroom caps catching light.

Selected end frame image:
Selected end frame image is attached as a Gemini image input. Use the visible subject placement, framing, environment, lighting, and any motion cues from that image directly. Shot description: Medium shot of the five-year-old girl in profile, captured from roughly waist-up, as she takes a tentative first step deeper into the forest. Towering round-trunked trees in sage and purple loom larger on either side. Thick golden volumetric light rays rake across her frame, rim-lighting her hair and profile with warm glow. Her stuffed animal is pressed against her chest. Oversized mushrooms visible at ground level. Her expression shows focused determination with wide, watchful eyes. Leaves drift through the light rays with gentle wind animation. The forest environment is noticeably denser than the previous shot, with cooler purples deepening in the tree trunks. Stylized 3D animation with tactile moss and bark textures. Contemplative, slightly vulnerable mood.

Return ONLY the final prompt, nothing else.`;

const images = [
	"https://pub-54a57f4f61ea43ad939c5275f944be36.r2.dev/projects/21b5ce3e-9264-47cd-bcc9-bd1614876ea1/scenes/5ab5a738-9aae-4650-aced-88dc2f1857f7/shots/654b3284-5bad-442a-909a-145b8c156479/images/ccb17146-69ad-4f27-b3a6-e22758bf8c55/image-1.png",
	"https://pub-54a57f4f61ea43ad939c5275f944be36.r2.dev/projects/21b5ce3e-9264-47cd-bcc9-bd1614876ea1/scenes/5ab5a738-9aae-4650-aced-88dc2f1857f7/shots/73aeb91d-e9e9-42f0-a67c-89d692565a83/images/f72e8637-8fff-4fc5-bd1d-6a8a600288e3/image-1.png",
];

async function main() {
	const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
	let streamOutput = "";
	let streamChunkCount = 0;
	for await (const event of replicate.stream("google/gemini-2.5-flash", {
		input: {
			images,
			prompt,
			system_instruction:
				"You are an expert prompt writer for modern video generation models like Kling.",
			max_output_tokens: 8192,
			dynamic_thinking: false,
			thinking_budget: 0,
			temperature: 0.7,
		},
	})) {
		streamChunkCount += 1;
		streamOutput += String(event);
	}

	const prediction = await replicate.predictions.create({
		model: "google/gemini-2.5-flash",
		input: {
			images,
			prompt,
			system_instruction:
				"You are an expert prompt writer for modern video generation models like Kling.",
			max_output_tokens: 8192,
			dynamic_thinking: false,
			thinking_budget: 0,
			temperature: 0.7,
		},
	});

	let result = prediction;
	while (
		result.status === "starting" ||
		result.status === "processing"
	) {
		await new Promise((resolve) => setTimeout(resolve, 1000));
		result = await replicate.predictions.get(result.id);
	}

	console.log(
		JSON.stringify(
			{
				streamChunkCount,
				streamOutputLength: streamOutput.trim().length,
				streamPreview: streamOutput.trim().slice(0, 500),
				status: result.status,
				error: result.error,
				logs: result.logs,
				outputType: Array.isArray(result.output)
					? `array(${result.output.length})`
					: typeof result.output,
				outputPreview: Array.isArray(result.output)
					? result.output.join("").trim().slice(0, 500)
					: String(result.output ?? "").slice(0, 500),
			},
			null,
			2,
		),
	);
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
