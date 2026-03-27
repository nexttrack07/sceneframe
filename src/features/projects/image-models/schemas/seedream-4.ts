export const seedream4Schema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		image_input: {
			type: "array",
			title: "Image Input",
			description: "Reference images for image generation or editing.",
		},
		size: {
			type: "string",
			title: "Size",
			enum: ["1K", "2K", "4K"],
			default: "2K",
		},
		aspect_ratio: {
			type: "string",
			title: "Aspect Ratio",
			enum: ["1:1", "16:9", "9:16", "4:5", "5:4", "3:2", "2:3"],
			default: "1:1",
		},
		enhance_prompt: {
			type: "boolean",
			title: "Enhance Prompt",
			default: true,
		},
	},
} as const;
