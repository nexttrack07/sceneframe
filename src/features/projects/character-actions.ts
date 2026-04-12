import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { projects, referenceImages } from "@/db/schema";
import {
	generateImageSync,
	getImageProviderApiKey,
} from "@/features/projects/image-generation-provider.server";
import {
	buildImageModelInput,
	determineImageGenerationMode,
	getDefaultModelOptions,
	getImageOutputFormat,
} from "@/features/projects/image-models";
import { assertProjectOwner } from "@/lib/assert-project-owner.server";
import { cleanupStorageKeys } from "@/lib/r2-cleanup.server";
import { uploadBuffer, uploadFromUrl } from "@/lib/r2.server";
import { getUserApiKey } from "./image-generation-helpers.server";
import { normalizeProjectSettings } from "./project-normalize";
import type {
	Character,
	CharacterWithImages,
	ProjectSettings,
	ShotPromptContextSettings,
} from "./project-types";

const REPLICATE_TIMEOUT_MS = 60_000;
const REFERENCE_PROMPT_MAX_OUTPUT_TOKENS = 4096;

// ---------------------------------------------------------------------------
// createCharacter
// ---------------------------------------------------------------------------

export const createCharacter = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			name: string;
			description: string;
			visualPromptFragment?: string;
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
			const trimmedFragment = visualPromptFragment?.trim() ?? "";
			if (!trimmedName) throw new Error("Character name is required");
			if (trimmedName.length > 100)
				throw new Error("Character name must be 100 characters or less");
			if (trimmedDescription.length > 5000)
				throw new Error("Description must be 5000 characters or less");
			if (trimmedFragment && trimmedFragment.length > 2000)
				throw new Error(
					"Visual prompt fragment must be 2000 characters or less",
				);

			const character: Character = {
				id: randomUUID(),
				name: trimmedName,
				description: trimmedDescription,
				visualPromptFragment: trimmedFragment,
				referenceImageIds: [],
				primaryImageId: null,
				defaultEnabled: true,
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

		return characters.map(
			(c): CharacterWithImages => ({
				...c,
				images: imagesByCharacter.get(c.id) ?? [],
			}),
		);
	});

export const setCharacterPrimaryImage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			characterId: string;
			imageId: string | null;
		}) => data,
	)
	.handler(async ({ data: { projectId, characterId, imageId } }) => {
		await assertProjectOwner(projectId, "error");

		await db.transaction(async (tx) => {
			const project = await tx.query.projects.findFirst({
				where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
			});
			if (!project) throw new Error("Project not found");

			const settings = (project.settings ?? {}) as ProjectSettings;
			const characters = [...(settings.characters ?? [])];
			const idx = characters.findIndex((c) => c.id === characterId);
			if (idx === -1) throw new Error("Character not found");

			if (imageId) {
				const image = await tx.query.referenceImages.findFirst({
					where: and(
						eq(referenceImages.id, imageId),
						eq(referenceImages.projectId, projectId),
						eq(referenceImages.characterId, characterId),
						isNull(referenceImages.deletedAt),
					),
				});
				if (!image) throw new Error("Character image not found");
			}

			characters[idx] = {
				...characters[idx],
				primaryImageId: imageId,
			};

			await tx
				.update(projects)
				.set({ settings: { ...settings, characters } })
				.where(eq(projects.id, projectId));
		});
	});

export const uploadCharacterReferenceImage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			characterId: string;
			fileBase64: string;
			fileName: string;
			label?: string;
		}) => data,
	)
	.handler(
		async ({
			data: { projectId, characterId, fileBase64, fileName, label },
		}) => {
			await assertProjectOwner(projectId, "error");

			const project = await db.query.projects.findFirst({
				where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
			});
			if (!project) throw new Error("Project not found");

			const settings = (project.settings ?? {}) as ProjectSettings;
			const character = (settings.characters ?? []).find(
				(entry) => entry.id === characterId,
			);
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
			const storageKey = `projects/${projectId}/characters/${characterId}/${uniqueId}.${ext}`;
			const url = await uploadBuffer(buffer, storageKey, contentType);

			const image = await addCharacterImage({
				data: {
					projectId,
					characterId,
					url,
					storageKey,
					label,
				},
			});

			if (!character.primaryImageId) {
				await setCharacterPrimaryImage({
					data: { projectId, characterId, imageId: image.id },
				});
			}

			return image;
		},
	);

