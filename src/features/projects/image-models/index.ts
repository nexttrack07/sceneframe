import type { ImageDefaults, ImageSettingValue } from "../project-types";
import { flux2FlexSchema } from "./schemas/flux-2-flex";
import { flux2MaxSchema } from "./schemas/flux-2-max";
import { flux2ProSchema } from "./schemas/flux-2-pro";
import { gptImage15Schema } from "./schemas/gpt-image-1.5";
import { nanoBananaSchema } from "./schemas/nano-banana";
import { nanoBanana2Schema } from "./schemas/nano-banana-2";
import { nanoBananaProSchema } from "./schemas/nano-banana-pro";
import { pImageSchema } from "./schemas/p-image";
import { seedream4Schema } from "./schemas/seedream-4";
import { zImageTurboSchema } from "./schemas/z-image-turbo";

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

export interface ImageModelDefinition {
	id: string;
	label: string;
	provider: string;
	description: string;
	logoText: string;
	logoImageUrl?: string;
	previewImageUrl?: string;
	accentClassName?: string;
	schema: ImageSchema;
	supportsReferenceImages: boolean;
	referenceInputField?: "image_input" | "input_images";
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

export const IMAGE_MODELS: readonly ImageModelDefinition[] = [
	{
		id: "google/nano-banana",
		label: "Nano Banana",
		provider: "Google",
		description:
			"Fast general-purpose image generation with strong visual fidelity.",
		logoText: "G",
		logoImageUrl: "/model-media/google-logo.png",
		previewImageUrl: "/model-media/nano-banana-cover.png",
		accentClassName:
			"bg-[linear-gradient(135deg,#102542_0%,#163f7a_35%,#5eb0ff_68%,#f5fbff_100%)]",
		schema: nanoBananaSchema,
		supportsReferenceImages: true,
		referenceInputField: "image_input",
		visibleSettings: ["aspect_ratio", "output_format"],
	},
	{
		id: "google/nano-banana-2",
		label: "Nano Banana 2",
		provider: "Google",
		description:
			"Higher-resolution Nano Banana with broader aspect-ratio support.",
		logoText: "G",
		logoImageUrl: "/model-media/google-logo.png",
		previewImageUrl: "/model-media/nano-banana-2-cover.jpeg",
		accentClassName:
			"bg-[linear-gradient(135deg,#12263f_0%,#2457a5_30%,#42c4ff_68%,#e8fff8_100%)]",
		schema: nanoBanana2Schema,
		supportsReferenceImages: true,
		referenceInputField: "image_input",
		visibleSettings: [
			"aspect_ratio",
			"resolution",
			"output_format",
			"google_search",
			"image_search",
		],
	},
	{
		id: "google/nano-banana-pro",
		label: "Nano Banana Pro",
		provider: "Google",
		description:
			"Premium Nano Banana variant tuned for quality and cinematic detail.",
		logoText: "G",
		logoImageUrl: "/model-media/google-logo.png",
		previewImageUrl: "/model-media/nano-banana-pro-cover.png",
		accentClassName:
			"bg-[linear-gradient(135deg,#1d1135_0%,#4c2b93_30%,#6cc9ff_65%,#fff4cc_100%)]",
		schema: nanoBananaProSchema,
		supportsReferenceImages: true,
		referenceInputField: "image_input",
		visibleSettings: [
			"aspect_ratio",
			"resolution",
			"output_format",
			"safety_filter_level",
			"allow_fallback_model",
		],
	},
	{
		id: "black-forest-labs/flux-2-flex",
		label: "FLUX 2 Flex",
		provider: "BFL",
		description:
			"Flexible FLUX model for strong prompt following and quick iteration.",
		logoText: "B",
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
			"output_format",
			"output_quality",
			"prompt_upsampling",
			"safety_tolerance",
		],
	},
	{
		id: "black-forest-labs/flux-2-pro",
		label: "FLUX 2 Pro",
		provider: "BFL",
		description:
			"Higher-end FLUX model tuned for polished, commercial-looking output.",
		logoText: "B",
		logoImageUrl: "/model-media/bfl-logo.png",
		previewImageUrl: "/model-media/flux-2-pro-cover.jpg",
		accentClassName:
			"bg-[linear-gradient(135deg,#111827_0%,#7c2d12_35%,#f59e0b_65%,#ffedd5_100%)]",
		schema: flux2ProSchema,
		supportsReferenceImages: true,
		referenceInputField: "input_images",
		visibleSettings: [
			"aspect_ratio",
			"resolution",
			"output_format",
			"output_quality",
			"safety_tolerance",
		],
	},
	{
		id: "black-forest-labs/flux-2-max",
		label: "FLUX 2 Max",
		provider: "BFL",
		description:
			"Top-tier FLUX rendering with richer detail and stronger finish.",
		logoText: "B",
		logoImageUrl: "/model-media/bfl-logo.png",
		previewImageUrl: "/model-media/flux-2-max-cover.jpg",
		accentClassName:
			"bg-[linear-gradient(135deg,#111827_0%,#3b0764_30%,#c084fc_65%,#f5d0fe_100%)]",
		schema: flux2MaxSchema,
		supportsReferenceImages: true,
		referenceInputField: "input_images",
		visibleSettings: [
			"aspect_ratio",
			"resolution",
			"output_format",
			"output_quality",
			"safety_tolerance",
		],
	},
	{
		id: "openai/gpt-image-1.5",
		label: "GPT Image 1.5",
		provider: "OpenAI",
		description:
			"Versatile image generation and editing with strong composition control.",
		logoText: "O",
		logoImageUrl: "/model-media/openai-logo.png",
		previewImageUrl: "/model-media/gpt-image-1-5-cover.jpg",
		accentClassName:
			"bg-[linear-gradient(135deg,#052e16_0%,#166534_35%,#4ade80_65%,#ecfccb_100%)]",
		schema: gptImage15Schema,
		supportsReferenceImages: true,
		referenceInputField: "input_images",
		visibleSettings: [
			"size",
			"quality",
			"background",
			"output_format",
			"output_compression",
			"moderation",
			"input_fidelity",
		],
	},
	{
		id: "bytedance/seedream-4",
		label: "Seedream 4",
		provider: "ByteDance",
		description:
			"Crisp stylized generation with prompt enhancement and reference support.",
		logoText: "S",
		logoImageUrl: "/model-media/bytedance-logo.png",
		previewImageUrl: "/model-media/seedream-4-cover.jpg",
		accentClassName:
			"bg-[linear-gradient(135deg,#172554_0%,#1d4ed8_34%,#38bdf8_68%,#eff6ff_100%)]",
		schema: seedream4Schema,
		supportsReferenceImages: true,
		referenceInputField: "image_input",
		visibleSettings: ["size", "aspect_ratio", "enhance_prompt"],
	},
	{
		id: "prunaai/p-image",
		label: "P Image",
		provider: "PrunaAI",
		description:
			"Balanced text-to-image model with quick iterations and prompt enhancement.",
		logoText: "P",
		logoImageUrl: "/model-media/prunaai-logo.png",
		previewImageUrl: "/model-media/p-image-cover.jpeg",
		accentClassName:
			"bg-[linear-gradient(135deg,#3f0d12_0%,#a71d31_35%,#f97316_68%,#fff7ed_100%)]",
		schema: pImageSchema,
		supportsReferenceImages: false,
		visibleSettings: [
			"aspect_ratio",
			"output_format",
			"speed",
			"enhance_prompt",
		],
	},
	{
		id: "prunaai/z-image-turbo",
		label: "Z Image Turbo",
		provider: "PrunaAI",
		description:
			"Turbo-focused image model for rapid renders and responsive exploration.",
		logoText: "Z",
		logoImageUrl: "/model-media/prunaai-logo.png",
		previewImageUrl: "/model-media/z-image-turbo-cover.jpg",
		accentClassName:
			"bg-[linear-gradient(135deg,#1f2937_0%,#0f766e_30%,#2dd4bf_65%,#ccfbf1_100%)]",
		schema: zImageTurboSchema,
		supportsReferenceImages: false,
		visibleSettings: [
			"width",
			"height",
			"num_inference_steps",
			"guidance_scale",
			"output_format",
			"output_quality",
		],
	},
] as const;

