/**
 * Staleness detection for image prompts.
 *
 * An image prompt is considered "stale" if the shot description it was
 * generated from has changed since generation. We detect this by comparing
 * a hash of the current shot description against the stored `sourceHash`.
 */

/**
 * Simple string hash function (djb2 algorithm).
 * Returns a hex string for compact storage.
 */
export function hashString(str: string): string {
	let hash = 5381;
	for (let i = 0; i < str.length; i++) {
		hash = (hash * 33) ^ str.charCodeAt(i);
	}
	// Convert to unsigned 32-bit integer, then to hex
	return (hash >>> 0).toString(16);
}

/**
 * Computes the source hash for a shot description.
 * Normalizes whitespace before hashing for consistency.
 */
export function computeSourceHash(shotDescription: string): string {
	const normalized = shotDescription.trim().replace(/\s+/g, " ");
	return hashString(normalized);
}

/**
 * Checks if an image prompt is stale relative to its source shot.
 *
 * @param sourceHash - The hash stored on the image prompt entry (may be undefined for legacy entries)
 * @param currentShotDescription - The current shot description
 * @returns true if the prompt is stale (hash mismatch), false otherwise
 */
export function isPromptStale(
	sourceHash: string | undefined,
	currentShotDescription: string,
): boolean {
	// Legacy entries without sourceHash are not marked as stale
	// (we can't know if they're stale without a baseline)
	if (!sourceHash) return false;

	const currentHash = computeSourceHash(currentShotDescription);
	return sourceHash !== currentHash;
}

/**
 * Returns staleness info for display in the UI.
 */
export interface StalenessInfo {
	isStale: boolean;
	reason?: string;
}

export function getPromptStalenessInfo(
	sourceHash: string | undefined,
	currentShotDescription: string,
): StalenessInfo {
	if (!sourceHash) {
		return { isStale: false };
	}

	const currentHash = computeSourceHash(currentShotDescription);
	if (sourceHash !== currentHash) {
		return {
			isStale: true,
			reason: "Shot description has changed since this prompt was generated",
		};
	}

	return { isStale: false };
}
