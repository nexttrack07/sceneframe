import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { and, eq, isNull } from "drizzle-orm";
import Replicate from "replicate";
import { db } from "@/db/index";
import { projects } from "@/db/schema";
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
	Location,
	LocationWithImages,
	ProjectReferenceImageInfo,
	ProjectSettings,
} from "./project-types";

const REPLICATE_TIMEOUT_MS = 60_000;
const REFERENCE_PROMPT_MAX_OUTPUT_TOKENS = 4096;

export const createLocation = createServerFn({ method: "POST" })
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

			const trimmedName = name.trim();
			const trimmedDescription = description.trim();
			const trimmedFragment = visualPromptFragment?.trim() ?? "";
			if (!trimmedName) throw new Error("Location name is required");
			if (trimmedName.length > 100) {
				throw new Error("Location name must be 100 characters or less");
			}
			if (trimmedDescription.length > 5000) {
				throw new Error("Description must be 5000 characters or less");
			}
			if (trimmedFragment && trimmedFragment.length > 2000) {
				throw new Error(
					"Location prompt fragment must be 2000 characters or less",
				);
			}

			const location: Location = {
				id: randomUUID(),
				name: trimmedName,
				description: trimmedDescription,
				visualPromptFragment: trimmedFragment,
				images: [],
				primaryImageId: null,
				defaultEnabled: true,
			};

			await db.transaction(async (tx) => {
				const project = await tx.query.projects.findFirst({
					where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
				});
				if (!project) throw new Error("Project not found");

				const settings = (project.settings ?? {}) as ProjectSettings;
				const locations = [...(settings.locations ?? []), location];

				await tx
					.update(projects)
					.set({ settings: { ...settings, locations } })
					.where(eq(projects.id, projectId));
			});

			return location;
		},
	);

export const updateLocation = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			locationId: string;
			name?: string;
			description?: string;
			visualPromptFragment?: string;
		}) => data,
	)
	.handler(
		async ({
			data: { projectId, locationId, name, description, visualPromptFragment },
		}) => {
			await assertProjectOwner(projectId, "error");

			if (name !== undefined && name.trim().length === 0) {
				throw new Error("Location name cannot be empty");
			}
			if (name !== undefined && name.trim().length > 100) {
				throw new Error("Location name must be 100 characters or less");
			}
			if (
				visualPromptFragment !== undefined &&
				visualPromptFragment.trim().length > 2000
			) {
				throw new Error(
					"Location prompt fragment must be 2000 characters or less",
				);
			}
			if (description !== undefined && description.trim().length > 5000) {
				throw new Error("Description must be 5000 characters or less");
			}

			return db.transaction(async (tx) => {
				const project = await tx.query.projects.findFirst({
					where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
				});
				if (!project) throw new Error("Project not found");

				const settings = (project.settings ?? {}) as ProjectSettings;
				const locations = [...(settings.locations ?? [])];
				const idx = locations.findIndex((entry) => entry.id === locationId);
				if (idx === -1) throw new Error("Location not found");

				const updatedLocation: Location = {
					...locations[idx],
					...(name !== undefined && { name: name.trim() }),
					...(description !== undefined && { description: description.trim() }),
					...(visualPromptFragment !== undefined && {
						visualPromptFragment: visualPromptFragment.trim(),
					}),
				};
				locations[idx] = updatedLocation;

				await tx
					.update(projects)
					.set({ settings: { ...settings, locations } })
					.where(eq(projects.id, projectId));

				return updatedLocation;
			});
		},
	);

export const deleteLocation = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string; locationId: string }) => data)
	.handler(async ({ data: { projectId, locationId } }) => {
		await assertProjectOwner(projectId, "error");

		const storageKeys = await db.transaction(async (tx) => {
			const project = await tx.query.projects.findFirst({
				where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
			});
			if (!project) throw new Error("Project not found");

			const settings = (project.settings ?? {}) as ProjectSettings;
			const locations = [...(settings.locations ?? [])];
			const idx = locations.findIndex((entry) => entry.id === locationId);
			if (idx === -1) throw new Error("Location not found");

			const location = locations[idx];
			locations.splice(idx, 1);

			await tx
				.update(projects)
				.set({ settings: { ...settings, locations } })
				.where(eq(projects.id, projectId));

			return (location.images ?? [])
				.map((image) => image.storageKey)
				.filter((value): value is string => Boolean(value));
		});

		// R2 cleanup AFTER transaction commits — safe to delete now
		await cleanupStorageKeys(storageKeys);
	});

