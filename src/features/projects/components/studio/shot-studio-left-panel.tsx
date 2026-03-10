import { Check, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Scene, Shot } from "@/db/schema";
import type { ImageDefaults } from "../../project-types";
import { InlineSettingsRow } from "./inline-settings-row";
import { PromptEditor } from "./prompt-editor";
import { ShotContextSection } from "./shot-context-section";

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
	parentScene,
	prompt,
	onPromptChange,
	onGeneratePrompt,
	isGeneratingPrompt,
	onEnhancePrompt,
	isEnhancingPrompt,
	settingsOverrides,
	onSettingsChange,
	isGenerating,
	onGenerate,
	onDescriptionSaved,
	refImageUrl,
	useRefImage,
	onUseRefImageChange,
	useProjectContext,
	onUseProjectContextChange,
	usePrevShotContext,
	onUsePrevShotContextChange,
}: {
	shot: Shot;
	parentScene: Scene;
	prompt: string;
	onPromptChange: (value: string) => void;
	onGeneratePrompt: () => void;
	isGeneratingPrompt: boolean;
	onEnhancePrompt?: () => void;
	isEnhancingPrompt?: boolean;
	settingsOverrides: ImageDefaults;
	onSettingsChange: (settings: ImageDefaults) => void;
	isGenerating: boolean;
	onGenerate: () => void;
	onDescriptionSaved?: (newDescription: string) => void;
	refImageUrl?: string | null;
	useRefImage?: boolean;
	onUseRefImageChange?: (v: boolean) => void;
	useProjectContext?: boolean;
	onUseProjectContextChange?: (v: boolean) => void;
	usePrevShotContext?: boolean;
	onUsePrevShotContextChange?: (v: boolean) => void;
}) {
	return (
		<div className="flex flex-col h-full bg-card">
			{/* Scrollable content */}
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				<ShotContextSection
					shot={shot}
					parentScene={parentScene}
					onDescriptionSaved={onDescriptionSaved}
				/>

				<div className="border-t pt-4 space-y-3">
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
								alt="Reference image"
								className="w-full rounded-lg border border-border object-cover aspect-video opacity-80 mt-1"
							/>
						)}
					</div>

					<PromptEditor
						prompt={prompt}
						onPromptChange={onPromptChange}
						onGeneratePrompt={onGeneratePrompt}
						isGeneratingPrompt={isGeneratingPrompt}
						onEnhancePrompt={onEnhancePrompt}
						isEnhancingPrompt={isEnhancingPrompt}
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
