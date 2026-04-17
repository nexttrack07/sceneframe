import { auth } from "@clerk/tanstack-react-start/server";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import {
	ImagePlus,
	Loader2,
	Pencil,
	Plus,
	Star,
	Trash2,
	Upload,
	Users,
} from "lucide-react";
import { useCallback, useState } from "react";
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
import { ErrorAlert } from "@/components/ui/error-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/db/index";
import { users } from "@/db/schema";
import {
	createGlobalCharacter,
	deleteGlobalCharacter,
	type GlobalCharacterWithImages,
	listGlobalCharacters,
	removeGlobalCharacterImage,
	setGlobalCharacterPrimaryImage,
	updateGlobalCharacter,
	uploadGlobalCharacterImage,
} from "@/features/library/global-character-actions";

const loadCharacters = createServerFn().handler(async () => {
	const { userId } = await auth();
	if (!userId) throw redirect({ to: "/sign-in" });

	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
	});

	if (!user?.onboardingComplete) {
		throw redirect({ to: "/onboarding" });
	}

	const characters = await listGlobalCharacters();
	return { characters };
});

export const Route = createFileRoute("/_auth/library/characters")({
	loader: () => loadCharacters(),
	component: CharactersPage,
});

function CharactersPage() {
	const { characters: initialCharacters } = Route.useLoaderData();

	const [characters, setCharacters] =
		useState<GlobalCharacterWithImages[]>(initialCharacters);
	const [error, setError] = useState<string | null>(null);
	const [showForm, setShowForm] = useState(false);
	const [editingCharacter, setEditingCharacter] =
		useState<GlobalCharacterWithImages | null>(null);
	const [pendingDeleteCharacter, setPendingDeleteCharacter] =
		useState<GlobalCharacterWithImages | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		const result = await listGlobalCharacters();
		setCharacters(result);
	}, []);

	const handleDelete = async (characterId: string) => {
		if (deletingId) return;
		setDeletingId(characterId);
		setError(null);
		try {
			await deleteGlobalCharacter({ data: { characterId } });
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

	return (
		<div className="space-y-6">
			{error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Users size={18} className="text-muted-foreground" />
					<span className="text-sm font-medium">
						{characters.length} character{characters.length !== 1 ? "s" : ""}
					</span>
				</div>
				<Button
					variant="accent"
					size="sm"
					onClick={() => setShowForm(true)}
					className="gap-1.5"
				>
					<Plus size={14} />
					New Character
				</Button>
			</div>

			{characters.length === 0 ? (
				<EmptyState onAdd={() => setShowForm(true)} />
			) : (
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
					{characters.map((character) => (
						<CharacterCard
							key={character.id}
							character={character}
							onEdit={() => setEditingCharacter(character)}
							onDelete={() => setPendingDeleteCharacter(character)}
							isDeleting={deletingId === character.id}
						/>
					))}
				</div>
			)}

			<CharacterFormSheet
				open={showForm}
				onOpenChange={setShowForm}
				onSuccess={async () => {
					setShowForm(false);
					await refresh();
				}}
			/>

			<CharacterFormSheet
				open={!!editingCharacter}
				onOpenChange={(open) => {
					if (!open) setEditingCharacter(null);
				}}
				character={editingCharacter ?? undefined}
				onSuccess={async () => {
					setEditingCharacter(null);
					await refresh();
				}}
			/>

			<AlertDialog
				open={!!pendingDeleteCharacter}
				onOpenChange={(open) => {
					if (!open) setPendingDeleteCharacter(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete character?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently remove{" "}
							<strong>{pendingDeleteCharacter?.name}</strong> and all its
							reference images from your library.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								if (pendingDeleteCharacter) {
									void handleDelete(pendingDeleteCharacter.id);
								}
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center py-16 text-center">
			<div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
				<Users size={24} className="text-primary" />
			</div>
			<h2 className="text-lg font-semibold text-foreground mb-1">
				No characters yet
			</h2>
			<p className="text-sm text-muted-foreground max-w-xs mb-6">
				Create reusable characters that stay visually consistent across all your
				projects.
			</p>
			<Button variant="accent" onClick={onAdd}>
				<Plus size={16} className="mr-1.5" />
				Create Character
			</Button>
		</div>
	);
}

function CharacterCard({
	character,
	onEdit,
	onDelete,
	isDeleting,
}: {
	character: GlobalCharacterWithImages;
	onEdit: () => void;
	onDelete: () => void;
	isDeleting: boolean;
}) {
	const primaryImage = character.images.find(
		(img) => img.id === character.primaryImageId,
	);
	const displayImage = primaryImage ?? character.images[0];

	return (
		<div className="group bg-card rounded-xl border overflow-hidden hover:border-primary/40 hover:shadow-sm transition-all">
			<div className="aspect-square bg-muted relative">
				{displayImage ? (
					<img
						src={displayImage.url}
						alt={character.name}
						className="w-full h-full object-cover"
					/>
				) : (
					<div className="w-full h-full flex items-center justify-center">
						<Users size={48} className="text-muted-foreground/30" />
					</div>
				)}
				<div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
					<Button
						variant="secondary"
						size="icon"
						className="h-8 w-8 bg-background/80 backdrop-blur-sm"
						onClick={onEdit}
					>
						<Pencil size={14} />
					</Button>
					<Button
						variant="secondary"
						size="icon"
						className="h-8 w-8 bg-background/80 backdrop-blur-sm text-destructive hover:text-destructive"
						onClick={onDelete}
						disabled={isDeleting}
					>
						{isDeleting ? (
							<Loader2 size={14} className="animate-spin" />
						) : (
							<Trash2 size={14} />
						)}
					</Button>
				</div>
				{character.images.length > 1 && (
					<div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
						+{character.images.length - 1}
					</div>
				)}
			</div>
			<div className="p-4">
				<h3 className="font-semibold text-foreground truncate">
					{character.name}
				</h3>
				{character.description && (
					<p className="text-sm text-muted-foreground line-clamp-2 mt-1">
						{character.description}
					</p>
				)}
				{character.visualPromptFragment && (
					<p className="text-xs text-muted-foreground/70 line-clamp-1 mt-2 italic">
						"{character.visualPromptFragment}"
					</p>
				)}
			</div>
		</div>
	);
}

interface CharacterFormSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	character?: GlobalCharacterWithImages;
	onSuccess: () => Promise<void>;
}

function CharacterFormSheet({
	open,
	onOpenChange,
	character,
	onSuccess,
}: CharacterFormSheetProps) {
	const isEditing = !!character;

	const [name, setName] = useState(character?.name ?? "");
	const [description, setDescription] = useState(character?.description ?? "");
	const [visualPromptFragment, setVisualPromptFragment] = useState(
		character?.visualPromptFragment ?? "",
	);
	const [images, setImages] = useState(character?.images ?? []);
	const [primaryImageId, setPrimaryImageId] = useState(
		character?.primaryImageId ?? null,
	);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isUploading, setIsUploading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// Reset form when character changes
	const resetForm = useCallback(() => {
		setName(character?.name ?? "");
		setDescription(character?.description ?? "");
		setVisualPromptFragment(character?.visualPromptFragment ?? "");
		setImages(character?.images ?? []);
		setPrimaryImageId(character?.primaryImageId ?? null);
		setError(null);
	}, [character]);

	// Reset when opening/closing or character changes
	useState(() => {
		if (open) resetForm();
	});

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim()) {
			setError("Name is required");
			return;
		}

		setIsSubmitting(true);
		setError(null);

		try {
			if (isEditing && character) {
				await updateGlobalCharacter({
					data: {
						characterId: character.id,
						name: name.trim(),
						description: description.trim(),
						visualPromptFragment: visualPromptFragment.trim(),
					},
				});
			} else {
				await createGlobalCharacter({
					data: {
						name: name.trim(),
						description: description.trim(),
						visualPromptFragment: visualPromptFragment.trim(),
					},
				});
			}
			await onSuccess();
			resetForm();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save character");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleImageUpload = async (file: File) => {
		if (!character) return;

		setIsUploading(true);
		setError(null);

		try {
			const base64 = await fileToBase64(file);
			const uploaded = await uploadGlobalCharacterImage({
				data: {
					characterId: character.id,
					fileBase64: base64,
					fileName: file.name,
					label: file.name,
				},
			});
			setImages((prev) => [...prev, uploaded]);
			if (!primaryImageId) {
				setPrimaryImageId(uploaded.id);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to upload image");
		} finally {
			setIsUploading(false);
		}
	};

	const handleSetPrimary = async (imageId: string) => {
		if (!character) return;

		try {
			await setGlobalCharacterPrimaryImage({
				data: { characterId: character.id, imageId },
			});
			setPrimaryImageId(imageId);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to set primary image",
			);
		}
	};

	const handleRemoveImage = async (imageId: string) => {
		if (!character) return;

		try {
			await removeGlobalCharacterImage({
				data: { characterId: character.id, imageId },
			});
			setImages((prev) => prev.filter((img) => img.id !== imageId));
			if (primaryImageId === imageId) {
				const remaining = images.filter((img) => img.id !== imageId);
				setPrimaryImageId(remaining[0]?.id ?? null);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to remove image");
		}
	};

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-[420px] sm:w-[540px] overflow-y-auto">
				<SheetHeader>
					<SheetTitle>
						{isEditing ? "Edit Character" : "New Character"}
					</SheetTitle>
					<SheetDescription>
						{isEditing
							? "Update your character's details and reference images."
							: "Create a reusable character for your projects."}
					</SheetDescription>
				</SheetHeader>

				<form onSubmit={handleSubmit} className="mt-6 space-y-6">
					{error && (
						<ErrorAlert message={error} onDismiss={() => setError(null)} />
					)}

					<div className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="name">Name</Label>
							<Input
								id="name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="e.g., Detective Sarah"
								maxLength={100}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="description">Description</Label>
							<Textarea
								id="description"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="Background, personality, role in your stories..."
								rows={3}
								maxLength={5000}
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="visualPromptFragment">Visual Prompt</Label>
							<Textarea
								id="visualPromptFragment"
								value={visualPromptFragment}
								onChange={(e) => setVisualPromptFragment(e.target.value)}
								placeholder="Visual description for AI image generation, e.g., 'tall woman with short silver hair, wearing a dark trench coat'"
								rows={3}
								maxLength={2000}
							/>
							<p className="text-xs text-muted-foreground">
								This will be injected into image generation prompts when this
								character appears in shots.
							</p>
						</div>
					</div>

					{isEditing && (
						<div className="space-y-3">
							<div className="flex items-center justify-between">
								<Label>Reference Images</Label>
								<label className="cursor-pointer">
									<input
										type="file"
										accept="image/*"
										className="hidden"
										onChange={(e) => {
											const file = e.target.files?.[0];
											if (file) void handleImageUpload(file);
										}}
										disabled={isUploading}
									/>
									<Button
										type="button"
										variant="outline"
										size="sm"
										className="gap-1.5"
										disabled={isUploading}
										asChild
									>
										<span>
											{isUploading ? (
												<Loader2 size={14} className="animate-spin" />
											) : (
												<Upload size={14} />
											)}
											Upload
										</span>
									</Button>
								</label>
							</div>

							{images.length === 0 ? (
								<div className="border border-dashed rounded-lg p-6 text-center">
									<ImagePlus
										size={24}
										className="mx-auto text-muted-foreground/50 mb-2"
									/>
									<p className="text-sm text-muted-foreground">
										No images yet. Upload reference images to maintain visual
										consistency.
									</p>
								</div>
							) : (
								<div className="grid grid-cols-3 gap-2">
									{images.map((image) => {
										const isPrimary = primaryImageId === image.id;
										return (
											<div
												key={image.id}
												className={`relative group rounded-lg overflow-hidden border-2 ${
													isPrimary
														? "border-primary ring-2 ring-primary/25"
														: "border-transparent"
												}`}
											>
												<img
													src={image.url}
													alt={image.label ?? "Reference"}
													className="aspect-square w-full object-cover"
												/>
												<div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
													{!isPrimary && (
														<Button
															type="button"
															variant="secondary"
															size="icon"
															className="h-7 w-7"
															onClick={() => handleSetPrimary(image.id)}
															title="Set as primary"
														>
															<Star size={12} />
														</Button>
													)}
													<Button
														type="button"
														variant="secondary"
														size="icon"
														className="h-7 w-7 text-destructive hover:text-destructive"
														onClick={() => handleRemoveImage(image.id)}
														title="Remove image"
													>
														<Trash2 size={12} />
													</Button>
												</div>
												{isPrimary && (
													<div className="absolute bottom-1 left-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5">
														<Star size={8} className="fill-current" />
														Primary
													</div>
												)}
											</div>
										);
									})}
								</div>
							)}
						</div>
					)}

					<div className="flex justify-end gap-2 pt-4 border-t">
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button type="submit" variant="accent" disabled={isSubmitting}>
							{isSubmitting ? (
								<>
									<Loader2 size={14} className="animate-spin mr-1.5" />
									{isEditing ? "Saving..." : "Creating..."}
								</>
							) : isEditing ? (
								"Save Changes"
							) : (
								"Create Character"
							)}
						</Button>
					</div>
				</form>
			</SheetContent>
		</Sheet>
	);
}

function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(new Error("Failed to read file"));
		reader.readAsDataURL(file);
	});
}
