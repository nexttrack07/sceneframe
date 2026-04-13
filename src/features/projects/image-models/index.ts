import type { ImageDefaults, ImageSettingValue } from "../project-types";
import { flux2FlexSchema } from "./schemas/flux-2-flex";
import { nanoBananaSchema } from "./schemas/nano-banana";
import { pImageSchema } from "./schemas/p-image";

type ImageSettingPrimitive = string | number | boolean;

interface ImageSchemaProperty {
	type?: "string" | "number" | "integer" | "boolean" | "array" | "object";
	title?: string;
	description?: string;
	default?: unknown;
	enum?: readonly ImageSettingPrimitive[];
	minimum?: number;
	maximum?: number;
}

interface ImageSchema {
	type: "object";
	title?: string;
	required?: readonly string[];
	properties: Record<string, ImageSchemaProperty>;
}

export interface ImageModelControlDefinition {
	key: string;
	label: string;
	description?: string;
	type: "select" | "boolean" | "number";
	options?: readonly { label: string; value: string }[];
	min?: number;
	max?: number;
}

/**
 * Provider switch - controls which provider is used for image generation.
 * Set via IMAGE_PROVIDER environment variable: "replicate" or "fal"
 * Defaults to "replicate" for production stability.
 */
function getImageProvider(): "replicate" | "fal" {
	if (typeof process === "undefined") {
		return "replicate";
	}

	const provider = process.env.IMAGE_PROVIDER;
	return provider === "fal" || provider === "replicate"
		? provider
		: "replicate";
}

const IMAGE_PROVIDER = getImageProvider();

/**
 * Replicate execution configuration for image models.
 */
interface ReplicateExecution {
	provider: "replicate";
	/** Replicate model identifier (e.g., "owner/model-name") */
	model: string;
	/** Optional separate model for image-to-image */
	imageToImageModel?: string;
}

/**
 * fal.ai execution configuration for image models.
 */
interface FalExecution {
	provider: "fal";
	/** Endpoint for text-to-image generation */
	textToImage: string;
	/** Endpoint for image-to-image generation (optional, falls back to textToImage) */
	imageToImage?: string;
}

/**
 * Execution configuration for image models.
 * Supports multiple providers for easy migration between services.
 */
export type ImageModelExecution = ReplicateExecution | FalExecution;

export interface ImageModelDefinition {
	id: string;
	label: string;
	provider: string;
	/** Replicate execution config (optional if model is fal-only) */
	replicateExecution?: ReplicateExecution;
	/** fal.ai execution config (optional if model is replicate-only) */
	falExecution?: FalExecution;
	description: string;
	logoText: string;
	logoImageUrl?: string;
	previewImageUrl?: string;
	accentClassName?: string;
	schema: ImageSchema;
	supportsReferenceImages: boolean;
	referenceInputField?:
		| "image_prompt"
		| "image_url"
		| "image_urls"
		| "image_input"
		| "images"
		| "input_images";
	visibleSettings: readonly string[];
	hiddenDefaults?: Record<string, ImageSettingPrimitive>;
}

