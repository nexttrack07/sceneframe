import { auth } from "@clerk/tanstack-react-start/server";
import { redirect } from "@tanstack/react-router";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index";
import { assets, projects, shots } from "@/db/schema";

type FailureMode = "redirect" | "error";

function fail(mode: FailureMode, message: string): never {
	if (mode === "redirect") {
		throw redirect({
			to: message === "Unauthenticated" ? "/sign-in" : "/dashboard",
		});
	}
	throw new Error(message);
}

/**
 * Asserts that the current authenticated user owns the given project.
 * In 'redirect' mode (default), throws redirect() for navigation contexts.
 * In 'error' mode, throws Error for mutation contexts.
 */
export async function assertProjectOwner(
	projectId: string,
	mode: FailureMode = "redirect",
) {
	const { userId } = await auth();
	if (!userId) fail(mode, "Unauthenticated");

	const project = await db.query.projects.findFirst({
		where: and(
			eq(projects.id, projectId),
			eq(projects.userId, userId),
			isNull(projects.deletedAt),
		),
	});
	if (!project) fail(mode, "Project not found");

	return { userId, project };
}

/**
 * Asserts that the current authenticated user owns the project the shot
 * belongs to (shot → project direct FK).
 */
export async function assertShotOwner(
	shotId: string,
	mode: FailureMode = "error",
) {
	const { userId } = await auth();
	if (!userId) fail(mode, "Unauthenticated");

	const shot = await db.query.shots.findFirst({
		where: and(eq(shots.id, shotId), isNull(shots.deletedAt)),
	});
	if (!shot) fail(mode, "Shot not found");

	const project = await db.query.projects.findFirst({
		where: and(
			eq(projects.id, shot.projectId),
			eq(projects.userId, userId),
			isNull(projects.deletedAt),
		),
	});
	if (!project) fail(mode, "Unauthorized");

	return { userId, shot, project };
}

/**
 * Asserts that the current authenticated user owns the project the asset
 * belongs to. Works for ALL asset types — project-scoped (voiceover, music,
 * sfx) and shot-scoped (images, videos).
 *
 * If the asset has a shotId, the associated shot is fetched and returned.
 * If the asset is project-scoped (shotId is null), shot is returned as null.
 *
 * This replaces the old split between assertAssetOwner and assertAssetOwnerViaShot.
 */
export async function assertAssetOwner(
	assetId: string,
	mode: FailureMode = "error",
) {
	const { userId } = await auth();
	if (!userId) fail(mode, "Unauthenticated");

	const asset = await db.query.assets.findFirst({
		where: and(eq(assets.id, assetId), isNull(assets.deletedAt)),
	});
	if (!asset) fail(mode, "Asset not found");

	// Direct project ownership check — works regardless of shotId
	const project = await db.query.projects.findFirst({
		where: and(
			eq(projects.id, asset.projectId),
			eq(projects.userId, userId),
			isNull(projects.deletedAt),
		),
	});
	if (!project) fail(mode, "Unauthorized");

	// Fetch the shot if the asset is shot-scoped
	const shot = asset.shotId
		? ((await db.query.shots.findFirst({
				where: and(eq(shots.id, asset.shotId), isNull(shots.deletedAt)),
			})) ?? null)
		: null;

	return { userId, asset, project, shot };
}
