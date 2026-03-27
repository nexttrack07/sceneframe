export const flux2MaxSchema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		input_images: {
			type: "array",
			title: "Input Images",
			description: "Reference images for image-to-image generation.",
		},
		aspect_ratio: {
			type: "string",
			title: "Aspect Ratio",
			enum: ["1:1", "16:9", "9:16", "4:5", "5:4", "3:2", "2:3"],
			default: "1:1",
		},
		resolution: {
			type: "string",
			title: "Resolution",
			enum: ["match_input_image", "0.5 MP", "1 MP", "2 MP", "4 MP"],
			default: "1 MP",
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
		safety_tolerance: {
			type: "integer",
			title: "Safety Tolerance",
			default: 2,
			minimum: 0,
			maximum: 6,
		},
	},
} as const;