function titleFromKey(key: string) {
	return key
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function getDefaultForProperty(property: ImageSchemaProperty) {
	if (
		typeof property.default === "string" ||
		typeof property.default === "number" ||
		typeof property.default === "boolean"
	) {
		return property.default;
	}
	if (
		property.enum?.length &&
		(typeof property.enum[0] === "string" ||
			typeof property.enum[0] === "number" ||
			typeof property.enum[0] === "boolean")
	) {
		return property.enum[0];
	}
	if (property.type === "boolean") return false;
	if (property.type === "integer" || property.type === "number") {
		return property.minimum ?? 0;
	}
	return "";
}

function coercePropertyValue(
	property: ImageSchemaProperty | undefined,
	value: unknown,
	fallback: ImageSettingPrimitive,
): ImageSettingPrimitive {
	if (!property) {
		return typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean"
			? value
			: fallback;
	}

	if (property.enum?.length) {
		return property.enum.includes(value as ImageSettingPrimitive)
			? (value as ImageSettingPrimitive)
			: fallback;
	}

	if (property.type === "boolean") {
		return typeof value === "boolean" ? value : fallback;
	}

	if (property.type === "integer" || property.type === "number") {
		if (typeof value !== "number" || Number.isNaN(value)) return fallback;
		if (property.minimum !== undefined && value < property.minimum) {
			return property.minimum;
		}
		if (property.maximum !== undefined && value > property.maximum) {
			return property.maximum;
		}
		return value;
	}

	return typeof value === "string" ? value : fallback;
}

function normalizeLegacyAspectRatio(value: unknown) {
	if (value === "landscape_16_9" || value === "landscape") return "16:9";
	if (value === "portrait_16_9" || value === "portrait") return "9:16";
	if (value === "landscape_4_3") return "4:3";
	if (value === "portrait_4_3") return "3:4";
	if (value === "square_hd" || value === "square") return "1:1";
	return typeof value === "string" ? value : null;
}

const fluxProSchema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		image_prompt: {
			type: "string",
			title: "Image Prompt",
			description: "Reference image used with Flux Redux to guide composition.",
		},
		aspect_ratio: {
			type: "string",
			title: "Aspect Ratio",
			enum: [
				"custom",
				"1:1",
				"16:9",
				"3:2",
				"2:3",
				"4:5",
				"5:4",
				"9:16",
				"3:4",
				"4:3",
			],
			default: "1:1",
		},
		width: {
			type: "integer",
			title: "Width",
			minimum: 256,
			maximum: 1440,
		},
		height: {
			type: "integer",
			title: "Height",
			minimum: 256,
			maximum: 1440,
		},
		output_format: {
			type: "string",
			title: "Output Format",
			enum: ["webp", "jpg", "png"],
			default: "webp",
		},
		output_quality: {
			type: "integer",
			title: "Output Quality",
			default: 80,
			minimum: 0,
			maximum: 100,
		},
		safety_tolerance: {
			type: "integer",
			title: "Safety Tolerance",
			default: 2,
			minimum: 1,
			maximum: 6,
		},
		prompt_upsampling: {
			type: "boolean",
			title: "Prompt Upsampling",
			default: false,
		},
	},
} as const;

const fluxProUltraSchema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		image_prompt: {
			type: "string",
			title: "Image Prompt",
			description: "Reference image used with Flux Redux to guide composition.",
		},
		aspect_ratio: {
			type: "string",
			title: "Aspect Ratio",
			enum: [
				"21:9",
				"16:9",
				"3:2",
				"4:3",
				"5:4",
				"1:1",
				"4:5",
				"3:4",
				"2:3",
				"9:16",
				"9:21",
			],
			default: "1:1",
		},
		raw: {
			type: "boolean",
			title: "Raw",
			description: "Generate less processed, more natural-looking images.",
			default: false,
		},
		output_format: {
			type: "string",
			title: "Output Format",
			enum: ["jpg", "png"],
			default: "jpg",
		},
		safety_tolerance: {
			type: "integer",
			title: "Safety Tolerance",
			default: 2,
			minimum: 1,
			maximum: 6,
		},
		image_prompt_strength: {
			type: "number",
			title: "Image Prompt Strength",
			default: 0.1,
			minimum: 0,
			maximum: 1,
		},
	},
} as const;

const fluxSchnellSchema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		image_size: {
			type: "string",
			title: "Image Size",
			enum: [
				"square_hd",
				"square",
				"portrait_4_3",
				"portrait_16_9",
				"landscape_4_3",
				"landscape_16_9",
			],
			default: "landscape_16_9",
		},
		num_inference_steps: {
			type: "integer",
			title: "Steps",
			default: 4,
			minimum: 1,
			maximum: 12,
		},
		num_images: {
			type: "integer",
			title: "Number of Images",
			default: 1,
			minimum: 1,
			maximum: 4,
		},
		output_format: {
			type: "string",
			title: "Output Format",
			enum: ["jpeg", "png"],
			default: "png",
		},
	},
} as const;

