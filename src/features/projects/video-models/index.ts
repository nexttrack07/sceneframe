import type { VideoDefaults, VideoSettingValue } from "../project-types";

interface VideoSchemaProperty {
	type?: "string" | "number" | "integer" | "boolean";
	title?: string;
	description?: string;
	default?: unknown;
	enum?: readonly (string | number | boolean)[];
	minimum?: number;
	maximum?: number;
}

interface VideoSchema {
	type: "object";
	title?: string;
	properties: Record<string, VideoSchemaProperty>;
}

export interface VideoModelControlDefinition {
	key: string;
	label: string;
	description?: string;
	type: "select" | "boolean" | "number" | "textarea";
	options?: readonly { label: string; value: string }[];
	min?: number;
	max?: number;
}

export interface VideoModelDefinition {
	id: string;
	label: string;
	provider: string;
	description: string;
	logoText: string;
	logoImageUrl?: string;
	previewImageUrl?: string;
	accentClassName?: string;
	schema: VideoSchema;
	visibleSettings: readonly string[];
	buildTransitionInput: (args: {
		prompt: string;
		modelOptions: Record<string, VideoSettingValue>;
		startImageUrl: string;
		endImageUrl: string;
	}) => Record<string, unknown>;
	buildShotInput: (args: {
		prompt: string;
		modelOptions: Record<string, VideoSettingValue>;
		startImageUrl?: string;
		referenceImageUrls: string[];
	}) => Record<string, unknown>;
}

const klingV3OmniSchema = {
	type: "object",
	title: "Input",
	properties: {
		duration: {
			type: "integer",
			title: "Duration",
			enum: [3, 5, 7, 10, 15],
			default: 5,
		},
		mode: {
			type: "string",
			title: "Resolution",
			enum: ["standard", "pro"],
			default: "pro",
		},
		generate_audio: {
			type: "boolean",
			title: "Audio",
			default: false,
		},
	},
} as const;

const klingV25TurboSchema = {
	type: "object",
	title: "Input",
	properties: {
		duration: {
			type: "integer",
			title: "Duration",
			enum: [5, 10],
			default: 5,
		},
		negative_prompt: {
			type: "string",
			title: "Negative Prompt",
			default: "",
		},
	},
} as const;

const grokImagineVideoSchema = {
	type: "object",
	title: "Input",
	properties: {
		duration: {
			type: "integer",
			title: "Duration",
			default: 5,
			minimum: 1,
			maximum: 15,
		},
		aspect_ratio: {
			type: "string",
			title: "Aspect Ratio",
			enum: ["auto", "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"],
			default: "auto",
		},
		resolution: {
			type: "string",
			title: "Resolution",
			enum: ["480p", "720p"],
			default: "720p",
		},
	},
} as const;

const veo31Schema = {
	type: "object",
	title: "Input",
	properties: {
		aspect_ratio: {
			type: "string",
			title: "Aspect Ratio",
			enum: ["16:9", "9:16"],
			default: "16:9",
		},
		duration: {
			type: "integer",
			title: "Duration",
			default: 8,
			minimum: 8,
			maximum: 8,
		},
		resolution: {
			type: "string",
			title: "Resolution",
			enum: ["1080p"],
			default: "1080p",
		},
		negative_prompt: {
			type: "string",
			title: "Negative Prompt",
			default: "",
		},
		generate_audio: {
			type: "boolean",
			title: "Audio",
			default: true,
		},
	},
} as const;

const sora2Schema = {
	type: "object",
	title: "Input",
	properties: {
		seconds: {
			type: "integer",
			title: "Duration",
			default: 4,
			minimum: 4,
			maximum: 20,
		},
		aspect_ratio: {
			type: "string",
			title: "Aspect Ratio",
			enum: ["portrait", "landscape"],
			default: "portrait",
		},
	},
} as const;

