import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
	ImageDefaults,
	PromptAssetType,
	PromptAssetTypeSelection,
} from "../../project-types";
import { InlineSettingsRow } from "./inline-settings-row";
import { PromptEditor } from "./prompt-editor";

export function StudioLeftPanel({
	prompt,
	onPromptChange,
	onPromptBlur,
	onGeneratePrompt,
	isGeneratingPrompt,
	detectedPromptAssetType,
	promptTypeSelection,
	onPromptTypeSelectionChange,
	settingsOverrides,
	onSettingsChange,
	isGenerating,
	onGenerate,
}: {
	prompt: string;
	onPromptChange: (value: string) => void;
	onPromptBlur?: () => void;
	onGeneratePrompt: () => void;
	isGeneratingPrompt: boolean;
	detectedPromptAssetType?: PromptAssetType | null;
	promptTypeSelection?: PromptAssetTypeSelection;
	onPromptTypeSelectionChange?: (value: PromptAssetTypeSelection) => void;
	settingsOverrides: ImageDefaults;
	onSettingsChange: (settings: ImageDefaults) => void;
	isGenerating: boolean;
	onGenerate: () => void;
}) {
	return (
		<div className="w-[380px] border-r flex flex-col shrink-0 bg-card">
			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				<div className="space-y-4">
					<PromptEditor
						prompt={prompt}
						onPromptChange={onPromptChange}
						onPromptBlur={onPromptBlur}
						onGeneratePrompt={onGeneratePrompt}
						isGeneratingPrompt={isGeneratingPrompt}
						detectedAssetType={detectedPromptAssetType}
						promptTypeSelection={promptTypeSelection}
						onPromptTypeSelectionChange={onPromptTypeSelectionChange}
					/>

					<InlineSettingsRow
						settings={settingsOverrides}
						onSettingsChange={onSettingsChange}
					/>
				</div>
			</div>

			{/* Sticky generate button */}
			<div className="p-4 border-t bg-card">
				<Button
					onClick={onGenerate}
					disabled={isGenerating}
					className="w-full gap-2"
					size="lg"
				>
					{isGenerating ? (
						<Loader2 size={16} className="animate-spin" />
					) : (
						<Wand2 size={16} />
					)}
					{isGenerating ? "Generating..." : "Generate images"}
				</Button>
			</div>
		</div>
	);
}
