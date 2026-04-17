import { Check, Library, Loader2, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import {
	type GlobalCharacterWithImages,
	importCharacterToProject,
	listGlobalCharacters,
} from "@/features/library/global-character-actions";

interface ImportFromLibraryDialogProps {
	projectId: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onImported: () => void;
	existingCharacterIds?: string[];
}

export function ImportFromLibraryDialog({
	projectId,
	open,
	onOpenChange,
	onImported,
	existingCharacterIds = [],
}: ImportFromLibraryDialogProps) {
	const [characters, setCharacters] = useState<GlobalCharacterWithImages[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	const [importing, setImporting] = useState(false);

	const loadCharacters = useCallback(async () => {
		setLoading(true);
		setError(null);
		try {
			const result = await listGlobalCharacters();
			setCharacters(result);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load library");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		if (open) {
			void loadCharacters();
			setSelectedIds(new Set());
		}
	}, [open, loadCharacters]);

	const toggleSelection = (id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const handleImport = async () => {
		if (selectedIds.size === 0) return;

		setImporting(true);
		setError(null);

		try {
			for (const characterId of selectedIds) {
				await importCharacterToProject({
					data: { characterId, projectId },
				});
			}
			onImported();
			onOpenChange(false);
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to import characters",
			);
		} finally {
			setImporting(false);
		}
	};

	// Filter out already imported characters
	const availableCharacters = characters.filter(
		(c) => !existingCharacterIds.includes(c.id),
	);

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto">
				<SheetHeader>
					<SheetTitle className="flex items-center gap-2">
						<Library size={18} />
						Import from Library
					</SheetTitle>
					<SheetDescription>
						Select characters from your library to add to this project.
					</SheetDescription>
				</SheetHeader>

				<div className="mt-6 space-y-4">
					{error && (
						<ErrorAlert message={error} onDismiss={() => setError(null)} />
					)}

					<div className="max-h-[400px] overflow-y-auto">
						{loading ? (
							<div className="flex items-center justify-center py-12">
								<Loader2 size={24} className="animate-spin text-muted-foreground" />
							</div>
						) : availableCharacters.length === 0 ? (
							<div className="text-center py-12">
								<Users size={32} className="mx-auto text-muted-foreground/50 mb-2" />
								<p className="text-sm text-muted-foreground">
									{characters.length === 0
										? "No characters in your library yet."
										: "All library characters are already in this project."}
								</p>
							</div>
						) : (
							<div className="space-y-2">
								{availableCharacters.map((character) => {
									const isSelected = selectedIds.has(character.id);
									const primaryImage = character.images.find(
										(img) => img.id === character.primaryImageId,
									);
									const displayImage = primaryImage ?? character.images[0];

									return (
										<button
											key={character.id}
											type="button"
											onClick={() => toggleSelection(character.id)}
											className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
												isSelected
													? "border-primary bg-primary/5"
													: "border-border hover:border-muted-foreground/30 hover:bg-muted/50"
											}`}
										>
											<div className="w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0">
												{displayImage ? (
													<img
														src={displayImage.url}
														alt={character.name}
														className="w-full h-full object-cover"
													/>
												) : (
													<div className="w-full h-full flex items-center justify-center">
														<Users size={20} className="text-muted-foreground/50" />
													</div>
												)}
											</div>
											<div className="flex-1 min-w-0">
												<p className="font-medium text-sm truncate">
													{character.name}
												</p>
												{character.description && (
													<p className="text-xs text-muted-foreground line-clamp-1">
														{character.description}
													</p>
												)}
											</div>
											<div
												className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
													isSelected
														? "border-primary bg-primary text-primary-foreground"
														: "border-muted-foreground/30"
												}`}
											>
												{isSelected && <Check size={12} />}
											</div>
										</button>
									);
								})}
							</div>
						)}
					</div>

					<div className="flex justify-end gap-2 pt-4 border-t">
						<Button variant="outline" onClick={() => onOpenChange(false)}>
							Cancel
						</Button>
						<Button
							variant="accent"
							onClick={handleImport}
							disabled={selectedIds.size === 0 || importing}
						>
							{importing ? (
								<>
									<Loader2 size={14} className="animate-spin mr-1.5" />
									Importing...
								</>
							) : (
								<>
									Import {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
								</>
							)}
						</Button>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}