const wan25I2vSchema = {
	type: "object",
	title: "Input",
	properties: {
		duration: {
			type: "integer",
			title: "Duration",
			default: 5,
			minimum: 5,
			maximum: 5,
		},
		resolution: {
			type: "string",
			title: "Resolution",
			enum: ["720p"],
			default: "720p",
		},
		negative_prompt: {
			type: "string",
			title: "Negative Prompt",
			default: "",
		},
		enable_prompt_expansion: {
			type: "boolean",
			title: "Prompt Expansion",
			default: true,
		},
	},
} as const;

export const VIDEO_MODELS: readonly VideoModelDefinition[] = [
	{
		id: "kwaivgi/kling-v3-omni-video",
		label: "Kling V3 Omni",
		provider: "Kwai",
		description:
			"Higher-end Kling motion model with 720p or 1080p output options.",
		logoText: "K",
		logoImageUrl: "/model-media/kling-logo.jpg",
		previewImageUrl: "/model-media/kling-v3-omni-preview.mp4",
		accentClassName:
			"bg-[linear-gradient(135deg,#1f2937_0%,#6d28d9_30%,#ec4899_68%,#fce7f3_100%)]",
		schema: klingV3OmniSchema,
		visibleSettings: ["duration", "mode", "generate_audio"],
		buildTransitionInput: ({
			prompt,
			modelOptions,
			startImageUrl,
			endImageUrl,
		}) => ({
			prompt,
			start_image: startImageUrl,
			end_image: endImageUrl,
			duration: Math.max(3, Math.min(15, Number(modelOptions.duration) || 5)),
			mode: modelOptions.mode === "standard" ? "standard" : "pro",
			generate_audio: Boolean(modelOptions.generate_audio),
		}),
		buildShotInput: ({
			prompt,
			modelOptions,
			startImageUrl,
			referenceImageUrls,
		}) => ({
			prompt,
			...(startImageUrl ? { start_image: startImageUrl } : {}),
			...(referenceImageUrls.length > 1
				? { reference_images: referenceImageUrls.slice(1, 8) }
				: {}),
			duration: Math.max(3, Math.min(15, Number(modelOptions.duration) || 5)),
			mode: modelOptions.mode === "standard" ? "standard" : "pro",
			generate_audio: Boolean(modelOptions.generate_audio),
		}),
	},
	{
		id: "kwaivgi/kling-v2.5-turbo-pro",
		label: "Kling 2.5 Turbo",
		provider: "Kwai",
		description:
			"Turbo transition model with streamlined controls and quick motion output.",
		logoText: "K",
		logoImageUrl: "/model-media/kling-logo.jpg",
		previewImageUrl: "/model-media/kling-v2-5-turbo-preview.mp4",
		accentClassName:
			"bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_35%,#22d3ee_70%,#e0f2fe_100%)]",
		schema: klingV25TurboSchema,
		visibleSettings: ["duration", "negative_prompt"],
		buildTransitionInput: ({
			prompt,
			modelOptions,
			startImageUrl,
			endImageUrl,
		}) => ({
			prompt,
			start_image: startImageUrl,
			end_image: endImageUrl,
			duration: Number(modelOptions.duration) <= 7 ? 5 : 10,
			negative_prompt:
				typeof modelOptions.negative_prompt === "string" &&
				modelOptions.negative_prompt.trim().length > 0
					? modelOptions.negative_prompt.trim()
					: undefined,
		}),
		buildShotInput: ({ prompt, modelOptions, startImageUrl }) => ({
			prompt,
			...(startImageUrl ? { start_image: startImageUrl } : {}),
			duration: Number(modelOptions.duration) <= 7 ? 5 : 10,
			negative_prompt:
				typeof modelOptions.negative_prompt === "string" &&
				modelOptions.negative_prompt.trim().length > 0
					? modelOptions.negative_prompt.trim()
					: undefined,
		}),
	},
	{
		id: "xai/grok-imagine-video",
		label: "Grok Imagine Video",
		provider: "xAI",
		description:
			"Image-to-video model with native audio and broad aspect-ratio support.",
		logoText: "X",
		logoImageUrl: "/model-media/xai-logo.jpg",
		previewImageUrl: "/model-media/grok-imagine-video-preview.mp4",
		accentClassName:
			"bg-[linear-gradient(135deg,#111827_0%,#374151_40%,#d1d5db_100%)]",
		schema: grokImagineVideoSchema,
		visibleSettings: ["duration", "aspect_ratio", "resolution"],
		buildTransitionInput: ({ prompt, modelOptions, startImageUrl }) => ({
			prompt,
			image: startImageUrl,
			duration: Math.max(1, Math.min(15, Number(modelOptions.duration) || 5)),
			aspect_ratio:
				typeof modelOptions.aspect_ratio === "string"
					? modelOptions.aspect_ratio
					: "auto",
			resolution: modelOptions.resolution === "480p" ? "480p" : "720p",
		}),
		buildShotInput: ({ prompt, modelOptions, startImageUrl }) => ({
			prompt,
			...(startImageUrl ? { image: startImageUrl } : {}),
			duration: Math.max(1, Math.min(15, Number(modelOptions.duration) || 5)),
			aspect_ratio:
				typeof modelOptions.aspect_ratio === "string"
					? modelOptions.aspect_ratio
					: "auto",
			resolution: modelOptions.resolution === "480p" ? "480p" : "720p",
		}),
	},
	{
		id: "google/veo-3.1",
		label: "Veo 3.1",
		provider: "Google",
		description:
			"High-fidelity video model with reference images and ending-frame interpolation.",
		logoText: "G",
		logoImageUrl: "/model-media/google-logo.png",
		previewImageUrl: "/model-media/veo-3-1-preview.mp4",
		accentClassName:
			"bg-[linear-gradient(135deg,#0f172a_0%,#2563eb_38%,#67e8f9_100%)]",
		schema: veo31Schema,
		visibleSettings: ["aspect_ratio", "negative_prompt", "generate_audio"],
		buildTransitionInput: ({
			prompt,
			modelOptions,
			startImageUrl,
			endImageUrl,
		}) => ({
			prompt,
			image: startImageUrl,
			last_frame: endImageUrl,
			aspect_ratio: modelOptions.aspect_ratio === "9:16" ? "9:16" : "16:9",
			duration: 8,
			resolution: "1080p",
			negative_prompt:
				typeof modelOptions.negative_prompt === "string" &&
				modelOptions.negative_prompt.trim().length > 0
					? modelOptions.negative_prompt.trim()
					: undefined,
			generate_audio:
				typeof modelOptions.generate_audio === "boolean"
					? modelOptions.generate_audio
					: true,
		}),
		buildShotInput: ({
			prompt,
			modelOptions,
			startImageUrl,
			referenceImageUrls,
		}) => ({
			prompt,
			...(referenceImageUrls.length > 1
				? { reference_images: referenceImageUrls.slice(0, 4) }
				: startImageUrl
					? { image: startImageUrl }
					: {}),
			aspect_ratio: modelOptions.aspect_ratio === "9:16" ? "9:16" : "16:9",
			duration: 8,
			resolution: "1080p",
			negative_prompt:
				typeof modelOptions.negative_prompt === "string" &&
				modelOptions.negative_prompt.trim().length > 0
					? modelOptions.negative_prompt.trim()
					: undefined,
			generate_audio:
				typeof modelOptions.generate_audio === "boolean"
					? modelOptions.generate_audio
					: true,
		}),
	},
	{
		id: "openai/sora-2",
		label: "Sora 2",
		provider: "OpenAI",
		description:
			"OpenAI flagship video generation with optional image reference as the starting frame.",
		logoText: "O",
		logoImageUrl: "/model-media/openai-logo.png",
		previewImageUrl: "/model-media/sora-2-preview.png",
		accentClassName:
			"bg-[linear-gradient(135deg,#052e16_0%,#166534_40%,#86efac_100%)]",
		schema: sora2Schema,
		visibleSettings: ["seconds", "aspect_ratio"],
		buildTransitionInput: ({ prompt, modelOptions, startImageUrl }) => ({
			prompt,
			input_reference: startImageUrl,
			seconds: Math.max(4, Math.min(20, Number(modelOptions.seconds) || 4)),
			aspect_ratio:
				modelOptions.aspect_ratio === "landscape" ? "landscape" : "portrait",
		}),
		buildShotInput: ({ prompt, modelOptions, startImageUrl }) => ({
			prompt,
			...(startImageUrl ? { input_reference: startImageUrl } : {}),
			seconds: Math.max(4, Math.min(20, Number(modelOptions.seconds) || 4)),
			aspect_ratio:
				modelOptions.aspect_ratio === "landscape" ? "landscape" : "portrait",
		}),
	},
	{
		id: "wan-video/wan-2.5-i2v",
		label: "Wan 2.5 I2V",
		provider: "Alibaba",
		description:
			"Image-to-video generation with prompt expansion and optional negative prompt.",
		logoText: "W",
		logoImageUrl: "/model-media/wan-logo.png",
		previewImageUrl: "/model-media/wan-2-5-i2v-preview.mp4",
		accentClassName:
			"bg-[linear-gradient(135deg,#1f2937_0%,#0f766e_38%,#99f6e4_100%)]",
		schema: wan25I2vSchema,
		visibleSettings: ["negative_prompt", "enable_prompt_expansion"],
		buildTransitionInput: ({ prompt, modelOptions, startImageUrl }) => ({
			prompt,
			image: startImageUrl,
			duration: 5,
			resolution: "720p",
			negative_prompt:
				typeof modelOptions.negative_prompt === "string" &&
				modelOptions.negative_prompt.trim().length > 0
					? modelOptions.negative_prompt.trim()
					: undefined,
			enable_prompt_expansion:
				typeof modelOptions.enable_prompt_expansion === "boolean"
					? modelOptions.enable_prompt_expansion
					: true,
		}),
		buildShotInput: ({ prompt, modelOptions, startImageUrl }) => ({
			prompt,
			...(startImageUrl ? { image: startImageUrl } : {}),
			duration: 5,
			resolution: "720p",
			negative_prompt:
				typeof modelOptions.negative_prompt === "string" &&
				modelOptions.negative_prompt.trim().length > 0
					? modelOptions.negative_prompt.trim()
					: undefined,
			enable_prompt_expansion:
				typeof modelOptions.enable_prompt_expansion === "boolean"
					? modelOptions.enable_prompt_expansion
					: true,
		}),
	},
] as const;

