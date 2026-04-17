import { randomUUID } from "node:crypto";
import { auth } from "@clerk/tanstack-react-start/server";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index";
import {
	globalLocationImages,
	globalLocations,
	projectLocationLinks,
} from "@/db/schema";
import { cleanupStorageKeys } from "@/lib/r2-cleanup.server";
import { uploadBuffer } from "@/lib/r2.server";

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function assertAuth() {
	const { userId } = await auth();
	if (!userId) throw new Error("Unauthenticated");
	return { userId };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GlobalLocationWithImages {
	id: string;
	userId: string;
	name: string;
	description: string;
	visualPromptFragment: string;
	primaryImageId: string | null;
	images: Array<{
		id: string;
		url: string;
		storageKey: string | null;
		label: string | null;
	}>;
	createdAt: Date;
	updatedAt: Date;
}

// ---------------------------------------------------------------------------
// createGlobalLocation
// ---------------------------------------------------------------------------

export const createGlobalLocation = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			name: string;
			description?: string;
			visualPromptFragment?: string;
		}) => data,
	)
	.handler(async ({ data: { name, description, visualPromptFragment } }) => {
		const { userId } = await assertAuth();

		const trimmedName = name.trim();
		const trimmedDescription = description?.trim() ?? "";
		const trimmedFragment = visualPromptFragment?.trim() ?? "";

		if (!trimmedName) throw new Error("Location name is required");
		if (trimmedName.length > 100)
			throw new Error("Location name must be 100 characters or less");
		if (trimmedDescription.length > 5000)
			throw new Error("Description must be 5000 characters or less");
		if (trimmedFragment.length > 2000)
			throw new Error("Visual prompt fragment must be 2000 characters or less");

		const [location] = await db
			.insert(globalLocations)
			.values({
				userId,
				name: trimmedName,
				description: trimmedDescription,
				visualPromptFragment: trimmedFragment,
			})
			.returning();

		return location;
	});

// ---------------------------------------------------------------------------
// updateGlobalLocation
// ---------------------------------------------------------------------------

export const updateGlobalLocation = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			locationId: string;
			name?: string;
			description?: string;
			visualPromptFragment?: string;
		}) => data,
	)
	.handler(
		async ({
			data: { locationId, name, description, visualPromptFragment },
		}) => {
			const { userId } = await assertAuth();

			// Validate inputs
			if (name !== undefined && name.trim().length === 0) {
				throw new Error("Location name cannot be empty");
			}
			if (name !== undefined && name.trim().length > 100) {
				throw new Error("Location name must be 100 characters or less");
			}
			if (description !== undefined && description.trim().length > 5000) {
				throw new Error("Description must be 5000 characters or less");
			}
			if (
				visualPromptFragment !== undefined &&
				visualPromptFragment.trim().length > 2000
			) {
				throw new Error(
					"Visual prompt fragment must be 2000 characters or less",
				);
			}

			// Verify ownership
			const existing = await db.query.globalLocations.findFirst({
				where: and(
					eq(globalLocations.id, locationId),
					eq(globalLocations.userId, userId),
					isNull(globalLocations.deletedAt),
				),
			});
			if (!existing) throw new Error("Location not found");

			const [updated] = await db
				.update(globalLocations)
				.set({
					...(name !== undefined && { name: name.trim() }),
					...(description !== undefined && { description: description.trim() }),
					...(visualPromptFragment !== undefined && {
						visualPromptFragment: visualPromptFragment.trim(),
					}),
				})
				.where(eq(globalLocations.id, locationId))
				.returning();

			return updated;
		},
	);

// ---------------------------------------------------------------------------
// deleteGlobalLocation
// ---------------------------------------------------------------------------

