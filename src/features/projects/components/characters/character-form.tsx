import { Loader2 } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Character } from "../../project-types";

interface CharacterFormProps {
	character?: Character;
	onSubmit: (data: {
		name: string;
		description: string;
		visualPromptFragment: string;
	}) => Promise<void>;
	onCancel: () => void;
	isSubmitting?: boolean;
}

export function CharacterForm({
	character,
	onSubmit,
	onCancel,
	isSubmitting,
}: CharacterFormProps) {
	const [name, setName] = useState(character?.name ?? "");
	const [description, setDescription] = useState(character?.description ?? "");
	const [visualPromptFragment, setVisualPromptFragment] = useState(
		character?.visualPromptFragment ?? "",
	);

	const nameId = useId();
	const descriptionId = useId();
	const visualPromptId = useId();

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim() || !visualPromptFragment.trim()) return;
		await onSubmit({
			name: name.trim(),
			description: description.trim(),
			visualPromptFragment: visualPromptFragment.trim(),
		});
	};

	const isEditing = !!character;

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor={nameId}>Name</Label>
				<Input
					id={nameId}
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="e.g., Alex the Explorer"
					required
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor={descriptionId}>Description</Label>
				<Textarea
					id={descriptionId}
					value={description}
					onChange={(e) => setDescription(e.target.value)}
					placeholder="Physical appearance, personality traits, backstory..."
					rows={3}
				/>
				<p className="text-xs text-muted-foreground">
					Detailed character description for your reference.
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor={visualPromptId}>Visual Prompt Fragment</Label>
				<Textarea
					id={visualPromptId}
					value={visualPromptFragment}
					onChange={(e) => setVisualPromptFragment(e.target.value)}
					placeholder="e.g., young adventurer with curly red hair, green eyes, wearing a brown leather jacket and hiking boots"
					rows={3}
					required
				/>
				<p className="text-xs text-muted-foreground">
					This text will be injected into image and video prompts. Be specific
					about visual details.
				</p>
			</div>

			<div className="flex gap-2 justify-end pt-2">
				<Button type="button" variant="outline" onClick={onCancel}>
					Cancel
				</Button>
				<Button type="submit" disabled={isSubmitting}>
					{isSubmitting && <Loader2 size={14} className="animate-spin mr-2" />}
					{isEditing ? "Update character" : "Add character"}
				</Button>
			</div>
		</form>
	);
}
