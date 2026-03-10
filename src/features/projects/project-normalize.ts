import { DEFAULT_IMAGE_DEFAULTS } from "./project-constants";
import type {
	ImageDefaults,
	IntakeAnswers,
	ProjectSettings,
} from "./project-types";

export function normalizeProjectSettings(raw: unknown): ProjectSettings | null {
	if (!raw || typeof raw !== "object") return null;
	const value = raw as Record<string, unknown>;
	// Backward compatibility for older shape where settings = intake object directly
	if ("concept" in value && typeof value.concept === "string") {
		return { intake: value as unknown as IntakeAnswers };
	}
	return value as ProjectSettings;
}

export function normalizeImageDefaults(value: unknown): ImageDefaults {
	if (!value || typeof value !== "object") return DEFAULT_IMAGE_DEFAULTS;
	const raw = value as Partial<ImageDefaults>;
	const batchCount = Math.max(1, Math.min(4, Number(raw.batchCount ?? 2)));

	return {
		model:
			typeof raw.model === "string" && raw.model.trim()
				? raw.model
				: DEFAULT_IMAGE_DEFAULTS.model,
		aspectRatio:
			raw.aspectRatio === "1:1" ||
			raw.aspectRatio === "16:9" ||
			raw.aspectRatio === "9:16" ||
			raw.aspectRatio === "4:5"
				? raw.aspectRatio
				: DEFAULT_IMAGE_DEFAULTS.aspectRatio,
		qualityPreset:
			raw.qualityPreset === "fast" ||
			raw.qualityPreset === "balanced" ||
			raw.qualityPreset === "high"
				? raw.qualityPreset
				: DEFAULT_IMAGE_DEFAULTS.qualityPreset,
		batchCount,
	};
}