export const deleteGlobalLocation = createServerFn({ method: "POST" })
	.inputValidator((data: { locationId: string }) => data)
	.handler(async ({ data: { locationId } }) => {
		const { userId } = await assertAuth();

		await db.transaction(async (tx) => {
			// Verify ownership
			const existing = await tx.query.globalLocations.findFirst({
				where: and(
					eq(globalLocations.id, locationId),
					eq(globalLocations.userId, userId),
					isNull(globalLocations.deletedAt),
				),
			});
			if (!existing) throw new Error("Location not found");

			// Soft-delete location images
			await tx
				.update(globalLocationImages)
				.set({ deletedAt: new Date() })
				.where(
					and(
						eq(globalLocationImages.locationId, locationId),
						isNull(globalLocationImages.deletedAt),
					),
				);

			// Remove project links
			await tx
				.delete(projectLocationLinks)
				.where(eq(projectLocationLinks.globalLocationId, locationId));

			// Soft-delete location
			await tx
				.update(globalLocations)
				.set({ deletedAt: new Date() })
				.where(eq(globalLocations.id, locationId));
		});
	});

// ---------------------------------------------------------------------------
// listGlobalLocations
// ---------------------------------------------------------------------------

export const listGlobalLocations = createServerFn({ method: "GET" })
	.inputValidator((data?: Record<string, never>) => data ?? {})
	.handler(async () => {
		const { userId } = await assertAuth();

		const locations = await db.query.globalLocations.findMany({
			where: and(
				eq(globalLocations.userId, userId),
				isNull(globalLocations.deletedAt),
			),
			orderBy: (locs, { desc }) => [desc(locs.updatedAt)],
		});

		// Load images for all locations
		const locationIds = locations.map((l) => l.id);
		const images =
			locationIds.length > 0
				? await db.query.globalLocationImages.findMany({
						where: isNull(globalLocationImages.deletedAt),
					})
				: [];

		// Filter images to only those belonging to our locations
		const relevantImages = images.filter((img) =>
			locationIds.includes(img.locationId),
		);

		// Group images by location
		const imagesByLocation = new Map<string, typeof relevantImages>();
		for (const img of relevantImages) {
			const list = imagesByLocation.get(img.locationId) ?? [];
			list.push(img);
			imagesByLocation.set(img.locationId, list);
		}

		return locations.map(
			(l): GlobalLocationWithImages => ({
				id: l.id,
				userId: l.userId,
				name: l.name,
				description: l.description,
				visualPromptFragment: l.visualPromptFragment,
				primaryImageId: l.primaryImageId,
				images: imagesByLocation.get(l.id) ?? [],
				createdAt: l.createdAt,
				updatedAt: l.updatedAt,
			}),
		);
	});

// ---------------------------------------------------------------------------
// getGlobalLocation
// ---------------------------------------------------------------------------

export const getGlobalLocation = createServerFn({ method: "GET" })
	.inputValidator((data: { locationId: string }) => data)
	.handler(async ({ data: { locationId } }) => {
		const { userId } = await assertAuth();

		const location = await db.query.globalLocations.findFirst({
			where: and(
				eq(globalLocations.id, locationId),
				eq(globalLocations.userId, userId),
				isNull(globalLocations.deletedAt),
			),
		});
		if (!location) throw new Error("Location not found");

		const images = await db.query.globalLocationImages.findMany({
			where: and(
				eq(globalLocationImages.locationId, locationId),
				isNull(globalLocationImages.deletedAt),
			),
		});

		return {
			...location,
			images,
		} as GlobalLocationWithImages;
	});

// ---------------------------------------------------------------------------
// setGlobalLocationPrimaryImage
// ---------------------------------------------------------------------------

