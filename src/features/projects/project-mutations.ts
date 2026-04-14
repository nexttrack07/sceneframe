import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/db/index";
import {
	assets,
	messages,
	motionGraphics,
	projects,
	shots,
	transitionVideos,
} from "@/db/schema";
import { assertProjectOwner } from "@/lib/assert-project-owner.server";
import { cleanupStorageKeys } from "@/lib/r2-cleanup.server";

// ---------------------------------------------------------------------------
// Re-exports for backward compatibility
// ---------------------------------------------------------------------------

export {
	saveIntake,
	sendMessage,
	applyWorkshopEdit,
	approveWorkshop,
	resetWorkshop,
	setWorkshopStage,
	generateOutline,
	generateShots,
	reviewAndFixShots,
	generateImagePrompts,
} from "./workshop-mutations";

// ---------------------------------------------------------------------------
// deleteProject
// ---------------------------------------------------------------------------

export const deleteProject = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string }) => data)
	.handler(async ({ data: { projectId } }) => {
		await assertProjectOwner(projectId, "error");

		// Collect all storageKeys (assets + transition videos) for R2 cleanup
		const [assetRows, shotRows, tvRows] = await Promise.all([
			db
				.select({ storageKey: assets.storageKey })
				.from(assets)
				.where(
					and(
						eq(assets.projectId, projectId),
						isNotNull(assets.storageKey),
					),
				),
			db
				.select({ id: shots.id })
				.from(shots)
				.where(eq(shots.projectId, projectId)),
			db
				.select({ storageKey: transitionVideos.storageKey })
				.from(transitionVideos)
				.where(
					and(
						eq(transitionVideos.projectId, projectId),
						isNotNull(transitionVideos.storageKey),
					),
				),
		]);

		const storageKeys = [
			...assetRows
				.map((r) => r.storageKey)
				.filter((k): k is string => k !== null),
			...tvRows
				.map((r) => r.storageKey)
				.filter((k): k is string => k !== null),
		];
		const shotIds = shotRows.map((r) => r.id);

		// Hard-delete everything from DB in dependency order
		// motion_graphics and transition_videos reference shots via FK, so delete them first
		await db.transaction(async (tx) => {
			if (shotIds.length > 0) {
				// Delete motion_graphics referencing these shots
				await tx
					.delete(motionGraphics)
					.where(inArray(motionGraphics.shotId, shotIds));
				// Delete transition_videos referencing these shots (via fromShotId/toShotId)
				await tx
					.delete(transitionVideos)
					.where(
						or(
							inArray(transitionVideos.fromShotId, shotIds),
							inArray(transitionVideos.toShotId, shotIds),
						),
					);
			}
			// Catch any remaining transition_videos by projectId
			await tx
				.delete(transitionVideos)
				.where(eq(transitionVideos.projectId, projectId));
			await tx.delete(assets).where(eq(assets.projectId, projectId));
			await tx.delete(shots).where(eq(shots.projectId, projectId));
			await tx.delete(messages).where(eq(messages.projectId, projectId));
			await tx.delete(projects).where(eq(projects.id, projectId));
		});

		// R2 cleanup AFTER transaction commits — safe to delete now
		await cleanupStorageKeys(storageKeys);
	});

// ---------------------------------------------------------------------------
// saveEditorState — persists the editor timeline state as JSON
// ---------------------------------------------------------------------------

export const saveEditorState = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { projectId: string; editorState: Record<string, unknown> }) => {
			if (!data.projectId) throw new Error("projectId is required");
			if (!data.editorState) throw new Error("editorState is required");
			return data;
		},
	)
	.handler(async ({ data: { projectId, editorState } }) => {
		await assertProjectOwner(projectId, "error");

		await db
			.update(projects)
			.set({ editorState })
			.where(eq(projects.id, projectId));
	});
