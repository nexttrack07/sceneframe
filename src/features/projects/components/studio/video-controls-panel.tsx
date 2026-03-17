import {
	Check,
	ChevronDown,
	ChevronUp,
	Film,
	Loader2,
	Sparkles,
	Wand2,
} from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Shot } from "@/db/schema";

export type VideoModel = "v3-omni" | "v2.5-turbo";

const V3_DURATION_OPTIONS = [3, 5, 7, 10, 15];
const V25_DURATION_OPTIONS = [5, 10];

export function VideoControlsPanel({
	fromShot,
	toShot,
	videoPrompt,
	onVideoPromptChange,
	onGeneratePrompt,
	isGeneratingPrompt,
	onEnhancePrompt,
	isEnhancingPrompt,
	videoModel,
	onVideoModelChange,
	videoMode,
	onVideoModeChange,
	videoDuration,
	onVideoDurationChange,
	generateAudio,
	onGenerateAudioChange,
	negativePrompt,
	onNegativePromptChange,
	useProjectContext,
	onUseProjectContextChange,
	usePrevShotContext,
	onUsePrevShotContextChange,
	isGenerating,
	onGenerate,
}: {
	fromShot: Shot;
	toShot: Shot;
	videoPrompt: string;
	onVideoPromptChange: (v: string) => void;
	onGeneratePrompt: () => void;
	isGeneratingPrompt: boolean;
	onEnhancePrompt?: () => void;
	isEnhancingPrompt?: boolean;
	videoModel: VideoModel;
	onVideoModelChange: (m: VideoModel) => void;
	videoMode: "standard" | "pro";
	onVideoModeChange: (m: "standard" | "pro") => void;
	videoDuration: number;
	onVideoDurationChange: (d: number) => void;
	generateAudio: boolean;
	onGenerateAudioChange: (v: boolean) => void;
	negativePrompt: string;
	onNegativePromptChange: (v: string) => void;
	useProjectContext: boolean;
	onUseProjectContextChange: (v: boolean) => void;
	usePrevShotContext: boolean;
	onUsePrevShotContextChange: (v: boolean) => void;
	isGenerating: boolean;
	onGenerate: () => void;
}) {
	const [showDescriptions, setShowDescriptions] = useState(true);
	const isBusy = isGeneratingPrompt || isEnhancingPrompt;
	const isV25 = videoModel === "v2.5-turbo";
	const motionPromptId = useId();
	const negativePromptId = useId();
	const durationOptions = isV25 ? V25_DURATION_OPTIONS : V3_DURATION_OPTIONS;

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				{/* Shot descriptions */}
				<div className="space-y-2">
					<button
						type="button"
						onClick={() => setShowDescriptions(!showDescriptions)}
						className="flex items-center gap-2 w-full text-left"
					>
						{showDescriptions ? (
							<ChevronUp size={14} />
						) : (
							<ChevronDown size={14} />
						)}
						<span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
							Transition context
						</span>
					</button>
					{showDescriptions && (
						<div className="space-y-2 text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
							<div>
								<span className="font-medium text-foreground">From:</span>{" "}
								{fromShot.description}
							</div>
							<div>
								<span className="font-medium text-foreground">To:</span>{" "}
								{toShot.description}
							</div>
						</div>
					)}
				</div>

				{/* Prompt context toggles */}
				<div className="space-y-1.5">
					<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
						Prompt context
					</p>
					<div className="space-y-1.5">
						<button
							type="button"
							onClick={() => onUseProjectContextChange(!useProjectContext)}
							className={`flex items-start gap-2 p-2 rounded-lg border text-left transition-all w-full ${
								useProjectContext
									? "border-primary/40 bg-primary/5"
									: "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40"
							}`}
						>
							<div
								className={`mt-0.5 h-3.5 w-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
									useProjectContext
										? "bg-primary border-primary"
										: "border-muted-foreground/40"
								}`}
							>
								{useProjectContext && (
									<Check size={9} className="text-primary-foreground" />
								)}
							</div>
							<div>
								<p
									className={`text-xs font-medium leading-tight ${useProjectContext ? "text-foreground" : "text-muted-foreground"}`}
								>
									Project context
								</p>
								<p className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">
									Include project concept, style, mood, and scene
								</p>
							</div>
						</button>
						<button
							type="button"
							onClick={() => onUsePrevShotContextChange(!usePrevShotContext)}
							className={`flex items-start gap-2 p-2 rounded-lg border text-left transition-all w-full ${
								usePrevShotContext
									? "border-primary/40 bg-primary/5"
									: "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40"
							}`}
						>
							<div
								className={`mt-0.5 h-3.5 w-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
									usePrevShotContext
										? "bg-primary border-primary"
										: "border-muted-foreground/40"
								}`}
							>
								{usePrevShotContext && (
									<Check size={9} className="text-primary-foreground" />
								)}
							</div>
							<div>
								<p
									className={`text-xs font-medium leading-tight ${usePrevShotContext ? "text-foreground" : "text-muted-foreground"}`}
								>
									Previous shot context
								</p>
								<p className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">
									Include scene description for transition continuity
								</p>
							</div>
						</button>
					</div>
				</div>

				<div className="border-t pt-4 space-y-4">
					{/* Model selector */}
					<div className="flex items-center justify-between">
						<span className="text-xs font-medium text-muted-foreground">
							Model
						</span>
						<select
							value={videoModel}
							onChange={(e) => onVideoModelChange(e.target.value as VideoModel)}
							className="px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-background"
						>
							<option value="v3-omni">V3 Omni</option>
							<option value="v2.5-turbo">2.5 Turbo</option>
						</select>
					</div>

					{/* Duration selector */}
					<div className="flex items-center justify-between">
						<span className="text-xs font-medium text-muted-foreground">
							Duration
						</span>
						<div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
							{durationOptions.map((d) => (
								<button
									key={d}
									type="button"
									onClick={() => onVideoDurationChange(d)}
									className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${videoDuration === d ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
								>
									{d}s
								</button>
							))}
						</div>
					</div>

					{/* V3 Omni settings */}
					{!isV25 && (
						<div className="flex items-center gap-3">
							<div className="flex items-center gap-1.5 flex-1">
								<span className="text-xs font-medium text-muted-foreground">
									Resolution
								</span>
								<div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5 ml-auto">
									<button
										type="button"
										onClick={() => onVideoModeChange("standard")}
										className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${videoMode === "standard" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
									>
										720p
									</button>
									<button
										type="button"
										onClick={() => onVideoModeChange("pro")}
										className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${videoMode === "pro" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
									>
										1080p
									</button>
								</div>
							</div>
							<label className="flex items-center gap-1.5 cursor-pointer">
								<input
									type="checkbox"
									checked={generateAudio}
									onChange={(e) => onGenerateAudioChange(e.target.checked)}
									className="h-3.5 w-3.5 rounded accent-primary"
								/>
								<span className="text-xs font-medium text-muted-foreground">
									Audio
								</span>
							</label>
						</div>
					)}

					{/* Motion prompt */}
					<div className="space-y-1.5">
						<div className="flex items-center justify-between">
							<label
								htmlFor={motionPromptId}
								className="text-xs font-medium text-muted-foreground"
							>
								Motion prompt
							</label>
							<div className="flex items-center gap-1">
								{onEnhancePrompt && (
									<button
										type="button"
										onClick={onEnhancePrompt}
										disabled={isBusy || !videoPrompt.trim()}
										title="Enhance your prompt"
										className="p-1.5 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors disabled:opacity-40"
									>
										{isEnhancingPrompt ? (
											<Loader2 size={13} className="animate-spin" />
										) : (
											<Wand2 size={13} />
										)}
									</button>
								)}
								<button
									type="button"
									onClick={onGeneratePrompt}
									disabled={isBusy}
									title="Generate prompt from scratch"
									className="p-1.5 rounded-md bg-foreground text-background hover:bg-foreground/80 transition-colors disabled:opacity-50"
								>
									{isGeneratingPrompt ? (
										<Loader2 size={13} className="animate-spin" />
									) : (
										<Sparkles size={13} />
									)}
								</button>
							</div>
						</div>
						<textarea
							id={motionPromptId}
							rows={7}
							value={videoPrompt}
							onChange={(e) => onVideoPromptChange(e.target.value)}
							placeholder="Describe the motion — camera movement, subject action, speed..."
							className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring leading-relaxed"
						/>
					</div>

					{/* V2.5 Turbo negative prompt */}
					{isV25 && (
						<div className="space-y-1.5">
							<label
								htmlFor={negativePromptId}
								className="text-xs font-medium text-muted-foreground"
							>
								Negative prompt
							</label>
							<textarea
								id={negativePromptId}
								rows={3}
								value={negativePrompt}
								onChange={(e) => onNegativePromptChange(e.target.value)}
								placeholder="Things you don't want to see..."
								className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring leading-relaxed"
							/>
						</div>
					)}
				</div>
			</div>

			{/* Sticky generate button */}
			<div className="p-4 border-t bg-card">
				<Button
					onClick={onGenerate}
					disabled={isGenerating || !videoPrompt.trim()}
					className="w-full gap-2"
					size="lg"
				>
					{isGenerating ? (
						<Loader2 size={16} className="animate-spin" />
					) : (
						<Film size={16} />
					)}
					{isGenerating ? "Generating video..." : "Generate video"}
				</Button>
			</div>
		</div>
	);
}