const recraftV3Schema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		image_size: {
			type: "string",
			title: "Image Size",
			enum: [
				"square",
				"square_hd",
				"portrait_4_3",
				"portrait_16_9",
				"landscape_4_3",
				"landscape_16_9",
			],
			default: "landscape_16_9",
		},
		style: {
			type: "string",
			title: "Style",
			enum: [
				"any",
				"realistic_image",
				"digital_illustration",
				"vector_illustration",
				"icon",
			],
			default: "realistic_image",
		},
	},
} as const;

const ideogramV2Schema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		aspect_ratio: {
			type: "string",
			title: "Aspect Ratio",
			enum: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"],
			default: "16:9",
		},
		style_type: {
			type: "string",
			title: "Style",
			enum: ["auto", "general", "realistic", "design", "render_3d", "anime"],
			default: "auto",
		},
		magic_prompt_option: {
			type: "string",
			title: "Magic Prompt",
			enum: ["auto", "on", "off"],
			default: "auto",
		},
	},
} as const;

const sd35LargeSchema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		negative_prompt: { type: "string", title: "Negative Prompt", default: "" },
		image_size: {
			type: "string",
			title: "Image Size",
			enum: [
				"square",
				"square_hd",
				"portrait_4_3",
				"portrait_16_9",
				"landscape_4_3",
				"landscape_16_9",
			],
			default: "landscape_16_9",
		},
		num_inference_steps: {
			type: "integer",
			title: "Steps",
			default: 28,
			minimum: 1,
			maximum: 50,
		},
		guidance_scale: {
			type: "number",
			title: "CFG Scale",
			default: 4.5,
			minimum: 1,
			maximum: 20,
		},
	},
} as const;

const nanoBanana2Schema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		aspect_ratio: {
			type: "string",
			title: "Aspect Ratio",
			enum: [
				"auto",
				"21:9",
				"16:9",
				"3:2",
				"4:3",
				"5:4",
				"1:1",
				"4:5",
				"3:4",
				"2:3",
				"9:16",
				"4:1",
				"1:4",
				"8:1",
				"1:8",
			],
			default: "16:9",
		},
		resolution: {
			type: "string",
			title: "Resolution",
			enum: ["0.5K", "1K", "2K", "4K"],
			default: "1K",
		},
		output_format: {
			type: "string",
			title: "Output Format",
			enum: ["jpeg", "png", "webp"],
			default: "png",
		},
		safety_tolerance: {
			type: "string",
			title: "Safety Tolerance",
			enum: ["1", "2", "3", "4", "5", "6"],
			default: "4",
		},
	},
} as const;

const nanoBananaProSchema = {
	type: "object",
	title: "Input",
	required: ["prompt"],
	properties: {
		prompt: { type: "string", title: "Prompt" },
		aspect_ratio: {
			type: "string",
			title: "Aspect Ratio",
			enum: [
				"auto",
				"21:9",
				"16:9",
				"3:2",
				"4:3",
				"5:4",
				"1:1",
				"4:5",
				"3:4",
				"2:3",
				"9:16",
			],
			default: "16:9",
		},
		resolution: {
			type: "string",
			title: "Resolution",
			enum: ["1K", "2K", "4K"],
			default: "2K",
		},
		output_format: {
			type: "string",
			title: "Output Format",
			enum: ["jpeg", "png", "webp"],
			default: "png",
		},
		safety_tolerance: {
			type: "string",
			title: "Safety Tolerance",
			enum: ["1", "2", "3", "4", "5", "6"],
			default: "4",
		},
	},
} as const;

