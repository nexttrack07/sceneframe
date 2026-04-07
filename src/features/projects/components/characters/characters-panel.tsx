import { Loader2, Pencil, Plus, Star, Trash2, Users } from "lucide-react";
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
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	createCharacter,
	deleteCharacter,
	generateCharacterPrompt,
	generateCharacterReferenceImage,
	listCharacters,
	setCharacterPrimaryImage,
	updateCharacter,
	uploadCharacterReferenceImage,
} from "../../character-actions";
import { IMAGE_MODELS } from "../../image-models";
import type { CharacterWithImages } from "../../project-types";
import { CharacterForm } from "./character-form";

interface CharactersPanelProps {
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCharactersChanged: () => void;
}

export function CharactersPanel({
	projectId,
	open,
	onOpenChange,
	onCharactersChanged,
}: CharactersPanelProps) {
	const replicateImageModels = useMemo(
		() => IMAGE_MODELS.filter((model) => model.replicateExecution),
		[],
	);
	const [characters, setCharacters] = useState<CharacterWithImages[]>([]);
	const [loading, setLoading] = useState(false);
	const [showForm, setShowForm] = useState(false);
	const [editingCharacter, setEditingCharacter] =
		useState<CharacterWithImages | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [pendingDeleteCharacter, setPendingDeleteCharacter] =
		useState<CharacterWithImages | null>(null);
	const [settingPrimaryImageId, setSettingPrimaryImageId] = useState<
		string | null
	>(null);
	const [imageModelId, setImageModelId] = useState("google/nano-banana");
	const [error, setError] = useState<string | null>(null);
	const [promptDraft, setPromptDraft] = useState("");

	const loadCharacters = useCallback(async () => {
		setLoading(true);
		try {
			const result = await listCharacters({ data: { projectId } });
			setCharacters(result);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load characters",
			);
		} finally {
			setLoading(false);
		}
	}, [projectId]);

	useEffect(() => {
		if (!open) return;
		void loadCharacters();
	}, [loadCharacters, open]);

	useEffect(() => {
		setPromptDraft(editingCharacter?.visualPromptFragment ?? "");
	}, [editingCharacter]);

	const refresh = useCallback(async () => {
		await loadCharacters();
		onCharactersChanged();
	}, [loadCharacters, onCharactersChanged]);

	const handleCreate = async (data: {
		name: string;
		description: string;
		visualPromptFragment: string;
		referenceFile?: File | null;
	}) => {
		setIsSubmitting(true);
		setError(null);
		try {
			const created = await createCharacter({
				data: {
					projectId,
					name: data.name,
					description: data.description,
					visualPromptFragment: data.visualPromptFragment,
				},
			});
			if (data.referenceFile) {
				const base64 = await fileToBase64(data.referenceFile);
				const uploaded = await uploadCharacterReferenceImage({
					data: {
						projectId,
						characterId: created.id,
						fileBase64: base64,
						fileName: data.referenceFile.name,
						label: data.referenceFile.name,
					},
				});
				await generateCharacterReferenceImage({
					data: {
						projectId,
						characterId: created.id,
						modelId: imageModelId,
						referenceImageUrls: [uploaded.url],
					},
				});
			} else {
				await generateCharacterReferenceImage({
					data: {
						projectId,
						characterId: created.id,
						modelId: imageModelId,
					},
				});
			}
			setShowForm(false);
			await refresh();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to create character",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleUpdate = async (data: {
		name: string;
		description: string;
		visualPromptFragment: string;
		referenceFile?: File | null;
	}) => {
		if (!editingCharacter) return;
		setIsSubmitting(true);
		setError(null);
		try {
			await updateCharacter({
				data: {
					projectId,
					characterId: editingCharacter.id,
					name: data.name,
					description: data.description,
					visualPromptFragment: data.visualPromptFragment,
				},
			});
			if (data.referenceFile) {
				const base64 = await fileToBase64(data.referenceFile);
				const uploaded = await uploadCharacterReferenceImage({
					data: {
						projectId,
						characterId: editingCharacter.id,
						fileBase64: base64,
						fileName: data.referenceFile.name,
						label: data.referenceFile.name,
					},
				});
				await generateCharacterReferenceImage({
					data: {
						projectId,
						characterId: editingCharacter.id,
						modelId: imageModelId,
						referenceImageUrls: [uploaded.url],
					},
				});
			} else {
				// Use existing images as reference when no new file is uploaded
				const existingImages = editingCharacter.images ?? [];
				const primaryImage = existingImages.find(
					(img) => img.id === editingCharacter.primaryImageId,
				);
				const existingReferenceUrls = primaryImage
					? [primaryImage.url]
					: existingImages.length > 0
						? [existingImages[0].url]
						: [];

				await generateCharacterReferenceImage({
					data: {
						projectId,
						characterId: editingCharacter.id,
						modelId: imageModelId,
						referenceImageUrls: existingReferenceUrls,
					},
				});
			}
			setEditingCharacter(null);
			await refresh();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to update character",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDelete = async (characterId: string) => {
		if (deletingId) return;
		setDeletingId(characterId);
		setError(null);
		try {
			await deleteCharacter({ data: { projectId, characterId } });
			setPendingDeleteCharacter(null);
			await refresh();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to delete character",
			);
		} finally {
			setDeletingId(null);
		}
	};

	const handleGeneratePrompt = useCallback(
		async (draft: {
			name: string;
			description: string;
			referenceFile?: File | null;
		}) => {
			const referenceImageData = draft.referenceFile
				? await fileToBase64(draft.referenceFile)
				: undefined;
			const result = await generateCharacterPrompt({
				data: {
					projectId,
					name: draft.name,
					description: draft.description,
					referenceImageData,
				},
			});
			return result.prompt;
		},
		[projectId],
	);

	const handleSetPrimaryImage = async (
		characterId: string,
		imageId: string | null,
	) => {
		setSettingPrimaryImageId(imageId);
		setError(null);
		try {
			await setCharacterPrimaryImage({
				data: { projectId, characterId, imageId },
			});
			await refresh();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to set primary image",
			);
		} finally {
			setSettingPrimaryImageId(null);
		}
	};

	const sortedCharacters = useMemo(
		() => [...characters].sort((a, b) => a.name.localeCompare(b.name)),
		[characters],
	);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-[420px] overflow-y-auto sm:w-[560px]">
				<SheetHeader>
					<SheetTitle>Characters</SheetTitle>
					<SheetDescription>
						Manage reusable project characters, their prompts, and their visual
						reference images.
					</SheetDescription>
				</SheetHeader>

				<div className="mt-6 space-y-4">
					{error && (
						<div className="flex items-center justify-between gap-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
							<span>{error}</span>
							<button
								type="button"
								onClick={() => setError(null)}
								className="hover:opacity-70"
							>
								✕
							</button>
						</div>
					)}

					<div className="rounded-lg border bg-muted/20 p-3">
						<label className="space-y-1 text-xs text-muted-foreground">
							<span className="font-medium uppercase tracking-wide">
								Reference image model
							</span>
							<select
								value={imageModelId}
								onChange={(event) => setImageModelId(event.target.value)}
								className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
							>
								{replicateImageModels.map((model) => (
									<option key={model.id} value={model.id}>
										{model.label}
									</option>
								))}
							</select>
						</label>
					</div>

					<div className="flex items-center justify-between">
						<div className="flex items-center gap-2">
							<Users size={16} className="text-muted-foreground" />
							<span className="text-sm font-medium">
								{loading
									? "Loading..."
									: `${sortedCharacters.length} characters`}
							</span>
						</div>
						{!showForm && !editingCharacter && (
							<Button
								variant="outline"
								size="sm"
								onClick={() => setShowForm(true)}
								className="h-8 gap-1 text-xs"
							>
								<Plus size={13} />
								Add character
							</Button>
						)}
					</div>

					{(showForm || editingCharacter) && (
						<div className="rounded-lg border bg-muted/20 p-4">
							<h3 className="mb-3 text-sm font-medium">
								{editingCharacter ? "Edit character" : "New character"}
							</h3>
							<CharacterForm
								character={editingCharacter ?? undefined}
								promptValue={promptDraft}
								onPromptValueChange={setPromptDraft}
								onSubmit={editingCharacter ? handleUpdate : handleCreate}
								isSubmitting={isSubmitting}
								onGeneratePrompt={handleGeneratePrompt}
							/>
						</div>
					)}

					{!loading && sortedCharacters.length === 0 && !showForm ? (
						<div className="py-10 text-center text-muted-foreground">
							<Users size={36} className="mx-auto mb-2 opacity-50" />
							<p className="text-sm">No characters yet</p>
							<p className="mt-1 text-xs">
								Add reusable characters that should stay visually consistent
								across shots.
							</p>
						</div>
					) : (
						<div className="space-y-3">
							{sortedCharacters.map((character) => {
								const images = character.images ?? [];
								const primaryImageId =
									character.primaryImageId ?? images[0]?.id ?? null;
								return (
									<div
										key={character.id}
										className="space-y-3 rounded-lg border bg-card p-4"
									>
										<div className="flex items-start justify-between gap-3">
											<div className="min-w-0">
												<p className="truncate text-sm font-medium">
													{character.name}
												</p>
												{character.description ? (
													<p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
														{character.description}
													</p>
												) : null}
											</div>
											<div className="flex items-center gap-1">
												<Button
													variant="ghost"
													size="icon"
													className="h-7 w-7"
													onClick={() => {
														setEditingCharacter(character);
														setShowForm(false);
													}}
												>
													<Pencil size={14} />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="h-7 w-7 text-destructive hover:text-destructive"
													onClick={() => setPendingDeleteCharacter(character)}
													disabled={deletingId === character.id}
												>
													{deletingId === character.id ? (
														<Loader2 size={14} className="animate-spin" />
													) : (
														<Trash2 size={14} />
													)}
												</Button>
											</div>
										</div>

										<div className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
											<span className="font-medium text-foreground">
												Prompt:{" "}
											</span>
											{character.visualPromptFragment}
										</div>

										<div className="space-y-2">
											<div className="flex items-center justify-between">
												<p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
													Reference images
												</p>
											</div>
											{images.length === 0 ? (
												<p className="text-xs text-muted-foreground">
													No images yet.
												</p>
											) : (
												<div className="grid grid-cols-3 gap-2">
													{images.map((image) => {
														const isPrimary = primaryImageId === image.id;
														return (
															<button
																key={image.id}
																type="button"
																onClick={() =>
																	handleSetPrimaryImage(character.id, image.id)
																}
																className={`relative overflow-hidden rounded-lg border text-left ${
																	isPrimary
																		? "border-primary ring-2 ring-primary/25"
																		: "border-border"
																}`}
															>
																<img
																	src={image.url}
																	alt={image.label ?? character.name}
																	className="aspect-square w-full object-cover"
																/>
																<div className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-1 text-[10px] text-white">
																	<div className="flex items-center justify-between gap-1">
																		<span className="truncate">
																			{image.label ?? "Reference"}
																		</span>
																		{isPrimary ? (
																			<span className="inline-flex items-center gap-0.5 rounded bg-white/20 px-1 py-0.5">
																				<Star
																					size={9}
																					className="fill-current"
																				/>
																				Primary
																			</span>
																		) : settingPrimaryImageId === image.id ? (
																			<Loader2
																				size={10}
																				className="animate-spin"
																			/>
																		) : null}
																	</div>
																</div>
															</button>
														);
													})}
												</div>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</SheetContent>
			<AlertDialog
				open={Boolean(pendingDeleteCharacter)}
				onOpenChange={(open) => {
					if (!open) setPendingDeleteCharacter(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete character?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove{" "}
							{pendingDeleteCharacter?.name ?? "this character"} and its saved
							reference images.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pendingDeleteCharacter) {
									void handleDelete(pendingDeleteCharacter.id);
								}
							}}
							className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Sheet>
	);
}

function fileToBase64(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(new Error("Failed to read file"));
		reader.readAsDataURL(file);
	});
}
