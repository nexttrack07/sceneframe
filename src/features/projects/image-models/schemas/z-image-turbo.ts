export const zImageTurboSchema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		width: {
			type: "integer",
			title: "Width",
			default: 1024,
			minimum: 256,
			maximum: 1536,
		},
		height: {
			type: "integer",
			title: "Height",
			default: 1024,
			minimum: 256,
			maximum: 1536,
		},
		num_inference_steps: {
			type: "integer",
			title: "Steps",
			default: 20,
			minimum: 1,
			maximum: 50,
		},
		guidance_scale: {
			type: "number",
			title: "Guidance Scale",
			default: 3,
			minimum: 1,
			maximum: 20,
		},
		output_format: {
			type: "string",
			title: "Output Format",
			enum: ["png", "jpg", "webp"],
			default: "png",
		},
		output_quality: {
			type: "integer",
			title: "Output Quality",
			default: 90,
			minimum: 1,
			maximum: 100,
		},
	},
} as const;