export const IMAGE_MODELS: readonly ImageModelDefinition[] = [
	{
		id: "fal-ai/flux-pro/v1.1",
		label: "FLUX Pro 1.1",
		provider: "BFL",
		replicateExecution: {
			provider: "replicate",
			model: "black-forest-labs/flux-1.1-pro",
		},
		description:
			"High-quality FLUX Pro model with excellent prompt following and detail.",
		logoText: "F",
		logoImageUrl: "/model-media/bfl-logo.png",
		previewImageUrl: "/model-media/flux-2-pro-cover.jpg",
		accentClassName:
			"bg-[linear-gradient(135deg,#111827_0%,#7c2d12_35%,#f59e0b_65%,#ffedd5_100%)]",
		schema: fluxProSchema,
		supportsReferenceImages: true,
		referenceInputField: "image_prompt",
		visibleSettings: [
			"aspect_ratio",
			"output_format",
			"output_quality",
			"safety_tolerance",
			"prompt_upsampling",
		],
	},
	{
		id: "fal-ai/flux-pro/v1.1-ultra",
		label: "FLUX Pro Ultra",
		provider: "BFL",
		replicateExecution: {
			provider: "replicate",
			model: "black-forest-labs/flux-1.1-pro-ultra",
		},
		description: "Ultra high-resolution FLUX for maximum detail and clarity.",
		logoText: "F",
		logoImageUrl: "/model-media/bfl-logo.png",
		previewImageUrl: "/model-media/flux-2-max-cover.jpg",
		accentClassName:
			"bg-[linear-gradient(135deg,#111827_0%,#3b0764_30%,#c084fc_65%,#f5d0fe_100%)]",
		schema: fluxProUltraSchema,
		supportsReferenceImages: true,
		referenceInputField: "image_prompt",
		visibleSettings: [
			"aspect_ratio",
			"raw",
			"output_format",
			"safety_tolerance",
			"image_prompt_strength",
		],
	},
	{
		id: "fal-ai/flux/dev",
		label: "FLUX 2 Flex",
		provider: "BFL",
		replicateExecution: {
			provider: "replicate",
			model: "black-forest-labs/flux-2-flex",
		},
		description:
			"Flexible FLUX 2 image generation and editing with strong prompt control.",
		logoText: "F",
		logoImageUrl: "/model-media/bfl-logo.png",
		previewImageUrl: "/model-media/flux-2-flex-cover.webp",
		accentClassName:
			"bg-[linear-gradient(135deg,#0f172a_0%,#115e59_30%,#34d399_62%,#d1fae5_100%)]",
		schema: flux2FlexSchema,
		supportsReferenceImages: true,
		referenceInputField: "input_images",
		visibleSettings: [
			"aspect_ratio",
			"resolution",
			"steps",
			"guidance",
			"prompt_upsampling",
		],
	},
	{
		id: "fal-ai/flux/schnell",
		label: "FLUX Schnell",
		provider: "BFL",
		replicateExecution: {
			provider: "replicate",
			model: "black-forest-labs/flux-schnell",
		},
		falExecution: {
			provider: "fal",
			textToImage: "fal-ai/flux/schnell",
		},
		description: "Fast FLUX model for rapid iteration and quick previews.",
		logoText: "F",
		logoImageUrl: "/model-media/bfl-logo.png",
		previewImageUrl: "/model-media/flux-2-flex-cover.webp",
		accentClassName:
			"bg-[linear-gradient(135deg,#0f172a_0%,#0891b2_35%,#22d3ee_65%,#cffafe_100%)]",
		schema: fluxSchnellSchema,
		supportsReferenceImages: false,
		visibleSettings: ["image_size", "num_inference_steps"],
	},
	{
		id: "fal-ai/recraft-v3",
		label: "Recraft V3",
		provider: "Recraft",
		replicateExecution: {
			provider: "replicate",
			model: "recraft-ai/recraft-v3",
		},
		falExecution: {
			provider: "fal",
			textToImage: "fal-ai/recraft-v3",
		},
		description:
			"Excellent for graphic design, illustrations, and stylized imagery.",
		logoText: "R",
		accentClassName:
			"bg-[linear-gradient(135deg,#1f2937_0%,#7c3aed_35%,#a78bfa_65%,#ede9fe_100%)]",
		schema: recraftV3Schema,
		supportsReferenceImages: false,
		visibleSettings: ["image_size", "style"],
	},
	{
		id: "fal-ai/ideogram/v2",
		label: "Ideogram V2",
		provider: "Ideogram",
		replicateExecution: {
			provider: "replicate",
			model: "ideogram-ai/ideogram-v2",
		},
		falExecution: {
			provider: "fal",
			textToImage: "fal-ai/ideogram/v2",
		},
		description:
			"Exceptional text rendering and typography in generated images.",
		logoText: "I",
		accentClassName:
			"bg-[linear-gradient(135deg,#172554_0%,#1d4ed8_34%,#38bdf8_68%,#eff6ff_100%)]",
		schema: ideogramV2Schema,
		supportsReferenceImages: false,
		visibleSettings: ["aspect_ratio", "style_type", "magic_prompt_option"],
	},
	{
		id: "fal-ai/stable-diffusion-v35-large",
		label: "SD 3.5 Large",
		provider: "Stability",
		replicateExecution: {
			provider: "replicate",
			model: "stability-ai/stable-diffusion-3.5-large",
		},
		falExecution: {
			provider: "fal",
			textToImage: "fal-ai/stable-diffusion-v35-large",
			imageToImage: "fal-ai/stable-diffusion-v35-large/image-to-image",
		},
		description: "Stable Diffusion 3.5 Large with strong coherence and detail.",
		logoText: "S",
		accentClassName:
			"bg-[linear-gradient(135deg,#1f2937_0%,#6d28d9_30%,#a78bfa_65%,#ede9fe_100%)]",
		schema: sd35LargeSchema,
		supportsReferenceImages: true,
		referenceInputField: "image_url",
		visibleSettings: [
			"image_size",
			"num_inference_steps",
			"guidance_scale",
			"negative_prompt",
		],
	},
	{
		id: "google/nano-banana",
		label: "Nano Banana",
		provider: "Google",
		replicateExecution: {
			provider: "replicate",
			model: "google/nano-banana",
		},
		description:
			"Google's versatile image generation and editing model on Replicate.",
		logoText: "G",
		logoImageUrl: "/model-media/google-logo.png",
		previewImageUrl: "/model-media/nano-banana-2-cover.jpeg",
		accentClassName:
			"bg-[linear-gradient(135deg,#1e3a5f_0%,#4285f4_30%,#34a853_50%,#fbbc05_70%,#ea4335_100%)]",
		schema: nanoBananaSchema,
		supportsReferenceImages: true,
		referenceInputField: "image_input",
		visibleSettings: ["aspect_ratio", "output_format"],
	},
	{
		id: "google/nano-banana-2",
		label: "Nano Banana 2",
		provider: "Google",
		replicateExecution: {
			provider: "replicate",
			model: "google/nano-banana-2",
		},
		falExecution: {
			provider: "fal",
			textToImage: "fal-ai/nano-banana-2",
			imageToImage: "fal-ai/nano-banana-2/edit",
		},
		description:
			"Google's fast image generation and editing model with web search grounding.",
		logoText: "G",
		logoImageUrl: "/model-media/google-logo.png",
		previewImageUrl: "/model-media/nano-banana-2-cover.jpeg",
		accentClassName:
			"bg-[linear-gradient(135deg,#1e3a5f_0%,#4285f4_30%,#34a853_50%,#fbbc05_70%,#ea4335_100%)]",
		schema: nanoBanana2Schema,
		supportsReferenceImages: true,
		referenceInputField: "image_input",
		visibleSettings: [
			"aspect_ratio",
			"resolution",
			"output_format",
			"safety_tolerance",
		],
	},
	{
		id: "google/nano-banana-pro",
		label: "Nano Banana Pro",
		provider: "Google",
		replicateExecution: {
			provider: "replicate",
			model: "google/nano-banana-pro",
		},
		falExecution: {
			provider: "fal",
			textToImage: "fal-ai/nano-banana-pro",
			imageToImage: "fal-ai/nano-banana-pro/edit",
		},
		description:
			"Google's state-of-the-art image generation model with highest quality output.",
		logoText: "G",
		logoImageUrl: "/model-media/google-logo.png",
		previewImageUrl: "/model-media/nano-banana-pro-cover.png",
		accentClassName:
			"bg-[linear-gradient(135deg,#0f172a_0%,#4285f4_25%,#34a853_50%,#fbbc05_75%,#ea4335_100%)]",
		schema: nanoBananaProSchema,
		supportsReferenceImages: true,
		referenceInputField: "image_input",
		visibleSettings: [
			"aspect_ratio",
			"resolution",
			"output_format",
			"safety_tolerance",
		],
	},
	{
		id: "prunaai/p-image",
		label: "P-Image",
		provider: "Pruna",
		replicateExecution: {
			provider: "replicate",
			model: "prunaai/p-image",
			imageToImageModel: "prunaai/p-image-edit",
		},
		description:
			"Ultra-fast sub-second image generation with strong prompt adherence. Automatically uses P-Image Edit when reference images are provided.",
		logoText: "P",
		accentClassName:
			"bg-[linear-gradient(135deg,#1e1b4b_0%,#7c3aed_35%,#a855f7_65%,#e9d5ff_100%)]",
		schema: pImageSchema,
		supportsReferenceImages: true,
		referenceInputField: "images",
		visibleSettings: ["aspect_ratio", "prompt_upsampling"],
	},
] as const;

