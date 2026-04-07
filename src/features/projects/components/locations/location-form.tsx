import type { Location } from "../../project-types";
import { ReferenceEntityForm } from "../references/reference-entity-form";

interface LocationFormProps {
	location?: Location;
	editingImageUrl?: string | null;
	onClearEditingImage?: () => void;
	referenceSection?: React.ReactNode;
	promptValue: string;
	onPromptValueChange: (value: string) => void;
	onSubmit: (data: {
		name: string;
		description: string;
		visualPromptFragment: string;
	}) => Promise<void>;
	isSubmitting?: boolean;
	submitLabel?: string;
	settingsSection?: React.ReactNode;
	onGeneratePrompt?: (draft: {
		name: string;
		description: string;
	}) => Promise<string>;
}

export function LocationForm({
	location,
	editingImageUrl,
	onClearEditingImage,
	referenceSection,
	promptValue,
	onPromptValueChange,
	onSubmit,
	isSubmitting,
	submitLabel,
	settingsSection,
	onGeneratePrompt,
}: LocationFormProps) {
	const isEditing = Boolean(location);
	return (
		<ReferenceEntityForm
			nameLabel="Name"
			contextLabel="Location context"
			namePlaceholder="e.g., Mossy twilight forest"
			descriptionPlaceholder="Key environmental details, mood, materials, weather..."
			descriptionHelp="Detailed location notes for your reference."
			promptLabel="Reference Prompt"
			promptPlaceholder="Describe the exact location reference image to generate..."
			promptHelp="Use this to describe the exact reference environment you want generated, including materials, lighting, weather, and atmosphere."
			referenceSection={referenceSection}
			nameValue={location?.name}
			descriptionValue={location?.description}
			promptValue={promptValue}
			onPromptValueChange={onPromptValueChange}
			editingImageUrl={editingImageUrl}
			onClearEditingImage={onClearEditingImage}
			onSubmit={onSubmit}
			isSubmitting={isSubmitting}
			submitLabel={
				submitLabel ?? (isEditing ? "Save changes" : "Create location")
			}
			settingsSection={settingsSection}
			onGeneratePrompt={onGeneratePrompt}
		/>
	);
}
