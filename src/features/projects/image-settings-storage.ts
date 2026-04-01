import { normalizeImageDefaults } from "./project-normalize";
import type { ImageDefaults } from "./project-types";

function getImageSettingsStorageKey() {
	return "image-studio:last-settings";
}

export function readImageSettings(): ImageDefaults | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(getImageSettingsStorageKey());
		if (!raw) return null;
		return normalizeImageDefaults(JSON.parse(raw));
	} catch {
		return null;
	}
}

export function writeImageSettings(settings: ImageDefaults) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(
			getImageSettingsStorageKey(),
			JSON.stringify(settings),
		);
	} catch {
		// Ignore storage failures; these are UX defaults, not critical data.
	}
}