export const setGlobalLocationPrimaryImage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { locationId: string; imageId: string | null }) => data,
	)
	.handler(async ({ data: { locationId, imageId } }) => {
		const { userId } = await assertAuth();

		await db.transaction(async (tx) => {
			// Verify ownership
			const location = await tx.query.globalLocations.findFirst({
				where: and(
					eq(globalLocations.id, locationId),
					eq(globalLocations.userId, userId),
					isNull(globalLocations.deletedAt),
				),
			});
			if (!location) throw new Error("Location not found");

			// Verify image exists if setting one
			if (imageId) {
				const image = await tx.query.globalLocationImages.findFirst({
					where: and(
						eq(globalLocationImages.id, imageId),
						eq(globalLocationImages.locationId, locationId),
						isNull(globalLocationImages.deletedAt),
					),
				});
				if (!image) throw new Error("Image not found");
			}

			await tx
				.update(globalLocations)
				.set({ primaryImageId: imageId })
				.where(eq(globalLocations.id, locationId));
		});
	});

// ---------------------------------------------------------------------------
// uploadGlobalLocationImage
// ---------------------------------------------------------------------------

export const uploadGlobalLocationImage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			locationId: string;
			fileBase64: string;
			fileName: string;
			label?: string;
		}) => data,
	)
	.handler(async ({ data: { locationId, fileBase64, fileName, label } }) => {
		const { userId } = await assertAuth();

		// Verify ownership
		const location = await db.query.globalLocations.findFirst({
			where: and(
				eq(globalLocations.id, locationId),
				eq(globalLocations.userId, userId),
				isNull(globalLocations.deletedAt),
			),
		});
		if (!location) throw new Error("Location not found");

		const base64Data = fileBase64.replace(/^data:image\/\w+;base64,/, "");
		const buffer = Buffer.from(base64Data, "base64");
		const MAX_SIZE_BYTES = 20 * 1024 * 1024;
		if (buffer.length > MAX_SIZE_BYTES) {
			throw new Error("File size exceeds 20MB limit");
		}

		const ext = fileName.split(".").pop()?.toLowerCase() ?? "jpg";
		const contentTypeMap: Record<string, string> = {
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			png: "image/png",
			webp: "image/webp",
			gif: "image/gif",
		};
		const contentType = contentTypeMap[ext] ?? "image/jpeg";
		const uniqueId = randomUUID();
		const storageKey = `users/${userId}/locations/${locationId}/${uniqueId}.${ext}`;
		const url = await uploadBuffer(buffer, storageKey, contentType);

		const [image] = await db
			.insert(globalLocationImages)
			.values({
				locationId,
				url,
				storageKey,
				label: label?.trim(),
			})
			.returning();

		// Set as primary if first image
		if (!location.primaryImageId) {
			await db
				.update(globalLocations)
				.set({ primaryImageId: image.id })
				.where(eq(globalLocations.id, locationId));
		}

		return image;
	});

// ---------------------------------------------------------------------------
// removeGlobalLocationImage
// ---------------------------------------------------------------------------

export const removeGlobalLocationImage = createServerFn({ method: "POST" })
	.inputValidator((data: { locationId: string; imageId: string }) => data)
	.handler(async ({ data: { locationId, imageId } }) => {
		const { userId } = await assertAuth();

		const storageKey = await db.transaction(async (tx) => {
			// Verify ownership
			const location = await tx.query.globalLocations.findFirst({
				where: and(
					eq(globalLocations.id, locationId),
					eq(globalLocations.userId, userId),
					isNull(globalLocations.deletedAt),
				),
			});
			if (!location) throw new Error("Location not found");

			// Find and soft-delete image
			const image = await tx.query.globalLocationImages.findFirst({
				where: and(
					eq(globalLocationImages.id, imageId),
					eq(globalLocationImages.locationId, locationId),
					isNull(globalLocationImages.deletedAt),
				),
			});
			if (!image) throw new Error("Image not found");

			await tx
				.update(globalLocationImages)
				.set({ deletedAt: new Date() })
				.where(eq(globalLocationImages.id, imageId));

			// Clear primary if this was primary
			if (location.primaryImageId === imageId) {
				await tx
					.update(globalLocations)
					.set({ primaryImageId: null })
					.where(eq(globalLocations.id, locationId));
			}

			return image.storageKey;
		});

		// R2 cleanup after transaction
		await cleanupStorageKeys([storageKey]);
	});