export const generateCharacterPrompt = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			name: string;
			description?: string;
			referenceImageData?: string;
		}) => data,
	)
	.handler(
		async ({ data: { projectId, name, description, referenceImageData } }) => {
			const { userId, project } = await assertProjectOwner(projectId, "error");
			const apiKey = await getUserApiKey(userId);
			const settings = normalizeProjectSettings(project.settings);
			const intake = settings?.intake;

			const systemPrompt = `You are an expert visual prompt writer creating a reusable character reference prompt for a video project.

Write one compact but precise visual prompt fragment for the character below.

Project context:
- Project: ${project.name}
- Concept: ${intake?.concept ?? "Not specified"}
- Visual style: ${intake?.style?.join(", ") ?? "Not specified"}
- Mood: ${intake?.mood?.join(", ") ?? "Not specified"}
- Audience: ${intake?.audience ?? "Not specified"}

Character:
- Name: ${name}
- Description: ${description?.trim() || "Not specified"}

Rules:
- Match the project's visual style exactly.
- Focus on stable visual identity: age, facial structure, hair, clothing silhouette, materials, accessories, palette, and overall vibe.
- If a reference image is attached, use it as the strongest source of truth for appearance and adapt the prompt to the project's style.
- Write this as a clean character reference image prompt: the character alone, isolated on a plain white background.
- Do not describe scenery, props not attached to the character, environmental effects, or any background elements.
- Write a reusable prompt fragment for image/video generation, not a prose paragraph.
- Keep it under 120 words.
- Return one complete prompt with a clean ending. Do not cut off mid-sentence.
- Return only the prompt fragment text.`;

			const replicate = new Replicate({ auth: apiKey });
			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort(),
				REPLICATE_TIMEOUT_MS,
			);

			try {
				const output: unknown = await replicate.run("google/gemini-2.5-flash", {
					input: {
						prompt: systemPrompt,
						images: referenceImageData ? [referenceImageData] : [],
						system_instruction:
							"You write concise, style-aware character prompt fragments for image and video generation.",
						max_output_tokens: REFERENCE_PROMPT_MAX_OUTPUT_TOKENS,
						dynamic_thinking: false,
						thinking_budget: 0,
						temperature: 0.7,
					},
					signal: controller.signal,
					wait: { mode: "block", timeout: 60 },
				});

				const prompt = Array.isArray(output)
					? output
							.map((event) => String(event))
							.join("")
							.trim()
					: String(output ?? "").trim();
				if (!prompt) {
					throw new Error("AI returned an empty character prompt");
				}
				return { prompt };
			} finally {
				clearTimeout(timeout);
			}
		},
	);

export const generateCharacterReferenceImage = createServerFn({
	method: "POST",
})
	.inputValidator(
		(data: {
			projectId: string;
			characterId: string;
			modelId?: string;
			prompt?: string;
			referenceImageUrls?: string[];
		}) => data,
	)
	.handler(
		async ({
			data: {
				projectId,
				characterId,
				modelId,
				prompt,
				referenceImageUrls = [],
			},
		}) => {
			const { userId, project } = await assertProjectOwner(projectId, "error");
			const settings = normalizeProjectSettings(project.settings) ?? {};
			const character = (settings.characters ?? []).find(
				(entry) => entry.id === characterId,
			);
			if (!character) throw new Error("Character not found");

			const selectedModelId = modelId || "google/nano-banana";
			const modelOptions = getDefaultModelOptions(selectedModelId);
			const finalPrompt =
				prompt?.trim() ||
				[
					character.name,
					character.visualPromptFragment,
					character.description ? `Notes: ${character.description}` : null,
				]
					.filter(Boolean)
					.join("\n")
					.trim();
			if (!finalPrompt) {
				throw new Error("Image prompt is required");
			}
			const input = buildImageModelInput({
				modelId: selectedModelId,
				prompt: finalPrompt,
				modelOptions,
				referenceImageUrls,
				mode: determineImageGenerationMode({ referenceImageUrls }),
			});
			const providerApiKey = await getImageProviderApiKey({
				userId,
				modelId: selectedModelId,
			});
			const outputUrls = await generateImageSync({
				modelId: selectedModelId,
				input,
				providerApiKey,
				mode: determineImageGenerationMode({ referenceImageUrls }),
			});
			const sourceUrl = outputUrls[0];
			if (!sourceUrl) {
				throw new Error("No output URL found from image generation.");
			}

			const outputFormat = getImageOutputFormat(selectedModelId, modelOptions);
			const storageKey = `projects/${projectId}/characters/${characterId}/generated/${randomUUID()}.${outputFormat}`;
			const storedUrl = await uploadFromUrl(sourceUrl, storageKey);

			const image = await addCharacterImage({
				data: {
					projectId,
					characterId,
					url: storedUrl,
					storageKey,
					label: `${character.name} reference`,
				},
			});

			if (!character.primaryImageId) {
				await setCharacterPrimaryImage({
					data: { projectId, characterId, imageId: image.id },
				});
			}

			return image;
		},
	);

export const updateShotPromptContext = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			shotId: string;
			settings: ShotPromptContextSettings;
		}) => data,
	)
	.handler(async ({ data: { projectId, shotId, settings: nextSettings } }) => {
		await assertProjectOwner(projectId, "error");

		await db.transaction(async (tx) => {
			const project = await tx.query.projects.findFirst({
				where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
			});
			if (!project) throw new Error("Project not found");

			const settings = (project.settings ?? {}) as ProjectSettings;
			const shotPromptContext = {
				...(settings.shotPromptContext ?? {}),
				[shotId]: {
					...(settings.shotPromptContext?.[shotId] ?? {}),
					...nextSettings,
				},
			};

			await tx
				.update(projects)
				.set({ settings: { ...settings, shotPromptContext } })
				.where(eq(projects.id, projectId));
		});
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

		// R2 cleanup AFTER transaction commits — safe to delete now
		await cleanupStorageKeys([storageKey]);
	});