export function getImageModelDefinition(modelId: string): ImageModelDefinition {
	return IMAGE_MODELS.find((model) => model.id === modelId) ?? IMAGE_MODELS[0];
}

export function getImageModelExecution(modelId: string): ImageModelExecution {
	const model = getImageModelDefinition(modelId);

	// Prefer the configured provider if available
	if (IMAGE_PROVIDER === "fal" && model.falExecution) {
		return model.falExecution;
	}
	if (IMAGE_PROVIDER === "replicate" && model.replicateExecution) {
		return model.replicateExecution;
	}

	// Fall back to whatever is available
	if (model.replicateExecution) return model.replicateExecution;
	if (model.falExecution) return model.falExecution;

	throw new Error(`No execution config found for image model ${modelId}`);
}

export function isSupportedImageModel(modelId: string) {
	return IMAGE_MODELS.some((model) => model.id === modelId);
}

export function getImageModelControlDefinitions(modelId: string) {
	const model = getImageModelDefinition(modelId);
	return model.visibleSettings
		.map((key): ImageModelControlDefinition | null => {
			const property = model.schema.properties[key];
			if (!property) return null;

			if (property.type === "boolean") {
				return {
					key,
					label: property.title ?? titleFromKey(key),
					description: property.description,
					type: "boolean",
				};
			}

			if (property.enum?.length) {
				return {
					key,
					label: property.title ?? titleFromKey(key),
					description: property.description,
					type: "select",
					options: property.enum.map((value) => ({
						label: String(value),
						value: String(value),
					})),
				};
			}

			if (property.type === "integer" || property.type === "number") {
				return {
					key,
					label: property.title ?? titleFromKey(key),
					description: property.description,
					type: "number",
					min: property.minimum,
					max: property.maximum,
				};
			}

			return null;
		})
		.filter(
			(control): control is ImageModelControlDefinition => control !== null,
		);
}

