import "dotenv/config";

import Replicate from "replicate";

const prompt = `You are generating a motion prompt for a transition video between two consecutive shots.

Shot A (start): Wide shot of a five-year-old girl in earth-tone dress standing at a forest edge, clutching a small stuffed animal, positioned between warm domestic tones (soft beige mist behind her) and the forest ahead. Towering stylized trees with round, almost face-like trunks in soft sage and dusty purple create the scene. Oversized mushrooms in cream and blush scattered across the mossy ground like stepping stones. Golden volumetric light rays filter through the canopy in thick, palpable shafts, creating warm glowing pockets against deep cool shadows. Her expression shows a mix of worry and brave determination. Soft wind animation rustles foliage gently. Calm meditative mood, stylized 3D animation, tactile textures on tree bark and mushroom caps catching light.

Shot B (end): Medium shot of the five-year-old girl in profile, captured from roughly waist-up, as she takes a tentative first step deeper into the forest. Towering round-trunked trees in sage and purple loom larger on either side. Thick golden volumetric light rays rake across her frame, rim-lighting her hair and profile with warm glow. Her stuffed animal is pressed against her chest. Oversized mushrooms visible at ground level. Her expression shows focused determination with wide, watchful eyes. Leaves drift through the light rays with gentle wind animation. The forest environment is noticeably denser than the previous shot, with cooler purples deepening in the tree trunks. Stylized 3D animation with tactile moss and bark textures. Contemplative, slightly vulnerable mood.

Return this exact structure with concrete visual text:
[Motion]: ...
[Camera]: ...
[Style]: ...`;

const images = [
	"https://pub-54a57f4f61ea43ad939c5275f944be36.r2.dev/projects/21b5ce3e-9264-47cd-bcc9-bd1614876ea1/scenes/5ab5a738-9aae-4650-aced-88dc2f1857f7/shots/654b3284-5bad-442a-909a-145b8c156479/images/ccb17146-69ad-4f27-b3a6-e22758bf8c55/image-1.png",
	"https://pub-54a57f4f61ea43ad939c5275f944be36.r2.dev/projects/21b5ce3e-9264-47cd-bcc9-bd1614876ea1/scenes/5ab5a738-9aae-4650-aced-88dc2f1857f7/shots/73aeb91d-e9e9-42f0-a67c-89d692565a83/images/f72e8637-8fff-4fc5-bd1d-6a8a600288e3/image-1.png",
];

async function runVariant(name: string, input: Record<string, unknown>) {
	const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
	let chunkCount = 0;
	let output = "";

	for await (const event of replicate.stream("google/gemini-2.5-flash", {
		input,
	})) {
		chunkCount += 1;
		output += String(event);
	}

	console.log(
		JSON.stringify(
			{
				name,
				chunkCount,
				outputLength: output.trim().length,
				preview: output.trim().slice(0, 240),
			},
			null,
			2,
		),
	);
}

async function main() {
	await runVariant("with_images", {
		images,
		prompt,
		system_instruction:
			"You are an expert prompt writer for modern video generation models like Kling.",
		max_output_tokens: 8192,
		dynamic_thinking: false,
		thinking_budget: 0,
		temperature: 0.7,
	});

	await runVariant("text_only", {
		prompt,
		system_instruction:
			"You are an expert prompt writer for modern video generation models like Kling.",
		max_output_tokens: 8192,
		dynamic_thinking: false,
		thinking_budget: 0,
		temperature: 0.7,
	});
}

main().catch((error) => {
	console.error(error);
	process.exitCode = 1;
});
