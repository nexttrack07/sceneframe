export const nanoBanana2Schema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: {
			type: "string",
			title: "Prompt",
			"x-order": 0,
			description: "A text description of the image you want to generate",
		},
		resolution: {
			enum: ["1K", "2K", "4K"],
			type: "string",
			title: "resolution",
			description:
				"Resolution of the generated image. Higher resolutions take longer to generate.",
			default: "1K",
			"x-order": 3,
		},
		image_input: {
			type: "array",
			items: {
				type: "string",
				format: "uri",
			},
			title: "Image Input",
			default: [],
			"x-order": 1,
			description:
				"Input images to transform or use as reference (supports up to 14 images)",
		},
		aspect_ratio: {
			enum: [
				"match_input_image",
				"1:1",
				"1:4",
				"1:8",
				"2:3",
				"3:2",
				"3:4",
				"4:1",
				"4:3",
				"4:5",
				"5:4",
				"8:1",
				"9:16",
				"16:9",
				"21:9",
			],
			type: "string",
			title: "aspect_ratio",
			description: "Aspect ratio of the generated image",
			default: "match_input_image",
			"x-order": 2,
		},
		image_search: {
			type: "boolean",
			title: "Image Search",
			default: false,
			"x-order": 5,
			description:
				"Use Google Image Search grounding to find web images as visual context for generation. When enabled, web search is also used automatically.",
		},
		google_search: {
			type: "boolean",
			title: "Google Search",
			default: false,
			"x-order": 4,
			description:
				"Use Google Web Search grounding to generate images based on real-time information (e.g. weather, sports scores, recent events).",
		},
		output_format: {
			enum: ["jpg", "png"],
			type: "string",
			title: "output_format",
			description: "Format of the output image",
			default: "jpg",
			"x-order": 6,
		},
	},
} as const;
