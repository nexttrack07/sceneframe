import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index";
import { projects, referenceImages } from "@/db/schema";
import { assertProjectOwner } from "@/lib/assert-project-owner.server";
import { deleteObject } from "@/lib/r2.server";
import type { Character, ProjectSettings } from "./project-types";

// ---------------------------------------------------------------------------
// createCharacter
// ---------------------------------------------------------------------------

export const createCharacter = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			name: string;
			description: string;
			visualPromptFragment: string;
		}) => data,
	)
	.handler(
		async ({
			data: { projectId, name, description, visualPromptFragment },
		}) => {
			await assertProjectOwner(projectId, "error");

			// Validate inputs
			const trimmedName = name.trim();
			const trimmedDescription = description.trim();
			const trimmedFragment = visualPromptFragment.trim();
			if (!trimmedName) throw new Error("Character name is required");
			if (!trimmedFragment)
				throw new Error("Visual prompt fragment is required");
			if (trimmedName.length > 100)
				throw new Error("Character name must be 100 characters or less");
			if (trimmedDescription.length > 5000)
				throw new Error("Description must be 5000 characters or less");
			if (trimmedFragment.length > 2000)
				throw new Error(
					"Visual prompt fragment must be 2000 characters or less",
				);

			const character: Character = {
				id: randomUUID(),
				name: trimmedName,
				description: trimmedDescription,
				visualPromptFragment: trimmedFragment,
				referenceImageIds: [],
			};

			// Use transaction to ensure atomic read-modify-write
			await db.transaction(async (tx) => {
				const project = await tx.query.projects.findFirst({
					where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
				});
				if (!project) throw new Error("Project not found");

				const settings = (project.settings ?? {}) as ProjectSettings;
				const characters = [...(settings.characters ?? []), character];

				await tx
					.update(projects)
					.set({ settings: { ...settings, characters } })
					.where(eq(projects.id, projectId));
			});

			return character;
		},
	);

// ---------------------------------------------------------------------------
// updateCharacter
// ---------------------------------------------------------------------------

export const updateCharacter = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			characterId: string;
			name?: string;
			description?: string;
			visualPromptFragment?: string;
		}) => data,
	)
	.handler(
		async ({
			data: { projectId, characterId, name, description, visualPromptFragment },
		}) => {
			await assertProjectOwner(projectId, "error");

			// Validate inputs if provided
			if (name !== undefined && name.trim().length === 0) {
				throw new Error("Character name cannot be empty");
			}
			if (name !== undefined && name.trim().length > 100) {
				throw new Error("Character name must be 100 characters or less");
			}
			if (
				visualPromptFragment !== undefined &&
				visualPromptFragment.trim().length === 0
			) {
				throw new Error("Visual prompt fragment cannot be empty");
			}
			if (
				visualPromptFragment !== undefined &&
				visualPromptFragment.trim().length > 2000
			) {
				throw new Error(
					"Visual prompt fragment must be 2000 characters or less",
				);
			}
			if (description !== undefined && description.trim().length > 5000) {
				throw new Error("Description must be 5000 characters or less");
			}

			// Use transaction to ensure atomic read-modify-write
			const updated = await db.transaction(async (tx) => {
				const project = await tx.query.projects.findFirst({
					where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
				});
				if (!project) throw new Error("Project not found");

				const settings = (project.settings ?? {}) as ProjectSettings;
				const characters = [...(settings.characters ?? [])];
				const idx = characters.findIndex((c) => c.id === characterId);
				if (idx === -1) throw new Error("Character not found");

				const updatedChar: Character = {
					...characters[idx],
					...(name !== undefined && { name: name.trim() }),
					...(description !== undefined && { description: description.trim() }),
					...(visualPromptFragment !== undefined && {
						visualPromptFragment: visualPromptFragment.trim(),
					}),
				};
				characters[idx] = updatedChar;

				await tx
					.update(projects)
					.set({ settings: { ...settings, characters } })
					.where(eq(projects.id, projectId));

				return updatedChar;
			});

			return updated;
		},
	);

// ---------------------------------------------------------------------------
// deleteCharacter
// ---------------------------------------------------------------------------

export const deleteCharacter = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string; characterId: string }) => data)
	.handler(async ({ data: { projectId, characterId } }) => {
		await assertProjectOwner(projectId, "error");

		// Use transaction to ensure atomic operations
		await db.transaction(async (tx) => {
			const project = await tx.query.projects.findFirst({
				where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
			});
			if (!project) throw new Error("Project not found");

			const settings = (project.settings ?? {}) as ProjectSettings;
			const characters = [...(settings.characters ?? [])];
			const idx = characters.findIndex((c) => c.id === characterId);
			if (idx === -1) throw new Error("Character not found");

			// Remove character from array
			characters.splice(idx, 1);

			// Soft-delete associated reference images
			await tx
				.update(referenceImages)
				.set({ deletedAt: new Date() })
				.where(
					and(
						eq(referenceImages.projectId, projectId),
						eq(referenceImages.characterId, characterId),
						isNull(referenceImages.deletedAt),
					),
				);

			// Update project settings
			await tx
				.update(projects)
				.set({ settings: { ...settings, characters } })
				.where(eq(projects.id, projectId));
		});
	});