export function getDefaultModelOptions(modelId: string) {
	const model = getImageModelDefinition(modelId);
	const entries = Object.entries(model.schema.properties)
		.filter(([key]) => model.visibleSettings.includes(key))
		.map(([key, property]) => [key, getDefaultForProperty(property)] as const);

	return {
		...Object.fromEntries(entries),
		...(model.hiddenDefaults ?? {}),
	} satisfies Record<string, ImageSettingPrimitive>;
}

export function normalizeImageModelOptions(
	modelId: string,
	rawOptions: Record<string, unknown>,
) {
	const model = getImageModelDefinition(modelId);
	const defaults = getDefaultModelOptions(modelId);

	return Object.fromEntries(
		Object.entries(defaults).map(([key, fallback]) => [
			key,
			coercePropertyValue(
				model.schema.properties[key],
				rawOptions[key],
				fallback as ImageSettingPrimitive,
			),
		]),
	) as Record<string, ImageSettingPrimitive>;
}

export function buildImageModelInput({
	modelId,
	prompt,
	modelOptions,
	referenceImageUrls,
	mode = "text-to-image",
}: {
	modelId: string;
	prompt: string;
	modelOptions: Record<string, ImageSettingValue>;
	referenceImageUrls?: string[];
	mode?: "text-to-image" | "image-to-image";
}) {
	const model = getImageModelDefinition(modelId);
	const normalizedOptions = normalizeImageModelOptions(modelId, modelOptions);
	const input: Record<string, unknown> = {
		prompt,
		...normalizedOptions,
	};

	// Handle reference images for fal.ai models
	// Different endpoints have different input schemas
	const hasReferenceImages =
		referenceImageUrls && referenceImageUrls.length > 0;
	const isImageToImage = mode === "image-to-image" || hasReferenceImages;

	if (isImageToImage && hasReferenceImages && model.supportsReferenceImages) {
		// Use the model's specified reference input field
		if (model.referenceInputField === "image_urls") {
			// Models that accept an array of images (e.g., Nano Banana)
			input.image_urls = referenceImageUrls;
		} else if (model.referenceInputField === "image_input") {
			input.image_input = referenceImageUrls;
		} else if (model.referenceInputField === "images") {
			// Replicate image-edit models that accept an ordered image array.
			input.images = referenceImageUrls;
		} else if (model.referenceInputField === "input_images") {
			// FLUX 2 models that accept an ordered reference image array.
			input.input_images = referenceImageUrls;
		} else if (model.referenceInputField === "image_prompt") {
			// FLUX Pro models use image_prompt for Redux-style reference guidance.
			input.image_prompt = referenceImageUrls[0];
		} else {
			// Models that accept a single image URL (e.g., FLUX, SD)
			input.image_url = referenceImageUrls[0];

			// Add strength parameter for image-to-image if not already set
			// This controls how much of the original image is preserved
			if (input.strength === undefined) {
				input.strength = 0.85; // Default: keep most of the image structure
			}
		}
	}

	return input;
}

