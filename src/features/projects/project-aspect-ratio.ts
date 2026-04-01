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
	if (value === "portrait") return "9:16";
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
	if (canonical === "9:16" && enumValues.includes("portrait")) {
		return "portrait";
	}
	return null;
}

export function applyCanonicalAspectRatioToImageDefaults(
	settings: ImageDefaults,
	canonical: CanonicalAspectRatio,
) {
	const model = getImageModelDefinition(settings.model);
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
	return toCanonicalAspectRatio(settings.modelOptions.aspect_ratio);
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
