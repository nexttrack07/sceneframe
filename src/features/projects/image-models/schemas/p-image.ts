export const pImageSchema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		aspect_ratio: {
			type: "string",
			title: "Aspect Ratio",
			enum: ["1:1", "16:9", "9:16", "4:5", "5:4", "3:2", "2:3", "4:3", "3:4", "21:9", "9:21", "custom"],
			default: "16:9",
		},
		prompt_upsampling: {
			type: "boolean",
			title: "Prompt Upsampling",
			description: "Upsample the prompt with an LLM for better results.",
			default: false,
		},
		seed: {
			type: "integer",
			title: "Seed",
			description: "Random seed for reproducible generation.",
		},
	},
} as const;

/**
 * P-image-edit schema - used when reference images are provided.
 * The model automatically routes to p-image-edit when images are present.
 */
export const pImageEditSchema = {
	type: "object",
	title: "Input",
	required: ["prompt", "images"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		images: {
			type: "array",
			title: "Images",
			description: "Reference images for editing. The first image is the main image to edit.",
			default: [],
		},
		aspect_ratio: {
			type: "string",
			title: "Aspect Ratio",
			enum: ["match_input_image", "1:1", "16:9", "9:16", "4:5", "5:4", "3:2", "2:3", "4:3", "3:4"],
			default: "match_input_image",
		},
		turbo: {
			type: "boolean",
			title: "Turbo",
			description: "Faster generation with optimizations. Turn off for complex edits.",
			default: true,
		},
		seed: {
			type: "integer",
			title: "Seed",
			description: "Random seed for reproducible generation.",
		},
	},
} as const;
