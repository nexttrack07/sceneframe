import { Plus, Users } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	createCharacter,
	deleteCharacter,
	updateCharacter,
} from "../../character-actions";
import type { Character } from "../../project-types";
import { CharacterCard } from "./character-card";
import { CharacterForm } from "./character-form";

interface CharacterWithImages extends Character {
	images?: Array<{ id: string; url: string; label?: string | null }>;
}

interface CharactersPanelProps {
	projectId: string;
	characters: CharacterWithImages[];
	onCharactersChanged: () => void;
}

export function CharactersPanel({
	projectId,
	characters,
	onCharactersChanged,
}: CharactersPanelProps) {
	const [showForm, setShowForm] = useState(false);
	const [editingCharacter, setEditingCharacter] = useState<Character | null>(
		null,
	);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleCreate = async (data: {
		name: string;
		description: string;
		visualPromptFragment: string;
	}) => {
		setIsSubmitting(true);
		setError(null);
		try {
			await createCharacter({
				data: {
					projectId,
					...data,
				},
			});
			setShowForm(false);
			onCharactersChanged();
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
	}) => {
		if (!editingCharacter) return;
		setIsSubmitting(true);
		setError(null);
		try {
			await updateCharacter({
				data: {
					projectId,
					characterId: editingCharacter.id,
					...data,
				},
			});
			setEditingCharacter(null);
			onCharactersChanged();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to update character",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDelete = async (characterId: string) => {
		if (deletingId) return; // Prevent double-click
		if (!confirm("Delete this character? This cannot be undone.")) return;
		setDeletingId(characterId);
		setError(null);
		try {
			await deleteCharacter({ data: { projectId, characterId } });
			onCharactersChanged();
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to delete character",
			);
		} finally {
			setDeletingId(null);
		}
	};

	const handleEdit = (character: Character) => {
		setEditingCharacter(character);
		setShowForm(false);
	};

	const handleCancel = () => {
		setShowForm(false);
		setEditingCharacter(null);
	};

	return (
		<div className="space-y-4">
			{error && (
				<div className="flex items-center justify-between gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
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
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Users size={16} className="text-muted-foreground" />
					<h2 className="font-medium text-sm">Characters</h2>
					<span className="text-xs text-muted-foreground">
						({characters.length})
					</span>
				</div>
				{!showForm && !editingCharacter && (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setShowForm(true)}
						className="h-7 text-xs"
					>
						<Plus size={14} className="mr-1" />
						Add
					</Button>
				)}
			</div>

			{(showForm || editingCharacter) && (
				<div className="border rounded-lg p-4 bg-muted/20">
					<h3 className="font-medium text-sm mb-3">
						{editingCharacter ? "Edit character" : "New character"}
					</h3>
					<CharacterForm
						character={editingCharacter ?? undefined}
						onSubmit={editingCharacter ? handleUpdate : handleCreate}
						onCancel={handleCancel}
						isSubmitting={isSubmitting}
					/>
				</div>
			)}

			{characters.length === 0 && !showForm ? (
				<div className="text-center py-8 text-muted-foreground">
					<Users size={32} className="mx-auto mb-2 opacity-50" />
					<p className="text-sm">No characters yet</p>
					<p className="text-xs mt-1">
						Add characters that appear across your videos
					</p>
				</div>
			) : (
				<div className="space-y-3">
					{characters.map((character) => (
						<CharacterCard
							key={character.id}
							character={character}
							images={character.images}
							onEdit={handleEdit}
							onDelete={handleDelete}
							isDeleting={deletingId === character.id}
						/>
					))}
				</div>
			)}
		</div>
	);
}
