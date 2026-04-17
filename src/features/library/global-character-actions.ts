import { randomUUID } from "node:crypto";
import { auth } from "@clerk/tanstack-react-start/server";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index";
import {
	globalCharacterImages,
	globalCharacters,
	projectCharacterLinks,
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

export interface GlobalCharacterWithImages {
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
// createGlobalCharacter
// ---------------------------------------------------------------------------

export const createGlobalCharacter = createServerFn({ method: "POST" })
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

		if (!trimmedName) throw new Error("Character name is required");
		if (trimmedName.length > 100)
			throw new Error("Character name must be 100 characters or less");
		if (trimmedDescription.length > 5000)
			throw new Error("Description must be 5000 characters or less");
		if (trimmedFragment.length > 2000)
			throw new Error("Visual prompt fragment must be 2000 characters or less");

		const [character] = await db
			.insert(globalCharacters)
			.values({
				userId,
				name: trimmedName,
				description: trimmedDescription,
				visualPromptFragment: trimmedFragment,
			})
			.returning();

		return character;
	});

// ---------------------------------------------------------------------------
// updateGlobalCharacter
// ---------------------------------------------------------------------------

export const updateGlobalCharacter = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			characterId: string;
			name?: string;
			description?: string;
			visualPromptFragment?: string;
		}) => data,
	)
	.handler(
		async ({
			data: { characterId, name, description, visualPromptFragment },
		}) => {
			const { userId } = await assertAuth();

			// Validate inputs
			if (name !== undefined && name.trim().length === 0) {
				throw new Error("Character name cannot be empty");
			}
			if (name !== undefined && name.trim().length > 100) {
				throw new Error("Character name must be 100 characters or less");
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
			const existing = await db.query.globalCharacters.findFirst({
				where: and(
					eq(globalCharacters.id, characterId),
					eq(globalCharacters.userId, userId),
					isNull(globalCharacters.deletedAt),
				),
			});
			if (!existing) throw new Error("Character not found");

			const [updated] = await db
				.update(globalCharacters)
				.set({
					...(name !== undefined && { name: name.trim() }),
					...(description !== undefined && { description: description.trim() }),
					...(visualPromptFragment !== undefined && {
						visualPromptFragment: visualPromptFragment.trim(),
					}),
				})
				.where(eq(globalCharacters.id, characterId))
				.returning();

			return updated;
		},
	);

// ---------------------------------------------------------------------------
// deleteGlobalCharacter
// ---------------------------------------------------------------------------

export const deleteGlobalCharacter = createServerFn({ method: "POST" })
	.inputValidator((data: { characterId: string }) => data)
	.handler(async ({ data: { characterId } }) => {
		const { userId } = await assertAuth();

		await db.transaction(async (tx) => {
			// Verify ownership
			const existing = await tx.query.globalCharacters.findFirst({
				where: and(
					eq(globalCharacters.id, characterId),
					eq(globalCharacters.userId, userId),
					isNull(globalCharacters.deletedAt),
				),
			});
			if (!existing) throw new Error("Character not found");

			// Soft-delete character images
			await tx
				.update(globalCharacterImages)
				.set({ deletedAt: new Date() })
				.where(
					and(
						eq(globalCharacterImages.characterId, characterId),
						isNull(globalCharacterImages.deletedAt),
					),
				);

			// Remove project links
			await tx
				.delete(projectCharacterLinks)
				.where(eq(projectCharacterLinks.globalCharacterId, characterId));

			// Soft-delete character
			await tx
				.update(globalCharacters)
				.set({ deletedAt: new Date() })
				.where(eq(globalCharacters.id, characterId));
		});
	});

// ---------------------------------------------------------------------------
// listGlobalCharacters
// ---------------------------------------------------------------------------

export const listGlobalCharacters = createServerFn({ method: "GET" })
	.inputValidator((data?: Record<string, never>) => data ?? {})
	.handler(async () => {
		const { userId } = await assertAuth();

		const characters = await db.query.globalCharacters.findMany({
			where: and(
				eq(globalCharacters.userId, userId),
				isNull(globalCharacters.deletedAt),
			),
			orderBy: (chars, { desc }) => [desc(chars.updatedAt)],
		});

		// Load images for all characters
		const characterIds = characters.map((c) => c.id);
		const images =
			characterIds.length > 0
				? await db.query.globalCharacterImages.findMany({
						where: and(
							isNull(globalCharacterImages.deletedAt),
							// Filter to our character IDs - use inArray when available
						),
					})
				: [];

		// Filter images to only those belonging to our characters
		const relevantImages = images.filter((img) =>
			characterIds.includes(img.characterId),
		);

		// Group images by character
		const imagesByCharacter = new Map<string, typeof relevantImages>();
		for (const img of relevantImages) {
			const list = imagesByCharacter.get(img.characterId) ?? [];
			list.push(img);
			imagesByCharacter.set(img.characterId, list);
		}

		return characters.map(
			(c): GlobalCharacterWithImages => ({
				id: c.id,
				userId: c.userId,
				name: c.name,
				description: c.description,
				visualPromptFragment: c.visualPromptFragment,
				primaryImageId: c.primaryImageId,
				images: imagesByCharacter.get(c.id) ?? [],
				createdAt: c.createdAt,
				updatedAt: c.updatedAt,
			}),
		);
	});

// ---------------------------------------------------------------------------
// getGlobalCharacter
// ---------------------------------------------------------------------------

export const getGlobalCharacter = createServerFn({ method: "GET" })
	.inputValidator((data: { characterId: string }) => data)
	.handler(async ({ data: { characterId } }) => {
		const { userId } = await assertAuth();

		const character = await db.query.globalCharacters.findFirst({
			where: and(
				eq(globalCharacters.id, characterId),
				eq(globalCharacters.userId, userId),
				isNull(globalCharacters.deletedAt),
			),
		});
		if (!character) throw new Error("Character not found");

		const images = await db.query.globalCharacterImages.findMany({
			where: and(
				eq(globalCharacterImages.characterId, characterId),
				isNull(globalCharacterImages.deletedAt),
			),
		});

		return {
			...character,
			images,
		} as GlobalCharacterWithImages;
	});

// ---------------------------------------------------------------------------
// setGlobalCharacterPrimaryImage
// ---------------------------------------------------------------------------

export const setGlobalCharacterPrimaryImage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { characterId: string; imageId: string | null }) => data,
	)
	.handler(async ({ data: { characterId, imageId } }) => {
		const { userId } = await assertAuth();

		await db.transaction(async (tx) => {
			// Verify ownership
			const character = await tx.query.globalCharacters.findFirst({
				where: and(
					eq(globalCharacters.id, characterId),
					eq(globalCharacters.userId, userId),
					isNull(globalCharacters.deletedAt),
				),
			});
			if (!character) throw new Error("Character not found");

			// Verify image exists if setting one
			if (imageId) {
				const image = await tx.query.globalCharacterImages.findFirst({
					where: and(
						eq(globalCharacterImages.id, imageId),
						eq(globalCharacterImages.characterId, characterId),
						isNull(globalCharacterImages.deletedAt),
					),
				});
				if (!image) throw new Error("Image not found");
			}

			await tx
				.update(globalCharacters)
				.set({ primaryImageId: imageId })
				.where(eq(globalCharacters.id, characterId));
		});
	});