export const listLocations = createServerFn({ method: "GET" })
	.inputValidator((data: { projectId: string }) => data)
	.handler(async ({ data: { projectId } }) => {
		const { project } = await assertProjectOwner(projectId, "error");
		const settings = (project.settings ?? {}) as ProjectSettings;
		return (settings.locations ?? []) as LocationWithImages[];
	});

export const setLocationPrimaryImage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { projectId: string; locationId: string; imageId: string | null }) =>
			data,
	)
	.handler(async ({ data: { projectId, locationId, imageId } }) => {
		await assertProjectOwner(projectId, "error");

		await db.transaction(async (tx) => {
			const project = await tx.query.projects.findFirst({
				where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
			});
			if (!project) throw new Error("Project not found");

			const settings = (project.settings ?? {}) as ProjectSettings;
			const locations = [...(settings.locations ?? [])];
			const idx = locations.findIndex((entry) => entry.id === locationId);
			if (idx === -1) throw new Error("Location not found");

			if (imageId) {
				const image = (locations[idx].images ?? []).find(
					(entry) => entry.id === imageId,
				);
				if (!image) throw new Error("Location image not found");
			}

			locations[idx] = {
				...locations[idx],
				primaryImageId: imageId,
			};

			await tx
				.update(projects)
				.set({ settings: { ...settings, locations } })
				.where(eq(projects.id, projectId));
		});
	});

export const uploadLocationReferenceImage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			locationId: string;
			fileBase64: string;
			fileName: string;
			label?: string;
		}) => data,
	)
	.handler(
		async ({
			data: { projectId, locationId, fileBase64, fileName, label },
		}) => {
			await assertProjectOwner(projectId, "error");

			const project = await db.query.projects.findFirst({
				where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
			});
			if (!project) throw new Error("Project not found");

			const settings = (project.settings ?? {}) as ProjectSettings;
			const location = (settings.locations ?? []).find(
				(entry) => entry.id === locationId,
			);
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
			const storageKey = `projects/${projectId}/locations/${locationId}/${uniqueId}.${ext}`;
			const url = await uploadBuffer(buffer, storageKey, contentType);

			const image = await addLocationImage({
				data: {
					projectId,
					locationId,
					url,
					storageKey,
					label,
				},
			});

			if (!location.primaryImageId) {
				await setLocationPrimaryImage({
					data: { projectId, locationId, imageId: image.id },
				});
			}

			return image;
		},
	);

