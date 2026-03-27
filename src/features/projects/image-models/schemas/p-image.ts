export const pImageSchema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		aspect_ratio: {
			type: "string",
			title: "Aspect Ratio",
			enum: ["1:1", "16:9", "9:16", "4:5", "5:4", "3:2", "2:3"],
			default: "1:1",
		},
		output_format: {
			type: "string",
			title: "Output Format",
			enum: ["png", "jpg", "webp"],
			default: "png",
		},
		speed: {
			type: "string",
			title: "Speed",
			enum: ["fast", "balanced", "quality"],
			default: "balanced",
		},
		enhance_prompt: {
			type: "boolean",
			title: "Enhance Prompt",
			default: true,
		},
	},
} as const;