/**
 * Determine the generation mode based on inputs
 */
export function determineImageGenerationMode(args: {
	referenceImageUrls?: string[];
}): "text-to-image" | "image-to-image" {
	return args.referenceImageUrls && args.referenceImageUrls.length > 0
		? "image-to-image"
		: "text-to-image";
}

export function getImageOutputFormat(
	modelId: string,
	modelOptions: Record<string, ImageSettingValue>,
) {
	const normalizedOptions = normalizeImageModelOptions(modelId, modelOptions);
	const outputFormat = normalizedOptions.output_format;
	return typeof outputFormat === "string" && outputFormat.length > 0
		? outputFormat
		: "png";
}

export function getImageOutputContentType(outputFormat: string) {
	switch (outputFormat) {
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "webp":
			return "image/webp";
		default:
			return "image/png";
	}
}

export function normalizeImageDefaults(value: unknown): ImageDefaults {
	const raw =
		value && typeof value === "object"
			? (value as Record<string, unknown>)
			: {};
	const model =
		typeof raw.model === "string" && isSupportedImageModel(raw.model)
			? raw.model
			: "fal-ai/flux-pro/v1.1";
	const rawModelOptions =
		raw.modelOptions && typeof raw.modelOptions === "object"
			? (raw.modelOptions as Record<string, unknown>)
			: raw;

	const legacyMappedOptions: Record<string, unknown> = {
		...rawModelOptions,
	};
	const legacyAspectRatio = normalizeLegacyAspectRatio(
		raw.aspectRatio ??
			rawModelOptions.aspect_ratio ??
			rawModelOptions.image_size,
	);
	if (legacyAspectRatio) {
		legacyMappedOptions.aspect_ratio = legacyAspectRatio;
	}
	if (typeof raw.resolution === "string") {
		legacyMappedOptions.resolution = raw.resolution;
	}
	if (typeof raw.outputFormat === "string") {
		legacyMappedOptions.output_format = raw.outputFormat;
	}
	if (
		legacyMappedOptions.steps === undefined &&
		typeof rawModelOptions.num_inference_steps === "number"
	) {
		legacyMappedOptions.steps = rawModelOptions.num_inference_steps;
	}
	if (
		legacyMappedOptions.guidance === undefined &&
		typeof rawModelOptions.guidance_scale === "number"
	) {
		legacyMappedOptions.guidance = rawModelOptions.guidance_scale;
	}

	return {
		model,
		batchCount: Math.max(1, Math.min(4, Number(raw.batchCount ?? 1))),
		modelOptions: normalizeImageModelOptions(model, legacyMappedOptions),
	};
}
