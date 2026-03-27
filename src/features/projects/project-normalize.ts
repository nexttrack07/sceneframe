import { normalizeImageDefaults } from "./image-models";
import type { IntakeAnswers, ProjectSettings } from "./project-types";
import { normalizeVideoDefaults } from "./video-models";

export { normalizeImageDefaults };
export { normalizeVideoDefaults };

export function normalizeProjectSettings(raw: unknown): ProjectSettings | null {
	if (!raw || typeof raw !== "object") return null;
	const value = raw as Record<string, unknown>;
	if ("concept" in value && typeof value.concept === "string") {
		return { intake: value as unknown as IntakeAnswers };
	}
	return value as ProjectSettings;
}
