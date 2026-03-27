import { Loader2, Pencil, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Character } from "../../project-types";

interface CharacterCardProps {
	character: Character;
	images?: Array<{ id: string; url: string; label?: string | null }>;
	onEdit: (character: Character) => void;
	onDelete: (characterId: string) => void;
	isDeleting?: boolean;
}

export function CharacterCard({
	character,
	images = [],
	onEdit,
	onDelete,
	isDeleting,
}: CharacterCardProps) {
	return (
		<div className="rounded-lg border bg-card p-4 space-y-3">
			<div className="flex items-start justify-between gap-2">
				<div className="flex items-center gap-2 min-w-0">
					<div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
						<User size={16} className="text-muted-foreground" />
					</div>
					<div className="min-w-0">
						<h3 className="font-medium text-sm truncate">{character.name}</h3>
						<p className="text-xs text-muted-foreground line-clamp-1">
							{character.description}
						</p>
					</div>
				</div>
				<div className="flex items-center gap-1 flex-shrink-0">
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7"
						onClick={() => onEdit(character)}
						disabled={isDeleting}
					>
						<Pencil size={14} />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						className="h-7 w-7 text-destructive hover:text-destructive"
						onClick={() => onDelete(character.id)}
						disabled={isDeleting}
					>
						{isDeleting ? (
							<Loader2 size={14} className="animate-spin" />
						) : (
							<Trash2 size={14} />
						)}
					</Button>
				</div>
			</div>

			{character.visualPromptFragment && (
				<div className="text-xs bg-muted/50 rounded-md p-2 text-muted-foreground">
					<span className="font-medium text-foreground">Prompt: </span>
					{character.visualPromptFragment}
				</div>
			)}

			{images.length > 0 && (
				<div className="flex gap-1.5 overflow-x-auto">
					{images.map((img) => (
						<img
							key={img.id}
							src={img.url}
							alt={img.label ?? character.name}
							className="h-16 w-16 rounded-md object-cover flex-shrink-0 border"
						/>
					))}
				</div>
			)}
		</div>
	);
}
