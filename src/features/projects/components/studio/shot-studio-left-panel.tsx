import { Check, Loader2, Pencil, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Shot } from "@/db/schema";
import type {
	ImageDefaults,
	PromptAssetType,
	PromptAssetTypeSelection,
} from "../../project-types";
import { InlineSettingsRow } from "./inline-settings-row";
import { ProjectVisualReferenceSelector } from "./project-visual-reference-selector";
import { PromptEditor } from "./prompt-editor";
import { ShotContextSection } from "./shot-context-section";
import { VisualReferencesSection } from "./visual-references-section";

function ContextToggleCard({
	label,
	description,
	checked,
	onChange,
	disabled,
}: {
	label: string;
	description: string;
	checked: boolean;
	onChange: (v: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={() => onChange(!checked)}
			disabled={disabled}
			className={`flex items-start gap-2 p-2 rounded-lg border text-left transition-all w-full disabled:opacity-40 disabled:cursor-not-allowed ${
				checked
					? "border-primary/40 bg-primary/5"
					: "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40"
			}`}
		>
			<div
				className={`mt-0.5 h-3.5 w-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
					checked ? "bg-primary border-primary" : "border-muted-foreground/40"
				}`}
			>
				{checked && <Check size={9} className="text-primary-foreground" />}
			</div>
			<div>
				<p
					className={`text-xs font-medium leading-tight ${checked ? "text-foreground" : "text-muted-foreground"}`}
				>
					{label}
				</p>
				<p className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">
					{description}
				</p>
			</div>
		</button>
	);
}

export function ShotStudioLeftPanel({
	shot,
	prompt,
	onPromptChange,
	onGeneratePrompt,
	isGeneratingPrompt,
	onEnhancePrompt,
	isEnhancingPrompt,
	detectedPromptAssetType,
	promptTypeSelection,
	onPromptTypeSelectionChange,
	settingsOverrides,
	onSettingsChange,
	isQueueing,
	onGenerate,
	onDescriptionSaved,
	refImageUrl,
	useRefImage,
	onUseRefImageChange,
	useProjectContext,
	onUseProjectContextChange,
	usePrevShotContext,
	onUsePrevShotContextChange,
	projectId,
	selectedCharacterIds,
	onSelectedCharacterIdsChange,
	projectCharacterCount = 0,
	selectedLocationIds,
	onSelectedLocationIdsChange,
	projectLocationCount = 0,
	editingReferenceUrl,
	onClearEditingReference,
	userReferenceUrls,
	isUploadingReference,
	onUploadReference,
	onRemoveReference,
	hideContext,
}: {
	shot: Shot;
	prompt: string;
	onPromptChange: (value: string) => void;
	onGeneratePrompt: () => void;
	isGeneratingPrompt: boolean;
	onEnhancePrompt?: () => void;
	isEnhancingPrompt?: boolean;
	detectedPromptAssetType?: PromptAssetType | null;
	promptTypeSelection?: PromptAssetTypeSelection;
	onPromptTypeSelectionChange?: (value: PromptAssetTypeSelection) => void;
	settingsOverrides: ImageDefaults;
	onSettingsChange: (settings: ImageDefaults) => void;
	isQueueing: boolean;
	onGenerate: () => void;
	onDescriptionSaved?: (newDescription: string) => void;
	refImageUrl?: string | null;
	useRefImage?: boolean;
	onUseRefImageChange?: (v: boolean) => void;
	useProjectContext?: boolean;
	onUseProjectContextChange?: (v: boolean) => void;
	usePrevShotContext?: boolean;
	onUsePrevShotContextChange?: (v: boolean) => void;
	projectId: string;
	selectedCharacterIds?: string[];
	onSelectedCharacterIdsChange?: (ids: string[]) => void;
	projectCharacterCount?: number;
	selectedLocationIds?: string[];
	onSelectedLocationIdsChange?: (ids: string[]) => void;
	projectLocationCount?: number;
	editingReferenceUrl?: string | null;
	onClearEditingReference?: () => void;
	userReferenceUrls?: string[];
	isUploadingReference?: boolean;
	onUploadReference?: (file: File) => void;
	onRemoveReference?: (url: string) => void;
	/** When true, hides SceneContextSection and ShotContextSection (rendered externally) */
	hideContext?: boolean;
}) {
	return (
		<div className="flex flex-col h-full bg-card">
			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				{!hideContext && (
					<>
						<ShotContextSection
							shot={shot}
							onDescriptionSaved={onDescriptionSaved}
						/>
					</>
				)}

				<div className={hideContext ? "space-y-3" : "border-t pt-4 space-y-3"}>
					{/* Context toggle cards */}
					<div className="space-y-1.5">
						<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
							Prompt context
						</p>
						<div className="space-y-1.5">
							<ContextToggleCard
								label="Project context"
								description="Include project concept, style, mood, and scene"
								checked={useProjectContext ?? true}
								onChange={(v) => onUseProjectContextChange?.(v)}
							/>
							<ContextToggleCard
								label="Previous shot context"
								description="Include adjacent shot descriptions for continuity"
								checked={usePrevShotContext ?? true}
								onChange={(v) => onUsePrevShotContextChange?.(v)}
							/>
							{refImageUrl && onUseRefImageChange && (
								<ContextToggleCard
									label="Previous shot as reference image"
									description="Feed the previous shot's image to the model"
									checked={useRefImage ?? false}
									onChange={onUseRefImageChange}
								/>
							)}
						</div>
						{/* Reference image thumbnail */}
						{useRefImage && refImageUrl && (
							<img
								src={refImageUrl}
								alt="Reference"
								className="w-full rounded-lg border border-border object-cover aspect-video opacity-80 mt-1"
							/>
						)}
					</div>

					{projectCharacterCount > 0 &&
						selectedCharacterIds &&
						onSelectedCharacterIdsChange && (
							<ProjectVisualReferenceSelector
								projectId={projectId}
								kind="characters"
								selectedIds={selectedCharacterIds}
								onSelectedIdsChange={onSelectedCharacterIdsChange}
								totalSelectedCount={
									(selectedCharacterIds?.length ?? 0) +
									(selectedLocationIds?.length ?? 0)
								}
							/>
						)}

					{projectLocationCount > 0 &&
						selectedLocationIds &&
						onSelectedLocationIdsChange && (
							<ProjectVisualReferenceSelector
								projectId={projectId}
								kind="locations"
								selectedIds={selectedLocationIds}
								onSelectedIdsChange={onSelectedLocationIdsChange}
								totalSelectedCount={
									(selectedCharacterIds?.length ?? 0) +
									(selectedLocationIds?.length ?? 0)
								}
							/>
						)}

					{/* Editing reference image banner */}
					{editingReferenceUrl && (
						<div className="relative rounded-lg border border-primary/40 bg-primary/5 overflow-hidden">
							<img
								src={editingReferenceUrl}
								alt="Editing reference"
								className="w-full aspect-video object-cover opacity-80"
							/>
							<div className="absolute top-1.5 left-2 flex items-center gap-1">
								<Pencil size={10} className="text-primary" />
								<span className="text-[10px] font-medium text-primary uppercase tracking-wide">
									Editing
								</span>
							</div>
							{onClearEditingReference && (
								<button
									type="button"
									onClick={onClearEditingReference}
									className="absolute top-1.5 right-1.5 bg-black/60 text-white p-1.5 rounded-md hover:bg-black/80 transition-colors"
								>
									<X size={14} />
								</button>
							)}
						</div>
					)}

					{/* User-uploaded visual references */}
					{onUploadReference && onRemoveReference && (
						<VisualReferencesSection
							referenceUrls={userReferenceUrls ?? []}
							isUploading={isUploadingReference ?? false}
							onUpload={onUploadReference}
							onRemove={onRemoveReference}
						/>
					)}

					<PromptEditor
						prompt={prompt}
						onPromptChange={onPromptChange}
						onGeneratePrompt={onGeneratePrompt}
						isGeneratingPrompt={isGeneratingPrompt}
						onEnhancePrompt={onEnhancePrompt}
						isEnhancingPrompt={isEnhancingPrompt}
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
					disabled={isQueueing}
					variant="accent"
					className="w-full gap-2"
					size="lg"
				>
					{isQueueing ? (
						<Loader2 size={16} className="animate-spin" />
					) : editingReferenceUrl ? (
						<Pencil size={16} />
					) : (
						<Wand2 size={16} />
					)}
					{isQueueing
						? editingReferenceUrl
							? "Queueing edit..."
							: "Queueing..."
						: editingReferenceUrl
							? "Edit image"
							: "Generate images"}
				</Button>
			</div>
		</div>
	);
}