export function getImageModelDefinition(modelId: string): ImageModelDefinition {
	return IMAGE_MODELS.find((model) => model.id === modelId) ?? IMAGE_MODELS[0];
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
}: {
	modelId: string;
	prompt: string;
	modelOptions: Record<string, ImageSettingValue>;
	referenceImageUrls?: string[];
}) {
	const model = getImageModelDefinition(modelId);
	const normalizedOptions = normalizeImageModelOptions(modelId, modelOptions);
	const input: Record<string, unknown> = {
		prompt,
		...normalizedOptions,
	};

	if (
		model.supportsReferenceImages &&
		model.referenceInputField &&
		referenceImageUrls?.length
	) {
		input[model.referenceInputField] = referenceImageUrls;
	}

	return input;
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
			: "google/nano-banana-pro";
	const rawModelOptions =
		raw.modelOptions && typeof raw.modelOptions === "object"
			? (raw.modelOptions as Record<string, unknown>)
			: raw;

	const legacyMappedOptions: Record<string, unknown> = {
		...rawModelOptions,
	};
	if (typeof raw.aspectRatio === "string") {
		legacyMappedOptions.aspect_ratio = raw.aspectRatio;
	}
	if (typeof raw.resolution === "string") {
		legacyMappedOptions.resolution = raw.resolution;
	}
	if (typeof raw.outputFormat === "string") {
		legacyMappedOptions.output_format = raw.outputFormat;
	}

	return {
		model,
		batchCount: Math.max(1, Math.min(4, Number(raw.batchCount ?? 1))),
		modelOptions: normalizeImageModelOptions(model, legacyMappedOptions),
	};
}
