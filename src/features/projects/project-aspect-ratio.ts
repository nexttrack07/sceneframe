import { getImageModelDefinition } from "./image-models";
import type { ImageDefaults, VideoDefaults } from "./project-types";
import { getVideoModelDefinition } from "./video-models";

type CanonicalAspectRatio = string;

function getProjectAspectRatioStorageKey(projectId: string) {
	return `project-aspect-ratio:${projectId}`;
}

function toCanonicalAspectRatio(value: unknown): CanonicalAspectRatio | null {
	if (typeof value !== "string") return null;
	if (value === "landscape") return "16:9";
	if (value === "landscape_16_9") return "16:9";
	if (value === "landscape_4_3") return "4:3";
	if (value === "portrait") return "9:16";
	if (value === "portrait_16_9") return "9:16";
	if (value === "portrait_4_3") return "3:4";
	if (value === "square" || value === "square_hd") return "1:1";
	return value.length > 0 ? value : null;
}

function readStoredProjectAspectRatio(
	projectId: string,
): CanonicalAspectRatio | null {
	if (typeof window === "undefined") return null;
	try {
		return toCanonicalAspectRatio(
			window.localStorage.getItem(getProjectAspectRatioStorageKey(projectId)),
		);
	} catch {
		return null;
	}
}

function writeStoredProjectAspectRatio(
	projectId: string,
	aspectRatio: CanonicalAspectRatio,
) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(
			getProjectAspectRatioStorageKey(projectId),
			aspectRatio,
		);
	} catch {
		// Ignore storage failures.
	}
}

function mapCanonicalAspectRatioToEnumValue(
	canonical: CanonicalAspectRatio,
	enumValues: readonly (string | number | boolean)[] | undefined,
) {
	if (!enumValues) return null;
	if (enumValues.includes(canonical)) return canonical;
	if (canonical === "16:9" && enumValues.includes("landscape")) {
		return "landscape";
	}
	if (canonical === "16:9" && enumValues.includes("landscape_16_9")) {
		return "landscape_16_9";
	}
	if (canonical === "4:3" && enumValues.includes("landscape_4_3")) {
		return "landscape_4_3";
	}
	if (canonical === "9:16" && enumValues.includes("portrait")) {
		return "portrait";
	}
	if (canonical === "9:16" && enumValues.includes("portrait_16_9")) {
		return "portrait_16_9";
	}
	if (canonical === "3:4" && enumValues.includes("portrait_4_3")) {
		return "portrait_4_3";
	}
	if (canonical === "1:1" && enumValues.includes("square_hd")) {
		return "square_hd";
	}
	if (canonical === "1:1" && enumValues.includes("square")) {
		return "square";
	}
	return null;
}

export function applyCanonicalAspectRatioToImageDefaults(
	settings: ImageDefaults,
	canonical: CanonicalAspectRatio,
) {
	const model = getImageModelDefinition(settings.model);
	const aspectRatioMapped = mapCanonicalAspectRatioToEnumValue(
		canonical,
		model.schema.properties.aspect_ratio?.enum,
	);
	if (aspectRatioMapped) {
		return {
			...settings,
			modelOptions: {
				...settings.modelOptions,
				aspect_ratio: aspectRatioMapped,
			},
		};
	}

	const imageSizeMapped = mapCanonicalAspectRatioToEnumValue(
		canonical,
		model.schema.properties.image_size?.enum,
	);
	if (!imageSizeMapped) return settings;

	return {
		...settings,
		modelOptions: {
			...settings.modelOptions,
			image_size: imageSizeMapped,
		},
	};
}

export function applyCanonicalAspectRatioToVideoDefaults(
	settings: VideoDefaults,
	canonical: CanonicalAspectRatio,
) {
	const model = getVideoModelDefinition(settings.model);
	const mapped = mapCanonicalAspectRatioToEnumValue(
		canonical,
		model.schema.properties.aspect_ratio?.enum,
	);
	if (!mapped) return settings;

	return {
		...settings,
		modelOptions: {
			...settings.modelOptions,
			aspect_ratio: mapped,
		},
	};
}

export function getPreferredProjectAspectRatio(projectId: string) {
	return readStoredProjectAspectRatio(projectId);
}

export function getPreferredAspectRatioFromImageDefaults(
	settings: ImageDefaults,
): CanonicalAspectRatio | null {
	return (
		toCanonicalAspectRatio(settings.modelOptions.aspect_ratio) ??
		toCanonicalAspectRatio(settings.modelOptions.image_size)
	);
}

export function getPreferredAspectRatioFromVideoDefaults(
	settings: VideoDefaults,
): CanonicalAspectRatio | null {
	return toCanonicalAspectRatio(settings.modelOptions.aspect_ratio);
}

export function persistProjectAspectRatio(
	projectId: string,
	aspectRatio: string,
) {
	const canonical = toCanonicalAspectRatio(aspectRatio);
	if (!canonical) return;
	writeStoredProjectAspectRatio(projectId, canonical);
}

export function applyProjectAspectRatioToImageDefaults(
	projectId: string,
	settings: ImageDefaults,
) {
	const preferred = readStoredProjectAspectRatio(projectId);
	if (!preferred) return settings;
	return applyCanonicalAspectRatioToImageDefaults(settings, preferred);
}

export function applyProjectAspectRatioToVideoDefaults(
	projectId: string,
	settings: VideoDefaults,
) {
	const preferred = readStoredProjectAspectRatio(projectId);
	if (!preferred) return settings;
	return applyCanonicalAspectRatioToVideoDefaults(settings, preferred);
}