// ---------------------------------------------------------------------------
// uploadGlobalCharacterImage
// ---------------------------------------------------------------------------

export const uploadGlobalCharacterImage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			characterId: string;
			fileBase64: string;
			fileName: string;
			label?: string;
		}) => data,
	)
	.handler(async ({ data: { characterId, fileBase64, fileName, label } }) => {
		const { userId } = await assertAuth();

		// Verify ownership
		const character = await db.query.globalCharacters.findFirst({
			where: and(
				eq(globalCharacters.id, characterId),
				eq(globalCharacters.userId, userId),
				isNull(globalCharacters.deletedAt),
			),
		});
		if (!character) throw new Error("Character not found");

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
		const storageKey = `users/${userId}/characters/${characterId}/${uniqueId}.${ext}`;
		const url = await uploadBuffer(buffer, storageKey, contentType);

		const [image] = await db
			.insert(globalCharacterImages)
			.values({
				characterId,
				url,
				storageKey,
				label: label?.trim(),
			})
			.returning();

		// Set as primary if first image
		if (!character.primaryImageId) {
			await db
				.update(globalCharacters)
				.set({ primaryImageId: image.id })
				.where(eq(globalCharacters.id, characterId));
		}

		return image;
	});

// ---------------------------------------------------------------------------
// removeGlobalCharacterImage
// ---------------------------------------------------------------------------

