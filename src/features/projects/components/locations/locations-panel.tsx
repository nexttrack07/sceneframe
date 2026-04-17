import { Library, Loader2, MapPinned, Pencil, Plus, Star, Trash2 } from "lucide-react";
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
import { IMAGE_MODELS } from "../../image-models";
import {
	createLocation,
	deleteLocation,
	generateLocationPrompt,
	generateLocationReferenceImage,
	listLocations,
	setLocationPrimaryImage,
	updateLocation,
	uploadLocationReferenceImage,
} from "../../location-actions";
import type { Location, LocationWithImages } from "../../project-types";
import { ImportFromLibraryDialog } from "./import-from-library-dialog";
import { LocationForm } from "./location-form";

interface LocationsPanelProps {
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onLocationsChanged: () => void;
}

export function LocationsPanel({
	projectId,
	open,
	onOpenChange,
	onLocationsChanged,
}: LocationsPanelProps) {
	const replicateImageModels = useMemo(
		() => IMAGE_MODELS.filter((model) => model.replicateExecution),
		[],
	);
	const [locations, setLocations] = useState<LocationWithImages[]>([]);
	const [loading, setLoading] = useState(false);
	const [showForm, setShowForm] = useState(false);
	const [editingLocation, setEditingLocation] = useState<Location | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [pendingDeleteLocation, setPendingDeleteLocation] =
		useState<LocationWithImages | null>(null);
	const [settingPrimaryImageId, setSettingPrimaryImageId] = useState<
		string | null
	>(null);
	const [imageModelId, setImageModelId] = useState("google/nano-banana");
	const [error, setError] = useState<string | null>(null);
	const [promptDraft, setPromptDraft] = useState("");
	const [showImportDialog, setShowImportDialog] = useState(false);

	const loadLocations = useCallback(async () => {
		setLoading(true);
		try {
			const result = await listLocations({ data: { projectId } });
			setLocations(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load locations");
		} finally {
			setLoading(false);
		}
	}, [projectId]);

	useEffect(() => {
		if (!open) return;
		void loadLocations();
	}, [loadLocations, open]);

	useEffect(() => {
		setPromptDraft(editingLocation?.visualPromptFragment ?? "");
	}, [editingLocation]);

	const refresh = useCallback(async () => {
		await loadLocations();
		onLocationsChanged();
	}, [loadLocations, onLocationsChanged]);

	const handleCreate = async (data: {
		name: string;
		description: string;
		visualPromptFragment: string;
		referenceFile?: File | null;
	}) => {
		setIsSubmitting(true);
		setError(null);
		try {
			const created = await createLocation({
				data: {
					projectId,
					name: data.name,
					description: data.description,
					visualPromptFragment: data.visualPromptFragment,
				},
			});
			if (data.referenceFile) {
				const base64 = await fileToBase64(data.referenceFile);
				const uploaded = await uploadLocationReferenceImage({
					data: {
						projectId,
						locationId: created.id,
						fileBase64: base64,
						fileName: data.referenceFile.name,
						label: data.referenceFile.name,
					},
				});
				await generateLocationReferenceImage({
					data: {
						projectId,
						locationId: created.id,
						modelId: imageModelId,
						referenceImageUrls: [uploaded.url],
					},
				});
			} else {
				await generateLocationReferenceImage({
					data: {
						projectId,
						locationId: created.id,
						modelId: imageModelId,
					},
				});
			}
			setShowForm(false);
			await refresh();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to create location",
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
		if (!editingLocation) return;
		setIsSubmitting(true);
		setError(null);
		try {
			await updateLocation({
				data: {
					projectId,
					locationId: editingLocation.id,
					name: data.name,
					description: data.description,
					visualPromptFragment: data.visualPromptFragment,
				},
			});
			if (data.referenceFile) {
				const base64 = await fileToBase64(data.referenceFile);
				const uploaded = await uploadLocationReferenceImage({
					data: {
						projectId,
						locationId: editingLocation.id,
						fileBase64: base64,
						fileName: data.referenceFile.name,
						label: data.referenceFile.name,
					},
				});
				await generateLocationReferenceImage({
					data: {
						projectId,
						locationId: editingLocation.id,
						modelId: imageModelId,
						referenceImageUrls: [uploaded.url],
					},
				});
			} else {
				await generateLocationReferenceImage({
					data: {
						projectId,
						locationId: editingLocation.id,
						modelId: imageModelId,
					},
				});
			}
			setEditingLocation(null);
			await refresh();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to update location",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDelete = async (locationId: string) => {
		if (deletingId) return;
		setDeletingId(locationId);
		setError(null);
		try {
			await deleteLocation({ data: { projectId, locationId } });
			setPendingDeleteLocation(null);
			await refresh();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to delete location",
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
			const result = await generateLocationPrompt({
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
		locationId: string,
		imageId: string | null,
	) => {
		setSettingPrimaryImageId(imageId);
		setError(null);
		try {
			await setLocationPrimaryImage({
				data: { projectId, locationId, imageId },
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

	const sortedLocations = useMemo(
		() => [...locations].sort((a, b) => a.name.localeCompare(b.name)),
		[locations],
	);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-[420px] overflow-y-auto sm:w-[560px]">
				<SheetHeader>
					<SheetTitle>Locations</SheetTitle>
					<SheetDescription>
						Manage reusable project locations, their prompts, and their visual
						reference images.
					</SheetDescription>
				</SheetHeader>

				<div className="mt-6 space-y-4">
					{error ? (
						<div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
							{error}
						</div>
					) : null}

					<div className="rounded-xl border bg-card p-3">
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

					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-2 text-muted-foreground">
							<MapPinned size={16} className="text-muted-foreground" />
							<span className="text-sm font-medium">
								{loading ? "Loading..." : `${sortedLocations.length} locations`}
							</span>
						</div>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => setShowImportDialog(true)}
								className="gap-1.5"
							>
								<Library size={12} />
								Import from Library
							</Button>
							<Button
								type="button"
								size="sm"
								onClick={() => {
									setEditingLocation(null);
									setShowForm((current) => !current);
								}}
								className="gap-1.5"
							>
								<Plus size={12} />
								Add location
							</Button>
						</div>
					</div>

					{(showForm || editingLocation) && (
						<div className="rounded-xl border bg-card p-4">
							<LocationForm
								location={editingLocation ?? undefined}
								promptValue={promptDraft}
								onPromptValueChange={setPromptDraft}
								onSubmit={editingLocation ? handleUpdate : handleCreate}
								isSubmitting={isSubmitting}
								onGeneratePrompt={handleGeneratePrompt}
							/>
						</div>
					)}

					{!loading && sortedLocations.length === 0 ? (
						<div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
							<div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
								<MapPinned size={18} />
							</div>
							<p className="text-sm">No locations yet</p>
							<p className="mt-1 text-xs">
								Add reusable environments that should stay visually consistent
								across shots.
							</p>
						</div>
					) : null}

					<div className="space-y-3">
						{sortedLocations.map((location) => (
							<div key={location.id} className="rounded-xl border bg-card p-4">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<h3 className="truncate text-sm font-semibold">
											{location.name}
										</h3>
										{location.description ? (
											<p className="mt-1 text-xs text-muted-foreground">
												{location.description}
											</p>
										) : null}
									</div>
									<div className="flex items-center gap-1">
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="h-8 w-8"
											onClick={() => {
												setShowForm(false);
												setEditingLocation(location);
											}}
										>
											<Pencil size={14} />
										</Button>
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="h-8 w-8 text-destructive"
											onClick={() => setPendingDeleteLocation(location)}
											disabled={deletingId === location.id}
										>
											{deletingId === location.id ? (
												<Loader2 size={14} className="animate-spin" />
											) : (
												<Trash2 size={14} />
											)}
										</Button>
									</div>
								</div>

								<div className="mt-3 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
									<span className="font-medium text-foreground">Prompt: </span>
									{location.visualPromptFragment}
								</div>

								<div className="mt-3 flex items-center justify-between gap-3">
									<p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
										Reference images
									</p>
								</div>

								{location.images?.length ? (
									<div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
										{location.images.map((image) => {
											const isPrimary = location.primaryImageId === image.id;
											return (
												<button
													key={image.id}
													type="button"
													onClick={() =>
														handleSetPrimaryImage(location.id, image.id)
													}
													className={`relative overflow-hidden rounded-lg border text-left ${
														isPrimary
															? "border-primary ring-2 ring-primary/20"
															: "border-border"
													}`}
												>
													<img
														src={image.url}
														alt={image.label ?? location.name}
														className="aspect-video w-full object-cover"
													/>
													<div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-2 py-1 text-[10px] text-white">
														<span className="truncate">
															{image.label ?? "Reference"}
														</span>
														{isPrimary ? (
															<span className="inline-flex items-center gap-0.5 rounded bg-white/20 px-1 py-0.5">
																<Star size={9} className="fill-current" />
																Primary
															</span>
														) : settingPrimaryImageId === image.id ? (
															<Loader2 size={10} className="animate-spin" />
														) : null}
													</div>
												</button>
											);
										})}
									</div>
								) : (
									<p className="mt-2 text-xs text-muted-foreground">
										No images yet.
									</p>
								)}
							</div>
						))}
					</div>
				</div>
			</SheetContent>
			<AlertDialog
				open={Boolean(pendingDeleteLocation)}
				onOpenChange={(open) => {
					if (!open) setPendingDeleteLocation(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete location?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove {pendingDeleteLocation?.name ?? "this location"}{" "}
							and its saved reference images.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (pendingDeleteLocation) {
									void handleDelete(pendingDeleteLocation.id);
								}
							}}
							className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
			<ImportFromLibraryDialog
				projectId={projectId}
				open={showImportDialog}
				onOpenChange={setShowImportDialog}
				onImported={refresh}
			/>
		</Sheet>
	);
}

function fileToBase64(file: File) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}
