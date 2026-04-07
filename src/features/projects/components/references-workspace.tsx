import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, MapPinned, Plus, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import {
	createCharacter,
	deleteCharacter,
	generateCharacterPrompt,
	generateCharacterReferenceImage,
	listCharacters,
	removeCharacterImage,
	setCharacterPrimaryImage,
	updateCharacter,
} from "../character-actions";
import { IMAGE_MODELS } from "../image-models";
import {
	createLocation,
	deleteLocation,
	generateLocationPrompt,
	generateLocationReferenceImage,
	listLocations,
	removeLocationImage,
	setLocationPrimaryImage,
	updateLocation,
} from "../location-actions";
import type {
	CharacterWithImages,
	LocationWithImages,
	ProjectReferenceImageInfo,
} from "../project-types";
import { projectKeys } from "../query-keys";
import { uploadProjectReferenceInputImage } from "../reference-input-actions";
import { CharacterForm } from "./characters/character-form";
import { LocationForm } from "./locations/location-form";
import { ModelPickerModal } from "./model-picker-modal";
import {
	type PendingReferenceImage,
	ReferenceImageGrid,
} from "./references/reference-image-grid";
import { VisualReferencesSection } from "./studio/visual-references-section";

type ReferenceKind = "character" | "location";

type ReferenceSelection =
	| { kind: "character"; mode: "existing"; id: string }
	| { kind: "location"; mode: "existing"; id: string }
	| { kind: "character"; mode: "create" }
	| { kind: "location"; mode: "create" };

function fileToBase64(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(new Error("Failed to read file"));
		reader.readAsDataURL(file);
	});
}

function getPrimaryImage(
	entity: CharacterWithImages | LocationWithImages,
): ProjectReferenceImageInfo | null {
	const images = entity.images ?? [];
	return (
		images.find((image) => image.id === entity.primaryImageId) ??
		images[0] ??
		null
	);
}