function titleFromKey(key: string) {
	return key
		.split("_")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

function getDefaultValue(property: VideoSchemaProperty): VideoSettingValue {
	if (
		typeof property.default === "string" ||
		typeof property.default === "number" ||
		typeof property.default === "boolean"
	) {
		return property.default;
	}
	if (property.enum?.length) {
		const first = property.enum[0];
		if (
			typeof first === "string" ||
			typeof first === "number" ||
			typeof first === "boolean"
		) {
			return first;
		}
	}
	if (property.type === "boolean") return false;
	if (property.type === "number" || property.type === "integer") {
		return property.minimum ?? 0;
	}
	return "";
}

function coerceValue(
	property: VideoSchemaProperty | undefined,
	value: unknown,
	fallback: VideoSettingValue,
): VideoSettingValue {
	if (!property) {
		if (
			typeof value === "string" ||
			typeof value === "number" ||
			typeof value === "boolean"
		) {
			return value;
		}
		return fallback;
	}

	if (property.enum?.length) {
		return property.enum.includes(value as never)
			? (value as VideoSettingValue)
			: fallback;
	}

	if (property.type === "boolean") {
		return typeof value === "boolean" ? value : fallback;
	}

	if (property.type === "number" || property.type === "integer") {
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

export function getVideoModelDefinition(modelId: string): VideoModelDefinition {
	return VIDEO_MODELS.find((model) => model.id === modelId) ?? VIDEO_MODELS[0];
}

export function isSupportedVideoModel(modelId: string) {
	return VIDEO_MODELS.some((model) => model.id === modelId);
}

export function getDefaultVideoModelOptions(modelId: string) {
	const model = getVideoModelDefinition(modelId);
	return Object.fromEntries(
		Object.entries(model.schema.properties).map(([key, property]) => [
			key,
			getDefaultValue(property),
		]),
	) as Record<string, VideoSettingValue>;
}

export function normalizeVideoModelOptions(
	modelId: string,
	rawOptions: Record<string, unknown>,
) {
	const model = getVideoModelDefinition(modelId);
	const defaults = getDefaultVideoModelOptions(modelId);

	return Object.fromEntries(
		Object.entries(defaults).map(([key, fallback]) => [
			key,
			coerceValue(model.schema.properties[key], rawOptions[key], fallback),
		]),
	) as Record<string, VideoSettingValue>;
}

export function normalizeVideoDefaults(value: unknown): VideoDefaults {
	const raw =
		value && typeof value === "object"
			? (value as Record<string, unknown>)
			: {};
	const model =
		typeof raw.model === "string" && isSupportedVideoModel(raw.model)
			? raw.model
			: "kwaivgi/kling-v3-omni-video";
	const rawModelOptions =
		raw.modelOptions && typeof raw.modelOptions === "object"
			? (raw.modelOptions as Record<string, unknown>)
			: raw;

	const legacyMappedOptions: Record<string, unknown> = { ...rawModelOptions };
	if (typeof raw.mode === "string") legacyMappedOptions.mode = raw.mode;
	if (typeof raw.duration === "number")
		legacyMappedOptions.duration = raw.duration;
	if (typeof raw.generateAudio === "boolean") {
		legacyMappedOptions.generate_audio = raw.generateAudio;
	}
	if (typeof raw.aspectRatio === "string") {
		legacyMappedOptions.aspect_ratio = raw.aspectRatio;
	}
	if (typeof raw.resolution === "string") {
		legacyMappedOptions.resolution = raw.resolution;
	}
	if (typeof raw.seconds === "number") {
		legacyMappedOptions.seconds = raw.seconds;
	}
	if (typeof raw.negativePrompt === "string") {
		legacyMappedOptions.negative_prompt = raw.negativePrompt;
	}
	if (typeof raw.enablePromptExpansion === "boolean") {
		legacyMappedOptions.enable_prompt_expansion = raw.enablePromptExpansion;
	}

	return {
		model,
		modelOptions: normalizeVideoModelOptions(model, legacyMappedOptions),
	};
}

export function getVideoModelControlDefinitions(modelId: string) {
	const model = getVideoModelDefinition(modelId);
	return model.visibleSettings.map((key): VideoModelControlDefinition => {
		const property = model.schema.properties[key];
		if (property.enum?.length) {
			return {
				key,
				label: property.title ?? titleFromKey(key),
				description: property.description,
				type: "select",
				options: property.enum.map((value) => ({
					label:
						key === "duration"
							? `${value}s`
							: key === "mode" && value === "standard"
								? "720p"
								: key === "mode" && value === "pro"
									? "1080p"
									: String(value),
					value: String(value),
				})),
			};
		}

		if (property.type === "boolean") {
			return {
				key,
				label: property.title ?? titleFromKey(key),
				description: property.description,
				type: "boolean",
			};
		}

		if (property.type === "number" || property.type === "integer") {
			return {
				key,
				label: property.title ?? titleFromKey(key),
				description: property.description,
				type: "number",
				min: property.minimum,
				max: property.maximum,
			};
		}

		return {
			key,
			label: property.title ?? titleFromKey(key),
			description: property.description,
			type: "textarea",
		};
	});
}

export function buildTransitionVideoInput(args: {
	modelId: string;
	prompt: string;
	modelOptions: Record<string, VideoSettingValue>;
	startImageUrl: string;
	endImageUrl: string;
}) {
	const model = getVideoModelDefinition(args.modelId);
	return model.buildTransitionInput(args);
}

export function buildShotVideoInput(args: {
	modelId: string;
	prompt: string;
	modelOptions: Record<string, VideoSettingValue>;
	startImageUrl?: string;
	referenceImageUrls?: string[];
}) {
	const model = getVideoModelDefinition(args.modelId);
	return model.buildShotInput({
		...args,
		referenceImageUrls:
			args.referenceImageUrls ??
			(args.startImageUrl ? [args.startImageUrl] : []),
	});
}
