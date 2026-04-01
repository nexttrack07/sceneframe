import type {
	PromptAssetType,
	PromptAssetTypeSelection,
} from "./project-types";

export function getPromptAssetTypeLabel(type: PromptAssetTypeSelection) {
	switch (type) {
		case "auto":
			return "Auto";
		case "cinematic":
			return "Cinematic";
		case "documentary":
			return "Documentary";
		case "infographic":
			return "Infographic";
		case "text_graphic":
			return "Text Graphic";
		case "talking_head":
			return "Talking Head";
		case "transition":
			return "Transition";
	}
}

export function inferPromptAssetType(args: {
	text: string;
	medium: "image" | "video" | "transition";
}): PromptAssetType {
	const text = args.text.toLowerCase();

	if (args.medium === "transition") {
		return "transition";
	}

	if (
		/\b(infographic|diagram|cutaway|cross-section|labeled|labelled|annotation|callout|arrows|step-by-step|scientific illustration)\b/.test(
			text,
		)
	) {
		return "infographic";
	}

	if (
		/\b(text on screen|headline|title card|caption card|poster|typography|quote graphic|words on screen|exact text|signage)\b/.test(
			text,
		)
	) {
		return "text_graphic";
	}

	if (
		/\b(talking head|to camera|speaking to camera|presenter|host|interview|monologue|piece to camera)\b/.test(
			text,
		)
	) {
		return "talking_head";
	}

	if (
		/\b(explainer|documentary|educational|how it works|demonstration|demonstrates|anatomy|mechanism)\b/.test(
			text,
		)
	) {
		return "documentary";
	}

	return "cinematic";
}

export function resolvePromptAssetType(args: {
	override?: PromptAssetTypeSelection;
	text: string;
	medium: "image" | "video" | "transition";
}) {
	return args.override && args.override !== "auto"
		? args.override
		: inferPromptAssetType({ text: args.text, medium: args.medium });
}

export function getPrecisionPromptInstructions(args: {
	type: PromptAssetType;
	medium: "image" | "video" | "transition";
}) {
	const common = `Precision rules:
- Avoid vague phrases like "illustrated example", "detailed animation", "showing how it works", or "cinematic visual"
- Describe the actual intended output, not a generic category
- Specify the exact visible subject, composition, and important visual elements
- If text, labels, callouts, arrows, or annotations are important, specify their exact wording and placement
- If something should not appear, say so explicitly
- The prompt is the source of truth; do not rely on the generation model to infer missing important details`;

	switch (args.type) {
		case "infographic":
			return `${common}

Specialized rules for infographic/diagram outputs:
- Treat the result as a designed information graphic, not a generic illustration
- Specify exact on-screen text, labels, section headings, arrows, and callouts when relevant
- Specify layout structure such as cutaway, side-by-side comparison, labeled diagram, exploded view, or step sequence
- Specify whether the style should be scientific, editorial, educational, or flat vector
- Explicitly say what should not appear: no extra scenery, no decorative clutter, no random text`;
		case "text_graphic":
			return `${common}

Specialized rules for text-heavy graphic outputs:
- Include the exact text that must appear on screen
- Specify hierarchy: headline, subhead, labels, captions, badges, or side notes
- Specify composition and style so the text feels intentionally designed rather than randomly overlaid`;
		case "talking_head":
			return `${common}

Specialized rules for talking-head outputs:
- Specify presenter framing, eyeline, pose, wardrobe, expression, and background
- Be explicit about whether the speaker addresses camera directly or is observed from the side
- Keep the environment and styling concrete rather than generic`;
		case "documentary":
			return `${common}

Specialized rules for documentary/explainer outputs:
- Prefer concrete educational detail over cinematic abstraction
- If the scene explains a mechanism or concept, specify the exact visual demonstration
- Preserve realism and clarity of the subject matter`;
		case "transition":
			return `${common}

Specialized rules for transition outputs:
- Describe the precise bridge between the start frame and end frame
- Specify what changes in pose, framing, distance, camera movement, and atmosphere
- Do not summarize; describe the exact visual transition path`;
		case "cinematic":
			return `${common}

Specialized rules for cinematic outputs:
- Keep the image or shot visually specific and scene-accurate
- Specify lensing/framing only when useful
- Avoid generic "beautiful cinematic" filler without visual detail`;
	}
}