export function ReferencesWorkspace({
	projectId,
	projectName,
	initialCharacters = [],
	initialLocations = [],
}: {
	projectId: string;
	projectName: string;
	initialCharacters?: CharacterWithImages[];
	initialLocations?: LocationWithImages[];
}) {
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const imageModels = IMAGE_MODELS;
	const [selection, setSelection] = useState<ReferenceSelection>({
		kind: "character",
		mode: "create",
	});
	const [imageModelId, setImageModelId] = useState(IMAGE_MODELS[0]?.id ?? "");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isUploadingImage, setIsUploadingImage] = useState(false);
	const [settingPrimaryImageId, setSettingPrimaryImageId] = useState<
		string | null
	>(null);
	const [editingImageId, setEditingImageId] = useState<string | null>(null);
	const [pendingDeleteEntity, setPendingDeleteEntity] = useState<{
		kind: ReferenceKind;
		id: string;
		name: string;
	} | null>(null);
	const [pendingDeleteImage, setPendingDeleteImage] = useState<{
		kind: ReferenceKind;
		entityId: string;
		imageId: string;
		label: string;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [promptDraftsBySelection, setPromptDraftsBySelection] = useState<
		Record<string, string>
	>({});
	const [currentReferenceUrls, setCurrentReferenceUrls] = useState<string[]>(
		[],
	);
	const [pendingImagesBySelection, setPendingImagesBySelection] = useState<
		Record<string, PendingReferenceImage[]>
	>({});
	const [rawCharacters, setRawCharacters] =
		useState<CharacterWithImages[]>(initialCharacters);
	const [rawLocations, setRawLocations] =
		useState<LocationWithImages[]>(initialLocations);

	const loadCharacters = useCallback(async () => {
		try {
			const result = await listCharacters({ data: { projectId } });
			setRawCharacters(result);
		} catch (err) {
			console.error("Failed to load characters", err);
		}
	}, [projectId]);

	const loadLocations = useCallback(async () => {
		try {
			const result = await listLocations({ data: { projectId } });
			setRawLocations(result);
		} catch (err) {
			console.error("Failed to load locations", err);
		}
	}, [projectId]);

	useEffect(() => {
		void loadCharacters();
		void loadLocations();
	}, [loadCharacters, loadLocations]);

	const characters = useMemo(
		() => [...rawCharacters].sort((a, b) => a.name.localeCompare(b.name)),
		[rawCharacters],
	);
	const locations = useMemo(
		() => [...rawLocations].sort((a, b) => a.name.localeCompare(b.name)),
		[rawLocations],
	);

	const selectedCharacter =
		selection.kind === "character" && selection.mode === "existing"
			? (characters.find((character) => character.id === selection.id) ?? null)
			: null;
	const selectedLocation =
		selection.kind === "location" && selection.mode === "existing"
			? (locations.find((location) => location.id === selection.id) ?? null)
			: null;
	const selectedEntity = selectedCharacter ?? selectedLocation;
	const selectedImages = selectedEntity?.images ?? [];
	const selectedKind: ReferenceKind = selection.kind;
	const selectionKey =
		selection.mode === "existing"
			? `${selection.kind}:${selection.id}`
			: `${selection.kind}:create`;
	const selectedEntityId =
		selection.mode === "existing" ? selection.id : undefined;
	const editingImageUrl = editingImageId
		? (selectedImages.find((image) => image.id === editingImageId)?.url ?? null)
		: null;
	const currentPromptDraft = promptDraftsBySelection[selectionKey] ?? "";
	const currentPendingImages = pendingImagesBySelection[selectionKey] ?? [];

	function setPromptDraft(value: string) {
		setPromptDraftsBySelection((prev) => ({
			...prev,
			[selectionKey]: value,
		}));
	}

	useEffect(() => {
		void selectionKey;
		setCurrentReferenceUrls([]);
	}, [selectionKey]);

	useEffect(() => {
		setPromptDraftsBySelection((prev) => {
			if (selectionKey in prev) return prev;

			const initialPrompt =
				selection.kind === "character"
					? selectedCharacter?.visualPromptFragment ?? ""
					: selectedLocation?.visualPromptFragment ?? "";

			return {
				...prev,
				[selectionKey]: initialPrompt,
			};
		});
	}, [
		selection.kind,
		selectionKey,
		selectedCharacter?.visualPromptFragment,
		selectedLocation?.visualPromptFragment,
	]);

	function addPendingImage(label: string) {
		const pending: PendingReferenceImage = {
			id: crypto.randomUUID(),
			createdAt: new Date().toISOString(),
			label,
		};
		setPendingImagesBySelection((prev) => ({
			...prev,
			[selectionKey]: [...(prev[selectionKey] ?? []), pending],
		}));
		return pending.id;
	}

	function removePendingImage(pendingId: string, key = selectionKey) {
		setPendingImagesBySelection((prev) => ({
			...prev,
			[key]: (prev[key] ?? []).filter((entry) => entry.id !== pendingId),
		}));
	}

	async function refreshReferences() {
		await Promise.all([
			loadCharacters(),
			loadLocations(),
			queryClient.invalidateQueries({
				queryKey: projectKeys.project(projectId),
			}),
		]);
	}

	function resetEditingState() {
		setEditingImageId(null);
	}

	async function handleCreateCharacter(data: {
		name: string;
		description: string;
		visualPromptFragment: string;
	}) {
		setIsSubmitting(true);
		setError(null);
		const pendingId = addPendingImage(`${data.name} reference`);
		try {
			const created = await createCharacter({
				data: {
					projectId,
					name: data.name,
					description: data.description,
					visualPromptFragment: "",
				},
			});
			await generateCharacterReferenceImage({
				data: {
					projectId,
					characterId: created.id,
					modelId: imageModelId,
					prompt: data.visualPromptFragment,
					referenceImageUrls: currentReferenceUrls,
				},
			});
			await refreshReferences();
			resetEditingState();
			setPromptDraftsBySelection((prev) => ({
				...prev,
				[`character:${created.id}`]: prev["character:create"] ?? "",
			}));
			removePendingImage(pendingId, "character:create");
			setSelection({ kind: "character", mode: "existing", id: created.id });
			toast("Character created", "success");
		} catch (err) {
			removePendingImage(pendingId, "character:create");
			setError(
				err instanceof Error ? err.message : "Failed to create character",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleUpdateCharacter(data: {
		name: string;
		description: string;
		visualPromptFragment: string;
	}) {
		if (!selectedCharacter) return;
		setIsSubmitting(true);
		setError(null);
		const effectiveReferenceImageUrls = Array.from(
			new Set([
				...(editingImageUrl ? [editingImageUrl] : []),
				...currentReferenceUrls,
			]),
		);
		const pendingId = addPendingImage(`${data.name} reference`);
		try {
			await updateCharacter({
				data: {
					projectId,
					characterId: selectedCharacter.id,
					name: data.name,
					description: data.description,
					visualPromptFragment: "",
				},
			});
			await generateCharacterReferenceImage({
				data: {
					projectId,
					characterId: selectedCharacter.id,
					modelId: imageModelId,
					prompt: data.visualPromptFragment,
					referenceImageUrls: effectiveReferenceImageUrls,
				},
			});
			await refreshReferences();
			resetEditingState();
			removePendingImage(pendingId);
			toast("Reference image generated", "success");
		} catch (err) {
			removePendingImage(pendingId);
			setError(
				err instanceof Error ? err.message : "Failed to update character",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleCreateLocation(data: {
		name: string;
		description: string;
		visualPromptFragment: string;
	}) {
		setIsSubmitting(true);
		setError(null);
		const pendingId = addPendingImage(`${data.name} reference`);
		try {
			const created = await createLocation({
				data: {
					projectId,
					name: data.name,
					description: data.description,
					visualPromptFragment: "",
				},
			});
			await generateLocationReferenceImage({
				data: {
					projectId,
					locationId: created.id,
					modelId: imageModelId,
					prompt: data.visualPromptFragment,
					referenceImageUrls: currentReferenceUrls,
				},
			});
			await refreshReferences();
			resetEditingState();
			setPromptDraftsBySelection((prev) => ({
				...prev,
				[`location:${created.id}`]: prev["location:create"] ?? "",
			}));
			removePendingImage(pendingId, "location:create");
			setSelection({ kind: "location", mode: "existing", id: created.id });
			toast("Location created", "success");
		} catch (err) {
			removePendingImage(pendingId, "location:create");
			setError(
				err instanceof Error ? err.message : "Failed to create location",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleUpdateLocation(data: {
		name: string;
		description: string;
		visualPromptFragment: string;
	}) {
		if (!selectedLocation) return;
		setIsSubmitting(true);
		setError(null);
		const effectiveReferenceImageUrls = Array.from(
			new Set([
				...(editingImageUrl ? [editingImageUrl] : []),
				...currentReferenceUrls,
			]),
		);
		const pendingId = addPendingImage(`${data.name} reference`);
		try {
			await updateLocation({
				data: {
					projectId,
					locationId: selectedLocation.id,
					name: data.name,
					description: data.description,
					visualPromptFragment: "",
				},
			});
			await generateLocationReferenceImage({
				data: {
					projectId,
					locationId: selectedLocation.id,
					modelId: imageModelId,
					prompt: data.visualPromptFragment,
					referenceImageUrls: effectiveReferenceImageUrls,
				},
			});
			await refreshReferences();
			resetEditingState();
			removePendingImage(pendingId);
			toast("Reference image generated", "success");
		} catch (err) {
			removePendingImage(pendingId);
			setError(
				err instanceof Error ? err.message : "Failed to update location",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleGenerateCharacterPrompt(draft: {
		name: string;
		description: string;
	}) {
		const result = await generateCharacterPrompt({
			data: {
				projectId,
				name: draft.name,
				description: draft.description,
			},
		});
		return result.prompt;
	}

	async function handleGenerateLocationPrompt(draft: {
		name: string;
		description: string;
	}) {
		const result = await generateLocationPrompt({
			data: {
				projectId,
				name: draft.name,
				description: draft.description,
			},
		});
		return result.prompt;
	}

	async function handleUploadAdditionalImage(file: File) {
		setIsUploadingImage(true);
		setError(null);
		try {
			const uploaded = await uploadProjectReferenceInputImage({
				data: {
					projectId,
					fileBase64: await fileToBase64(file),
					fileName: file.name,
				},
			});
			setCurrentReferenceUrls((prev) => [...prev, uploaded.url]);
			toast("Reference image uploaded", "success");
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to upload reference image",
			);
		} finally {
			setIsUploadingImage(false);
		}
	}

	function handleRemoveUploadedReference(url: string) {
		setCurrentReferenceUrls((prev) => prev.filter((entry) => entry !== url));
	}

	async function handleSetPrimaryImage(imageId: string) {
		if (!selectedEntityId) return;
		setSettingPrimaryImageId(imageId);
		setError(null);
		try {
			if (selectedKind === "character") {
				await setCharacterPrimaryImage({
					data: { projectId, characterId: selectedEntityId, imageId },
				});
			} else {
				await setLocationPrimaryImage({
					data: { projectId, locationId: selectedEntityId, imageId },
				});
			}
			await refreshReferences();
			if (!editingImageId) {
				setEditingImageId(imageId);
			}
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to set primary image",
			);
		} finally {
			setSettingPrimaryImageId(null);
		}
	}

	async function handleConfirmDeleteEntity() {
		if (!pendingDeleteEntity) return;
		setError(null);
		try {
			if (pendingDeleteEntity.kind === "character") {
				await deleteCharacter({
					data: { projectId, characterId: pendingDeleteEntity.id },
				});
			} else {
				await deleteLocation({
					data: { projectId, locationId: pendingDeleteEntity.id },
				});
			}
			await refreshReferences();
			setSelection(
				pendingDeleteEntity.kind === "character"
					? { kind: "character", mode: "create" }
					: { kind: "location", mode: "create" },
			);
			setPendingDeleteEntity(null);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to delete reference",
			);
		}
	}

	async function handleConfirmDeleteImage() {
		if (!pendingDeleteImage) return;
		setError(null);
		try {
			if (pendingDeleteImage.kind === "character") {
				await removeCharacterImage({
					data: { projectId, imageId: pendingDeleteImage.imageId },
				});
			} else {
				await removeLocationImage({
					data: {
						projectId,
						locationId: pendingDeleteImage.entityId,
						imageId: pendingDeleteImage.imageId,
					},
				});
			}
			await refreshReferences();
			if (editingImageId === pendingDeleteImage.imageId) {
				setEditingImageId(null);
			}
			setPendingDeleteImage(null);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to delete reference image",
			);
		}
	}

	return (
		<div className="flex h-[calc(100vh-3.5rem)] overflow-hidden bg-background">
			<div className="flex w-72 flex-shrink-0 flex-col border-r bg-card">
				<div className="border-b p-4">
					<Link
						to="/projects/$projectId"
						params={{ projectId }}
						className="mb-3 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
					>
						<ArrowLeft size={12} />
						Back to storyboard
					</Link>
					<h1 className="text-sm font-semibold">References</h1>
					<p className="mt-1 text-xs text-muted-foreground">{projectName}</p>
				</div>
				<div className="flex-1 overflow-y-auto p-3">
					<div className="mb-5 space-y-2">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
								<Users size={12} />
								Characters
							</div>
							<Button
								size="sm"
								variant="outline"
								className="h-7 gap-1 text-xs"
								onClick={() =>
									setSelection({ kind: "character", mode: "create" })
								}
							>
								<Plus size={12} />
								New
							</Button>
						</div>
						<div className="space-y-1.5">
							{characters.map((character) => {
								const primaryImage = getPrimaryImage(character);
								const isSelected =
									selection.kind === "character" &&
									selection.mode === "existing" &&
									selection.id === character.id;
								return (
									<button
										key={character.id}
										type="button"
										onClick={() =>
											setSelection({
												kind: "character",
												mode: "existing",
												id: character.id,
											})
										}
										className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left ${
											isSelected
												? "border-primary/40 bg-primary/5"
												: "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40"
										}`}
									>
										<div className="h-10 w-10 overflow-hidden rounded-md border border-border bg-background">
											{primaryImage?.url ? (
												<img
													src={primaryImage.url}
													alt={character.name}
													className="h-full w-full object-cover"
												/>
											) : (
												<div className="flex h-full w-full items-center justify-center text-muted-foreground">
													<Users size={14} />
												</div>
											)}
										</div>
										<div className="min-w-0">
											<p className="truncate text-sm font-medium">
												{character.name}
											</p>
											<p className="text-[10px] text-muted-foreground">
												{character.images?.length ?? 0} image
												{character.images?.length === 1 ? "" : "s"}
											</p>
										</div>
									</button>
								);
							})}
						</div>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
								<MapPinned size={12} />
								Locations
							</div>
							<Button
								size="sm"
								variant="outline"
								className="h-7 gap-1 text-xs"
								onClick={() =>
									setSelection({ kind: "location", mode: "create" })
								}
							>
								<Plus size={12} />
								New
							</Button>
						</div>
						<div className="space-y-1.5">
							{locations.map((location) => {
								const primaryImage = getPrimaryImage(location);
								const isSelected =
									selection.kind === "location" &&
									selection.mode === "existing" &&
									selection.id === location.id;
								return (
									<button
										key={location.id}
										type="button"
										onClick={() =>
											setSelection({
												kind: "location",
												mode: "existing",
												id: location.id,
											})
										}
										className={`flex w-full items-center gap-2 rounded-lg border p-2 text-left ${
											isSelected
												? "border-primary/40 bg-primary/5"
												: "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40"
										}`}
									>
										<div className="h-10 w-10 overflow-hidden rounded-md border border-border bg-background">
											{primaryImage?.url ? (
												<img
													src={primaryImage.url}
													alt={location.name}
													className="h-full w-full object-cover"
												/>
											) : (
												<div className="flex h-full w-full items-center justify-center text-muted-foreground">
													<MapPinned size={14} />
												</div>
											)}
										</div>
										<div className="min-w-0">
											<p className="truncate text-sm font-medium">
												{location.name}
											</p>
											<p className="text-[10px] text-muted-foreground">
												{location.images?.length ?? 0} image
												{location.images?.length === 1 ? "" : "s"}
											</p>
										</div>
									</button>
								);
							})}
						</div>
					</div>
				</div>
			</div>

			<div className="flex w-[30rem] flex-shrink-0 flex-col border-r bg-card">
				<div className="border-b p-4">
					<div>
						<h2 className="text-sm font-semibold">
							{selection.mode === "create"
								? `New ${selection.kind}`
								: (selectedEntity?.name ?? "Reference")}
						</h2>
						<p className="mt-1 text-xs text-muted-foreground">
							Edit the description, prompt, and generation settings.
						</p>
					</div>
				</div>
				<div className="flex-1 min-h-0 p-4">
					{error ? (
						<div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							{error}
						</div>
					) : null}

					{selection.kind === "character" ? (
						<CharacterForm
							character={selectedCharacter ?? undefined}
							editingImageUrl={editingImageUrl}
							onClearEditingImage={() => setEditingImageId(null)}
							onSubmit={
								selection.mode === "create"
									? handleCreateCharacter
									: handleUpdateCharacter
							}
							isSubmitting={isSubmitting}
							submitLabel={
								selection.mode === "existing" ? "Generate image" : undefined
							}
							referenceSection={
								<VisualReferencesSection
									referenceUrls={currentReferenceUrls}
									isUploading={isUploadingImage}
									onUpload={(file) => void handleUploadAdditionalImage(file)}
									onRemove={handleRemoveUploadedReference}
								/>
							}
							promptValue={currentPromptDraft}
							onPromptValueChange={setPromptDraft}
							settingsSection={
								<div className="space-y-1.5">
									<p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
										Generation model
									</p>
									<ModelPickerModal
										title="Choose A Reference Image Model"
										triggerLabel="Image model"
										selectedId={imageModelId}
										options={imageModels.map((model) => ({
											id: model.id,
											label: model.label,
											provider: model.provider,
											description: model.description,
											logoText: model.logoText,
											logoImageUrl: model.logoImageUrl,
											previewImageUrl: model.previewImageUrl,
											accentClassName: model.accentClassName,
										}))}
										onSelect={setImageModelId}
									/>
								</div>
							}
							onGeneratePrompt={handleGenerateCharacterPrompt}
						/>
					) : (
						<LocationForm
							location={selectedLocation ?? undefined}
							editingImageUrl={editingImageUrl}
							onClearEditingImage={() => setEditingImageId(null)}
							onSubmit={
								selection.mode === "create"
									? handleCreateLocation
									: handleUpdateLocation
							}
							isSubmitting={isSubmitting}
							submitLabel={
								selection.mode === "existing" ? "Generate image" : undefined
							}
							referenceSection={
								<VisualReferencesSection
									referenceUrls={currentReferenceUrls}
									isUploading={isUploadingImage}
									onUpload={(file) => void handleUploadAdditionalImage(file)}
									onRemove={handleRemoveUploadedReference}
								/>
							}
							promptValue={currentPromptDraft}
							onPromptValueChange={setPromptDraft}
							settingsSection={
								<div className="space-y-1.5">
									<p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
										Generation model
									</p>
									<ModelPickerModal
										title="Choose A Reference Image Model"
										triggerLabel="Image model"
										selectedId={imageModelId}
										options={imageModels.map((model) => ({
											id: model.id,
											label: model.label,
											provider: model.provider,
											description: model.description,
											logoText: model.logoText,
											logoImageUrl: model.logoImageUrl,
											previewImageUrl: model.previewImageUrl,
											accentClassName: model.accentClassName,
										}))}
										onSelect={setImageModelId}
									/>
								</div>
							}
							onGeneratePrompt={handleGenerateLocationPrompt}
						/>
					)}
				</div>
			</div>

			<div className="min-w-0 flex-1 overflow-hidden bg-card">
				<div className="border-b p-4">
					<div className="flex items-start justify-between gap-3">
						<div>
							<h2 className="text-sm font-semibold">Reference images</h2>
							<p className="mt-1 text-xs text-muted-foreground">
								Choose a primary image, add more references, or set one as the
								active edit source.
							</p>
						</div>
						{selection.mode === "existing" && selectedEntity ? (
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="h-9 w-9 text-destructive"
								onClick={() =>
									setPendingDeleteEntity({
										kind: selectedKind,
										id: selectedEntity.id,
										name: selectedEntity.name,
									})
								}
							>
								<Trash2 size={14} />
							</Button>
						) : null}
					</div>
				</div>
				<div className="h-full overflow-y-auto p-4">
					{selection.mode !== "existing" ? (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							Create or select a reference to manage its images.
						</div>
					) : (
						<div className="space-y-4">
							{selectedImages.length === 0 ? (
								<ReferenceImageGrid
									images={selectedImages}
									pendingImages={currentPendingImages}
									entityName={selectedEntity?.name}
									primaryImageId={selectedEntity?.primaryImageId}
									editingImageId={editingImageId}
									settingPrimaryImageId={settingPrimaryImageId}
									onToggleEditing={(imageId) =>
										setEditingImageId((current) =>
											current === imageId ? null : imageId,
										)
									}
									onSetPrimary={(imageId) =>
										void handleSetPrimaryImage(imageId)
									}
									onDelete={(imageId, label) =>
										setPendingDeleteImage({
											kind: selectedKind,
											entityId: selectedEntityId ?? "",
											imageId,
											label,
										})
									}
								/>
							) : (
								<ReferenceImageGrid
									images={selectedImages}
									pendingImages={currentPendingImages}
									entityName={selectedEntity?.name}
									primaryImageId={selectedEntity?.primaryImageId}
									editingImageId={editingImageId}
									settingPrimaryImageId={settingPrimaryImageId}
									onToggleEditing={(imageId) =>
										setEditingImageId((current) =>
											current === imageId ? null : imageId,
										)
									}
									onSetPrimary={(imageId) =>
										void handleSetPrimaryImage(imageId)
									}
									onDelete={(imageId, label) =>
										setPendingDeleteImage({
											kind: selectedKind,
											entityId: selectedEntityId ?? "",
											imageId,
											label,
										})
									}
								/>
							)}
						</div>
					)}
				</div>
			</div>

			<AlertDialog
				open={Boolean(pendingDeleteEntity)}
				onOpenChange={(open) => {
					if (!open) setPendingDeleteEntity(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete reference?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove {pendingDeleteEntity?.name ?? "this reference"}{" "}
							and its saved reference images.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => void handleConfirmDeleteEntity()}
							className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={Boolean(pendingDeleteImage)}
				onOpenChange={(open) => {
					if (!open) setPendingDeleteImage(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete image?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove {pendingDeleteImage?.label ?? "this image"} from
							the selected reference.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => void handleConfirmDeleteImage()}
							className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
						>
							Delete image
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