export const removeGlobalCharacterImage = createServerFn({ method: "POST" })
	.inputValidator((data: { characterId: string; imageId: string }) => data)
	.handler(async ({ data: { characterId, imageId } }) => {
		const { userId } = await assertAuth();

		const storageKey = await db.transaction(async (tx) => {
			// Verify ownership
			const character = await tx.query.globalCharacters.findFirst({
				where: and(
					eq(globalCharacters.id, characterId),
					eq(globalCharacters.userId, userId),
					isNull(globalCharacters.deletedAt),
				),
			});
			if (!character) throw new Error("Character not found");

			// Find and soft-delete image
			const image = await tx.query.globalCharacterImages.findFirst({
				where: and(
					eq(globalCharacterImages.id, imageId),
					eq(globalCharacterImages.characterId, characterId),
					isNull(globalCharacterImages.deletedAt),
				),
			});
			if (!image) throw new Error("Image not found");

			await tx
				.update(globalCharacterImages)
				.set({ deletedAt: new Date() })
				.where(eq(globalCharacterImages.id, imageId));

			// Clear primary if this was primary
			if (character.primaryImageId === imageId) {
				await tx
					.update(globalCharacters)
					.set({ primaryImageId: null })
					.where(eq(globalCharacters.id, characterId));
			}

			return image.storageKey;
		});

		// R2 cleanup after transaction
		await cleanupStorageKeys([storageKey]);
	});

// ---------------------------------------------------------------------------
// importCharacterToProject
// ---------------------------------------------------------------------------

export const importCharacterToProject = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { characterId: string; projectId: string; defaultEnabled?: boolean }) => data,
	)
	.handler(async ({ data: { characterId, projectId, defaultEnabled = true } }) => {
		const { userId } = await assertAuth();

		// Verify character ownership
		const character = await db.query.globalCharacters.findFirst({
			where: and(
				eq(globalCharacters.id, characterId),
				eq(globalCharacters.userId, userId),
				isNull(globalCharacters.deletedAt),
			),
		});
		if (!character) throw new Error("Character not found");

		// Check if already linked
		const existingLink = await db.query.projectCharacterLinks.findFirst({
			where: and(
				eq(projectCharacterLinks.projectId, projectId),
				eq(projectCharacterLinks.globalCharacterId, characterId),
			),
		});
		if (existingLink) {
			return existingLink;
		}

		const [link] = await db
			.insert(projectCharacterLinks)
			.values({
				projectId,
				globalCharacterId: characterId,
				defaultEnabled,
			})
			.returning();

		return link;
	});

// ---------------------------------------------------------------------------
// removeCharacterFromProject
// ---------------------------------------------------------------------------

export const removeCharacterFromProject = createServerFn({ method: "POST" })
	.inputValidator((data: { characterId: string; projectId: string }) => data)
	.handler(async ({ data: { characterId, projectId } }) => {
		const { userId } = await assertAuth();

		// Verify character ownership
		const character = await db.query.globalCharacters.findFirst({
			where: and(
				eq(globalCharacters.id, characterId),
				eq(globalCharacters.userId, userId),
				isNull(globalCharacters.deletedAt),
			),
		});
		if (!character) throw new Error("Character not found");

		await db
			.delete(projectCharacterLinks)
			.where(
				and(
					eq(projectCharacterLinks.projectId, projectId),
					eq(projectCharacterLinks.globalCharacterId, characterId),
				),
			);
	});

// ---------------------------------------------------------------------------
// listProjectGlobalCharacters
// ---------------------------------------------------------------------------

export const listProjectGlobalCharacters = createServerFn({ method: "GET" })
	.inputValidator((data: { projectId: string }) => data)
	.handler(async ({ data: { projectId } }) => {
		const { userId } = await assertAuth();

		// Get all linked characters for this project
		const links = await db.query.projectCharacterLinks.findMany({
			where: eq(projectCharacterLinks.projectId, projectId),
		});

		if (links.length === 0) return [];

		const characterIds = links.map((l) => l.globalCharacterId);

		// Load characters (verify they belong to user and not deleted)
		const characters = await db.query.globalCharacters.findMany({
			where: and(
				eq(globalCharacters.userId, userId),
				isNull(globalCharacters.deletedAt),
			),
		});

		// Filter to linked characters only
		const linkedCharacters = characters.filter((c) =>
			characterIds.includes(c.id),
		);

		// Load images
		const images = await db.query.globalCharacterImages.findMany({
			where: isNull(globalCharacterImages.deletedAt),
		});
		const relevantImages = images.filter((img) =>
			characterIds.includes(img.characterId),
		);

		const imagesByCharacter = new Map<string, typeof relevantImages>();
		for (const img of relevantImages) {
			const list = imagesByCharacter.get(img.characterId) ?? [];
			list.push(img);
			imagesByCharacter.set(img.characterId, list);
		}

		// Build link map for defaultEnabled
		const linkMap = new Map(links.map((l) => [l.globalCharacterId, l]));

		return linkedCharacters.map((c) => ({
			...c,
			images: imagesByCharacter.get(c.id) ?? [],
			defaultEnabled: linkMap.get(c.id)?.defaultEnabled ?? true,
		}));
	});
