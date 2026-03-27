export const gptImage15Schema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		input_images: {
			type: "array",
			title: "Input Images",
			description: "Images to edit or use as reference.",
		},
		size: {
			type: "string",
			title: "Size",
			enum: ["1024x1024", "1536x1024", "1024x1536", "auto"],
			default: "auto",
		},
		quality: {
			type: "string",
			title: "Quality",
			enum: ["low", "medium", "high", "auto"],
			default: "auto",
		},
		background: {
			type: "string",
			title: "Background",
			enum: ["auto", "transparent", "opaque"],
			default: "auto",
		},
		output_format: {
			type: "string",
			title: "Output Format",
			enum: ["png", "jpg", "webp"],
			default: "png",
		},
		output_compression: {
			type: "integer",
			title: "Output Compression",
			default: 100,
			minimum: 0,
			maximum: 100,
		},
		moderation: {
			type: "string",
			title: "Moderation",
			enum: ["auto", "low"],
			default: "auto",
		},
		input_fidelity: {
			type: "string",
			title: "Input Fidelity",
			enum: ["low", "high"],
			default: "high",
		},
	},
} as const;