// ---------------------------------------------------------------------------
// listCharacters
// ---------------------------------------------------------------------------

export const listCharacters = createServerFn({ method: "GET" })
	.inputValidator((data: { projectId: string }) => data)
	.handler(async ({ data: { projectId } }) => {
		const { project } = await assertProjectOwner(projectId, "error");

		const settings = (project.settings ?? {}) as ProjectSettings;
		const characters = settings.characters ?? [];

		// Load reference images for all characters
		const charImages = await db.query.referenceImages.findMany({
			where: and(
				eq(referenceImages.projectId, projectId),
				eq(referenceImages.type, "character"),
				isNull(referenceImages.deletedAt),
			),
		});

		// Map images to characters
		const imagesByCharacter = new Map<string, typeof charImages>();
		for (const img of charImages) {
			if (!img.characterId) continue;
			const list = imagesByCharacter.get(img.characterId) ?? [];
			list.push(img);
			imagesByCharacter.set(img.characterId, list);
		}

		return characters.map((c) => ({
			...c,
			images: imagesByCharacter.get(c.id) ?? [],
		}));
	});

// ---------------------------------------------------------------------------
// addCharacterImage
// ---------------------------------------------------------------------------

export const addCharacterImage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			characterId: string;
			url: string;
			storageKey?: string;
			label?: string;
		}) => data,
	)
	.handler(
		async ({ data: { projectId, characterId, url, storageKey, label } }) => {
			await assertProjectOwner(projectId, "error");

			// Validate URL
			const trimmedUrl = url?.trim();
			if (!trimmedUrl) throw new Error("Image URL is required");
			try {
				const parsed = new URL(trimmedUrl);
				if (!["http:", "https:"].includes(parsed.protocol)) {
					throw new Error("Image URL must use http or https protocol");
				}
			} catch {
				throw new Error("Invalid image URL");
			}
			if (trimmedUrl.length > 2000)
				throw new Error("Image URL must be 2000 characters or less");

			// Validate optional fields
			if (label !== undefined && label.trim().length > 200)
				throw new Error("Label must be 200 characters or less");
			if (storageKey !== undefined && storageKey.length > 500)
				throw new Error("Storage key must be 500 characters or less");

			// Use transaction to ensure atomic operations
			const image = await db.transaction(async (tx) => {
				const project = await tx.query.projects.findFirst({
					where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
				});
				if (!project) throw new Error("Project not found");

				// Verify character exists
				const settings = (project.settings ?? {}) as ProjectSettings;
				const characters = [...(settings.characters ?? [])];
				const character = characters.find((c) => c.id === characterId);
				if (!character) throw new Error("Character not found");

				// Create reference image
				const [inserted] = await tx
					.insert(referenceImages)
					.values({
						projectId,
						characterId,
						type: "character",
						url: trimmedUrl,
						storageKey,
						label: label?.trim(),
					})
					.returning();

				// Update character's referenceImageIds
				character.referenceImageIds = [
					...(character.referenceImageIds ?? []),
					inserted.id,
				];

				await tx
					.update(projects)
					.set({ settings: { ...settings, characters } })
					.where(eq(projects.id, projectId));

				return inserted;
			});

			return image;
		},
	);

// ---------------------------------------------------------------------------
// removeCharacterImage
// ---------------------------------------------------------------------------

export const removeCharacterImage = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string; imageId: string }) => data)
	.handler(async ({ data: { projectId, imageId } }) => {
		await assertProjectOwner(projectId, "error");

		// Use transaction for atomic read-then-delete
		const storageKey = await db.transaction(async (tx) => {
			// Find image inside transaction to avoid TOCTOU race
			const image = await tx.query.referenceImages.findFirst({
				where: and(
					eq(referenceImages.id, imageId),
					eq(referenceImages.projectId, projectId),
					isNull(referenceImages.deletedAt),
				),
			});
			if (!image) throw new Error("Image not found");

			// Soft-delete the image
			await tx
				.update(referenceImages)
				.set({ deletedAt: new Date() })
				.where(eq(referenceImages.id, imageId));

			// Remove from character's referenceImageIds if applicable
			if (image.characterId) {
				const project = await tx.query.projects.findFirst({
					where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
				});
				if (!project) throw new Error("Project not found");

				const settings = (project.settings ?? {}) as ProjectSettings;
				const characters = [...(settings.characters ?? [])];
				const character = characters.find((c) => c.id === image.characterId);
				if (character?.referenceImageIds) {
					character.referenceImageIds = character.referenceImageIds.filter(
						(id) => id !== imageId,
					);
					await tx
						.update(projects)
						.set({ settings: { ...settings, characters } })
						.where(eq(projects.id, projectId));
				}
			}

			return image.storageKey;
		});

		// Best-effort R2 cleanup (outside transaction)
		if (storageKey) {
			deleteObject(storageKey).catch((err) =>
				console.error(
					`Failed to delete character image from R2 (imageId=${imageId}, key=${storageKey}):`,
					err,
				),
			);
		}
	});
