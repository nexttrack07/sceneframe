import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PromptEditor } from "../studio/prompt-editor";

interface ReferenceEntityFormProps {
	nameLabel: string;
	contextLabel: string;
	namePlaceholder: string;
	descriptionPlaceholder: string;
	descriptionHelp: string;
	promptLabel: string;
	promptPlaceholder: string;
	promptHelp: string;
	referenceSection?: React.ReactNode;
	nameValue?: string;
	descriptionValue?: string;
	promptValue: string;
	onPromptValueChange: (value: string) => void;
	editingImageUrl?: string | null;
	onClearEditingImage?: () => void;
	onSubmit: (data: {
		name: string;
		description: string;
		visualPromptFragment: string;
	}) => Promise<void>;
	isSubmitting?: boolean;
	submitLabel: string;
	settingsSection?: React.ReactNode;
	onGeneratePrompt?: (draft: {
		name: string;
		description: string;
	}) => Promise<string>;
}

export function ReferenceEntityForm({
	nameLabel,
	contextLabel,
	namePlaceholder,
	descriptionPlaceholder,
	descriptionHelp,
	promptLabel,
	promptPlaceholder,
	promptHelp,
	referenceSection,
	nameValue = "",
	descriptionValue = "",
	promptValue,
	onPromptValueChange,
	editingImageUrl,
	onClearEditingImage,
	onSubmit,
	isSubmitting,
	submitLabel,
	settingsSection,
	onGeneratePrompt,
}: ReferenceEntityFormProps) {
	const [name, setName] = useState(nameValue);
	const [description, setDescription] = useState(descriptionValue);
	const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
	const [isContextOpen, setIsContextOpen] = useState(false);

	const nameId = useId();
	const descriptionId = useId();

	useEffect(() => {
		setName(nameValue);
		setDescription(descriptionValue);
	}, [descriptionValue, nameValue]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim() || !promptValue.trim()) return;
		await onSubmit({
			name: name.trim(),
			description: description.trim(),
			visualPromptFragment: promptValue.trim(),
		});
	};

	const handleGeneratePrompt = async () => {
		if (!onGeneratePrompt || !name.trim()) return;
		setIsGeneratingPrompt(true);
		try {
			const prompt = await onGeneratePrompt({
				name: name.trim(),
				description: description.trim(),
			});
			onPromptValueChange(prompt);
		} finally {
			setIsGeneratingPrompt(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="flex h-full min-h-0 flex-col">
			<div className="flex-1 space-y-4 overflow-y-auto pr-1">
				<div className="space-y-3">
					<button
						type="button"
						onClick={() => setIsContextOpen((prev) => !prev)}
						className="flex w-full items-center gap-2 text-left"
					>
						{isContextOpen ? (
							<ChevronUp size={14} />
						) : (
							<ChevronDown size={14} />
						)}
						<span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
							{contextLabel}
						</span>
					</button>

					{isContextOpen ? (
						<div className="space-y-3">
							<div className="space-y-2">
								<Label htmlFor={nameId}>{nameLabel}</Label>
								<Input
									id={nameId}
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder={namePlaceholder}
									required
								/>
							</div>

							<div className="space-y-2">
								<Label htmlFor={descriptionId}>Description</Label>
								<Textarea
									id={descriptionId}
									value={description}
									onChange={(e) => setDescription(e.target.value)}
									placeholder={descriptionPlaceholder}
									rows={3}
								/>
								<p className="text-xs text-muted-foreground">
									{descriptionHelp}
								</p>
							</div>
						</div>
					) : null}
				</div>

				{referenceSection}

				{editingImageUrl ? (
					<div className="space-y-1.5">
						<p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
							Edit source
						</p>
						<div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
							<img
								src={editingImageUrl}
								alt="Edit source"
								className="h-14 w-14 rounded-md border border-border object-cover"
							/>
							<div className="min-w-0 flex-1">
								<p className="text-xs font-medium text-foreground">
									Generating from selected image
								</p>
								<p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
									New images will use this selected reference as the edit source
									until you clear it.
								</p>
							</div>
							{onClearEditingImage ? (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={onClearEditingImage}
								>
									Clear
								</Button>
							) : null}
						</div>
					</div>
				) : null}

				<div className="space-y-2">
					<PromptEditor
						prompt={promptValue}
						onPromptChange={onPromptValueChange}
						onGeneratePrompt={
							onGeneratePrompt && name.trim() ? handleGeneratePrompt : undefined
						}
						isGeneratingPrompt={isGeneratingPrompt}
						label={promptLabel}
						placeholder={promptPlaceholder}
						showPromptTypeControls={false}
					/>
					<p className="text-xs text-muted-foreground">{promptHelp}</p>
				</div>

				{settingsSection ? (
					<div className="space-y-2">{settingsSection}</div>
				) : null}
			</div>

			<div className="-mx-4 mt-4 border-t bg-card px-4 py-4">
				<Button
					type="submit"
					disabled={isSubmitting || !name.trim() || !promptValue.trim()}
					className="h-11 w-full"
					size="lg"
				>
					{isSubmitting ? (
						<Loader2 size={14} className="mr-2 animate-spin" />
					) : null}
					{submitLabel}
				</Button>
			</div>
		</form>
	);
}