export const generateLocationPrompt = createServerFn({ method: "POST" })
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

			const systemPrompt = `You are an expert visual prompt writer creating a reusable location reference prompt for a video project.

Write one compact but precise visual prompt fragment for the location below.

Project context:
- Project: ${project.name}
- Concept: ${intake?.concept ?? "Not specified"}
- Visual style: ${intake?.style?.join(", ") ?? "Not specified"}
- Mood: ${intake?.mood?.join(", ") ?? "Not specified"}
- Audience: ${intake?.audience ?? "Not specified"}

Location:
- Name: ${name}
- Description: ${description?.trim() || "Not specified"}

Rules:
- Match the project's visual style exactly.
- Focus on stable environmental identity: architecture or landscape, materials, palette, lighting behavior, atmosphere, era, weather, and signature details.
- If a reference image is attached, use it as the strongest source of truth for the environment while still matching the project's style.
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
							"You write concise, style-aware location prompt fragments for image and video generation.",
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
					throw new Error("AI returned an empty location prompt");
				}
				return { prompt };
			} finally {
				clearTimeout(timeout);
			}
		},
	);

export const generateLocationReferenceImage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			locationId: string;
			modelId?: string;
			prompt?: string;
			referenceImageUrls?: string[];
		}) => data,
	)
	.handler(
		async ({
			data: { projectId, locationId, modelId, prompt, referenceImageUrls = [] },
		}) => {
			const { userId, project } = await assertProjectOwner(projectId, "error");
			const settings = normalizeProjectSettings(project.settings) ?? {};
			const location = (settings.locations ?? []).find(
				(entry) => entry.id === locationId,
			);
			if (!location) throw new Error("Location not found");

			const selectedModelId = modelId || "google/nano-banana";
			const modelOptions = getDefaultModelOptions(selectedModelId);
			const finalPrompt =
				prompt?.trim() ||
				[
					location.name,
					location.visualPromptFragment,
					location.description ? `Notes: ${location.description}` : null,
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
			const storageKey = `projects/${projectId}/locations/${locationId}/generated/${randomUUID()}.${outputFormat}`;
			const storedUrl = await uploadFromUrl(sourceUrl, storageKey);

			const image = await addLocationImage({
				data: {
					projectId,
					locationId,
					url: storedUrl,
					storageKey,
					label: `${location.name} reference`,
				},
			});

			if (!location.primaryImageId) {
				await setLocationPrimaryImage({
					data: { projectId, locationId, imageId: image.id },
				});
			}

			return image;
		},
	);

const addLocationImage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			locationId: string;
			url: string;
			storageKey?: string;
			label?: string;
		}) => data,
	)
	.handler(
		async ({ data: { projectId, locationId, url, storageKey, label } }) => {
			await assertProjectOwner(projectId, "error");

			const trimmedUrl = url.trim();
			if (!trimmedUrl) throw new Error("Image URL is required");
			try {
				const parsed = new URL(trimmedUrl);
				if (!["http:", "https:"].includes(parsed.protocol)) {
					throw new Error("Image URL must use http or https protocol");
				}
			} catch {
				throw new Error("Invalid image URL");
			}
			if (trimmedUrl.length > 2000) {
				throw new Error("Image URL must be 2000 characters or less");
			}
			if (label !== undefined && label.trim().length > 200) {
				throw new Error("Label must be 200 characters or less");
			}
			if (storageKey !== undefined && storageKey.length > 500) {
				throw new Error("Storage key must be 500 characters or less");
			}

			return db.transaction(async (tx) => {
				const project = await tx.query.projects.findFirst({
					where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
				});
				if (!project) throw new Error("Project not found");

				const settings = (project.settings ?? {}) as ProjectSettings;
				const locations = [...(settings.locations ?? [])];
				const idx = locations.findIndex((entry) => entry.id === locationId);
				if (idx === -1) throw new Error("Location not found");

				const image: ProjectReferenceImageInfo = {
					id: randomUUID(),
					url: trimmedUrl,
					storageKey: storageKey ?? null,
					label: label?.trim() || null,
				};

				locations[idx] = {
					...locations[idx],
					images: [...(locations[idx].images ?? []), image],
				};

				await tx
					.update(projects)
					.set({ settings: { ...settings, locations } })
					.where(eq(projects.id, projectId));

				return image;
			});
		},
	);

export const removeLocationImage = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { projectId: string; locationId: string; imageId: string }) => data,
	)
	.handler(async ({ data: { projectId, locationId, imageId } }) => {
		await assertProjectOwner(projectId, "error");

		const storageKey = await db.transaction(async (tx) => {
			const project = await tx.query.projects.findFirst({
				where: and(eq(projects.id, projectId), isNull(projects.deletedAt)),
			});
			if (!project) throw new Error("Project not found");

			const settings = (project.settings ?? {}) as ProjectSettings;
			const locations = [...(settings.locations ?? [])];
			const idx = locations.findIndex((entry) => entry.id === locationId);
			if (idx === -1) throw new Error("Location not found");

			const images = [...(locations[idx].images ?? [])];
			const image = images.find((entry) => entry.id === imageId);
			if (!image) throw new Error("Location image not found");

			locations[idx] = {
				...locations[idx],
				images: images.filter((entry) => entry.id !== imageId),
				primaryImageId:
					locations[idx].primaryImageId === imageId
						? (images.find((entry) => entry.id !== imageId)?.id ?? null)
						: (locations[idx].primaryImageId ?? null),
			};

			await tx
				.update(projects)
				.set({ settings: { ...settings, locations } })
				.where(eq(projects.id, projectId));

			return image.storageKey;
		});

		// R2 cleanup AFTER transaction commits — safe to delete now
		await cleanupStorageKeys([storageKey]);
	});
