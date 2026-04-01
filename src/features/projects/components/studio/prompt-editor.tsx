import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { useId } from "react";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
	PromptAssetType,
	PromptAssetTypeSelection,
} from "../../project-types";
import { getPromptAssetTypeLabel } from "../../prompt-strategy";
import { CopyPromptButton } from "./copy-prompt-button";

export function PromptEditor({
	prompt,
	onPromptChange,
	onPromptBlur,
	onGeneratePrompt,
	isGeneratingPrompt,
	onEnhancePrompt,
	isEnhancingPrompt,
	detectedAssetType,
	promptTypeSelection,
	onPromptTypeSelectionChange,
}: {
	prompt: string;
	onPromptChange: (value: string) => void;
	onPromptBlur?: () => void;
	onGeneratePrompt?: () => void;
	isGeneratingPrompt?: boolean;
	onEnhancePrompt?: () => void;
	isEnhancingPrompt?: boolean;
	detectedAssetType?: PromptAssetType | null;
	promptTypeSelection?: PromptAssetTypeSelection;
	onPromptTypeSelectionChange?: (value: PromptAssetTypeSelection) => void;
}) {
	const isBusy = isGeneratingPrompt || isEnhancingPrompt;
	const textareaId = useId();
	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<label
					htmlFor={textareaId}
					className="text-xs font-medium text-muted-foreground"
				>
					Image Prompt
				</label>
				<div className="flex items-center gap-1">
					<CopyPromptButton value={prompt} />
					{onEnhancePrompt && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={onEnhancePrompt}
									disabled={isBusy || !prompt.trim()}
									className="p-1.5 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors disabled:opacity-40"
								>
									{isEnhancingPrompt ? (
										<Loader2 size={13} className="animate-spin" />
									) : (
										<Wand2 size={13} />
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<p>Enhance your prompt</p>
							</TooltipContent>
						</Tooltip>
					)}
					{onGeneratePrompt && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									onClick={onGeneratePrompt}
									disabled={isBusy}
									className="p-1.5 rounded-md bg-foreground text-background hover:bg-foreground/80 transition-colors disabled:opacity-50"
								>
									{isGeneratingPrompt ? (
										<Loader2 size={13} className="animate-spin" />
									) : (
										<Sparkles size={13} />
									)}
								</button>
							</TooltipTrigger>
							<TooltipContent side="bottom">
								<p>Generate prompt with AI</p>
							</TooltipContent>
						</Tooltip>
					)}
				</div>
			</div>
			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					<span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
						Prompt type
					</span>
					{detectedAssetType && (
						<span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-foreground">
							Detected: {getPromptAssetTypeLabel(detectedAssetType)}
						</span>
					)}
				</div>
				{onPromptTypeSelectionChange && (
					<select
						value={promptTypeSelection ?? "auto"}
						onChange={(e) =>
							onPromptTypeSelectionChange(
								e.target.value as PromptAssetTypeSelection,
							)
						}
						className="h-7 rounded-md border border-border bg-background px-2 text-[10px] font-medium text-foreground"
					>
						<option value="auto">Auto detect</option>
						<option value="cinematic">Cinematic</option>
						<option value="documentary">Documentary</option>
						<option value="infographic">Infographic</option>
						<option value="text_graphic">Text Graphic</option>
						<option value="talking_head">Talking Head</option>
						<option value="transition">Transition</option>
					</select>
				)}
			</div>
			<textarea
				id={textareaId}
				value={prompt}
				onChange={(e) => onPromptChange(e.target.value)}
				onBlur={onPromptBlur}
				rows={10}
				disabled={isBusy}
				className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-background disabled:opacity-50"
				placeholder="Describe the image to generate..."
			/>
		</div>
	);
}