// ---------------------------------------------------------------------------
// importLocationToProject
// ---------------------------------------------------------------------------

export const importLocationToProject = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { locationId: string; projectId: string; defaultEnabled?: boolean }) => data,
	)
	.handler(async ({ data: { locationId, projectId, defaultEnabled = true } }) => {
		const { userId } = await assertAuth();

		// Verify location ownership
		const location = await db.query.globalLocations.findFirst({
			where: and(
				eq(globalLocations.id, locationId),
				eq(globalLocations.userId, userId),
				isNull(globalLocations.deletedAt),
			),
		});
		if (!location) throw new Error("Location not found");

		// Check if already linked
		const existingLink = await db.query.projectLocationLinks.findFirst({
			where: and(
				eq(projectLocationLinks.projectId, projectId),
				eq(projectLocationLinks.globalLocationId, locationId),
			),
		});
		if (existingLink) {
			return existingLink;
		}

		const [link] = await db
			.insert(projectLocationLinks)
			.values({
				projectId,
				globalLocationId: locationId,
				defaultEnabled,
			})
			.returning();

		return link;
	});

// ---------------------------------------------------------------------------
// removeLocationFromProject
// ---------------------------------------------------------------------------

export const removeLocationFromProject = createServerFn({ method: "POST" })
	.inputValidator((data: { locationId: string; projectId: string }) => data)
	.handler(async ({ data: { locationId, projectId } }) => {
		const { userId } = await assertAuth();

		// Verify location ownership
		const location = await db.query.globalLocations.findFirst({
			where: and(
				eq(globalLocations.id, locationId),
				eq(globalLocations.userId, userId),
				isNull(globalLocations.deletedAt),
			),
		});
		if (!location) throw new Error("Location not found");

		await db
			.delete(projectLocationLinks)
			.where(
				and(
					eq(projectLocationLinks.projectId, projectId),
					eq(projectLocationLinks.globalLocationId, locationId),
				),
			);
	});

// ---------------------------------------------------------------------------
// listProjectGlobalLocations
// ---------------------------------------------------------------------------

export const listProjectGlobalLocations = createServerFn({ method: "GET" })
	.inputValidator((data: { projectId: string }) => data)
	.handler(async ({ data: { projectId } }) => {
		const { userId } = await assertAuth();

		// Get all linked locations for this project
		const links = await db.query.projectLocationLinks.findMany({
			where: eq(projectLocationLinks.projectId, projectId),
		});

		if (links.length === 0) return [];

		const locationIds = links.map((l) => l.globalLocationId);

		// Load locations (verify they belong to user and not deleted)
		const locations = await db.query.globalLocations.findMany({
			where: and(
				eq(globalLocations.userId, userId),
				isNull(globalLocations.deletedAt),
			),
		});

		// Filter to linked locations only
		const linkedLocations = locations.filter((l) =>
			locationIds.includes(l.id),
		);

		// Load images
		const images = await db.query.globalLocationImages.findMany({
			where: isNull(globalLocationImages.deletedAt),
		});
		const relevantImages = images.filter((img) =>
			locationIds.includes(img.locationId),
		);

		const imagesByLocation = new Map<string, typeof relevantImages>();
		for (const img of relevantImages) {
			const list = imagesByLocation.get(img.locationId) ?? [];
			list.push(img);
			imagesByLocation.set(img.locationId, list);
		}

		// Build link map for defaultEnabled
		const linkMap = new Map(links.map((l) => [l.globalLocationId, l]));

		return linkedLocations.map((l) => ({
			...l,
			images: imagesByLocation.get(l.id) ?? [],
			defaultEnabled: linkMap.get(l.id)?.defaultEnabled ?? true,
		}));
	});
