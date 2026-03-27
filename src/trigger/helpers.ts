import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index";
import { assets } from "@/db/schema";

/**
 * Load an active (non-deleted) asset that matches the given generationId.
 * Returns null if the asset doesn't exist, is deleted, or has a different generationId.
 * This prevents stale generation attempts from overwriting newer ones.
 */
export async function loadActiveAsset(assetId: string, generationId: string) {
	const asset = await db.query.assets.findFirst({
		where: and(eq(assets.id, assetId), isNull(assets.deletedAt)),
	});

	if (!asset) {
		return null;
	}

	if (asset.generationId !== generationId) {
		return null;
	}

	return asset;
}
