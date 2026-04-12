import { deleteObject } from "./r2.server";

/**
 * Safely delete a batch of R2 storage keys.
 *
 * - Uses Promise.allSettled so one failure doesn't abort the rest
 * - Logs failures but never throws — callers should not let R2 cleanup break their flow
 * - Designed to be called AFTER a DB transaction commits, never before
 *
 * @param keys - Array of R2 storage keys to delete. Nulls are filtered out.
 */
export async function cleanupStorageKeys(
	keys: ReadonlyArray<string | null | undefined>,
): Promise<void> {
	const validKeys = keys.filter((k): k is string => Boolean(k));
	if (validKeys.length === 0) return;

	const results = await Promise.allSettled(
		validKeys.map((key) => deleteObject(key)),
	);

	results.forEach((result, i) => {
		if (result.status === "rejected") {
			console.error(
				"R2 cleanup failed for key:",
				validKeys[i],
				result.reason,
			);
		}
	});
}
