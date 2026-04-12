import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db/index";
import { type Project, projects } from "@/db/schema";

const LOCK_DURATION_MS = 2 * 60 * 1000;

/**
 * Acquires a short-lived soft lock on a project's workshop state to prevent
 * concurrent button-click races (e.g. double-clicking "Generate Shots").
 *
 * Uses a CAS update on `workshop_busy_until`: the lock is acquired only if
 * the existing value is null or already expired. The atomic UPDATE RETURNING
 * also hands back the fresh project row, so callers get post-lock data in
 * one round-trip. Self-expires after 2 minutes so a crashed mutation can't
 * deadlock a project forever.
 *
 * Throws if the project is missing/deleted or another caller already holds
 * the lock. Always releases on both success and failure.
 *
 * Note: this does not verify ownership — call assertProjectOwner before this
 * so auth failures return a clean error without ever touching the lock.
 */
export async function withWorkshopLock<T>(
	projectId: string,
	fn: (project: Project) => Promise<T>,
	operation?: string,
): Promise<T> {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + LOCK_DURATION_MS);

	const acquired = await db
		.update(projects)
		.set({ workshopBusyUntil: expiresAt })
		.where(
			and(
				eq(projects.id, projectId),
				isNull(projects.deletedAt),
				or(
					isNull(projects.workshopBusyUntil),
					lt(projects.workshopBusyUntil, now),
				),
			),
		)
		.returning();

	if (acquired.length === 0) {
		const prefix = operation ? `Cannot ${operation}` : "Workshop is busy";
		throw new Error(
			`${prefix} — another operation is in progress. Try again in a moment.`,
		);
	}

	try {
		return await fn(acquired[0]);
	} finally {
		await db
			.update(projects)
			.set({ workshopBusyUntil: null })
			.where(eq(projects.id, projectId))
			.catch((err) => {
				console.error("Failed to release workshop lock:", projectId, err);
			});
	}
}
