import {
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ChevronUp,
	Film,
	Loader2,
	Sparkles,
	Wand2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Shot } from "@/db/schema";
import type { VideoDefaults, VideoSettingValue } from "../../project-types";
import {
	getDefaultVideoModelOptions,
	getVideoModelControlDefinitions,
	VIDEO_MODELS,
} from "../../video-models";
import { ModelPickerModal } from "../model-picker-modal";

function updateVideoOption(
	settings: VideoDefaults,
	key: string,
	value: VideoSettingValue,
) {
	return {
		...settings,
		modelOptions: {
			...settings.modelOptions,
			[key]: value,
		},
	};
}

// Reusable context section for transition videos
export function TransitionContextSection({
	fromShot,
	toShot,
}: {
	fromShot: Shot;
	toShot: Shot;
}) {
	const [showDescriptions, setShowDescriptions] = useState(true);

	return (
		<div className="space-y-2">
			<button
				type="button"
				onClick={() => setShowDescriptions(!showDescriptions)}
				className="flex items-center gap-2 w-full text-left"
			>
				{showDescriptions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
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
	);
}

/** Minimal image info for reference image picker */
export interface ReferenceImageOption {
	id: string;
	url: string;
	isSelected: boolean;
}

function ContextToggleCard({
	label,
	description,
	checked,
	onChange,
}: {
	label: string;
	description: string;
	checked: boolean;
	onChange: (value: boolean) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onChange(!checked)}
			className={`flex items-start gap-2 p-2 rounded-lg border text-left transition-all w-full ${
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

function ReferenceImageSlider({
	images,
	selectedIds,
	onSelect,
}: {
	images: ReferenceImageOption[];
	selectedIds: string[];
	onSelect: (ids: string[]) => void;
}) {
	const scrollRef = useRef<HTMLDivElement>(null);

	const scroll = (direction: "left" | "right") => {
		if (!scrollRef.current) return;
		const scrollAmount = 120;
		scrollRef.current.scrollBy({
			left: direction === "left" ? -scrollAmount : scrollAmount,
			behavior: "smooth",
		});
	};

	return (
		<div className="space-y-2">
			<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
				Reference images (optional)
			</p>
			<p className="text-[10px] text-muted-foreground">
				Select one or more images to guide video generation
			</p>

			<div className="relative">
				{/* Left arrow */}
				{images.length > 2 && (
					<button
						type="button"
						onClick={() => scroll("left")}
						className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 flex items-center justify-center bg-background/90 border border-border rounded-full shadow-sm hover:bg-muted transition-colors"
					>
						<ChevronLeft size={16} />
					</button>
				)}

				{/* Scrollable container */}
				<div
					ref={scrollRef}
					className="flex gap-2 overflow-x-auto scrollbar-hide px-1 py-1 scroll-smooth"
					style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
				>
					{images.map((img) => {
						const isActive = selectedIds.includes(img.id);
						return (
							<button
								key={img.id}
								type="button"
								onClick={() =>
									onSelect(
										isActive
											? selectedIds.filter((id) => id !== img.id)
											: [...selectedIds, img.id],
									)
								}
								className={`relative flex-shrink-0 w-24 aspect-video rounded-lg overflow-hidden border-2 transition-all ${
									isActive
										? "border-primary ring-2 ring-primary/30"
										: "border-border/50 hover:border-border"
								}`}
							>
								<img
									src={img.url}
									alt="Reference option"
									className="w-full h-full object-cover"
								/>
								{isActive && (
									<div className="absolute inset-0 bg-primary/15 flex items-center justify-center">
										<div className="bg-primary rounded-full p-1">
											<Check size={12} className="text-primary-foreground" />
										</div>
									</div>
								)}
							</button>
						);
					})}
				</div>

				{/* Right arrow */}
				{images.length > 2 && (
					<button
						type="button"
						onClick={() => scroll("right")}
						className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 flex items-center justify-center bg-background/90 border border-border rounded-full shadow-sm hover:bg-muted transition-colors"
					>
						<ChevronRight size={16} />
					</button>
				)}
			</div>
		</div>
	);
}

export function VideoControlsPanel({
	contextSection,
	videoPrompt,
	onVideoPromptChange,
	onGeneratePrompt,
	isGeneratingPrompt,
	onEnhancePrompt,
	isEnhancingPrompt,
	videoSettings,
	onVideoSettingsChange,
	useProjectContext,
	onUseProjectContextChange,
	usePrevShotContext,
	onUsePrevShotContextChange,
	isGenerating,
	isQueueing = isGenerating,
	onGenerate,
	generateButtonLabel = "Generate video",
	generatingButtonLabel = "Generating video...",
	// Optional reference image selection (for shot videos)
	availableImages,
	referenceImageIds,
	onReferenceImageIdsChange,
	prevShotReferenceImage,
	usePrevShotReferenceImage,
	onUsePrevShotReferenceImageChange,
}: {
	contextSection: ReactNode | null;
	videoPrompt: string;
	onVideoPromptChange: (v: string) => void;
	onGeneratePrompt: () => void;
	isGeneratingPrompt: boolean;
	onEnhancePrompt?: () => void;
	isEnhancingPrompt?: boolean;
	videoSettings: VideoDefaults;
	onVideoSettingsChange: (settings: VideoDefaults) => void;
	useProjectContext: boolean;
	onUseProjectContextChange: (v: boolean) => void;
	usePrevShotContext: boolean;
	onUsePrevShotContextChange: (v: boolean) => void;
	isGenerating: boolean;
	isQueueing?: boolean;
	onGenerate: () => void;
	generateButtonLabel?: string;
	generatingButtonLabel?: string;
	// Optional: available images for reference selection
	availableImages?: ReferenceImageOption[];
	referenceImageIds?: string[];
	onReferenceImageIdsChange?: (ids: string[]) => void;
	prevShotReferenceImage?: ReferenceImageOption | null;
	usePrevShotReferenceImage?: boolean;
	onUsePrevShotReferenceImageChange?: (value: boolean) => void;
}) {
	const isBusy = isGeneratingPrompt || isEnhancingPrompt;
	const motionPromptId = useId();
	const negativePromptId = useId();
	const controls = getVideoModelControlDefinitions(videoSettings.model);

	return (
		<div className="flex flex-col h-full">
			<div className="flex-1 overflow-y-auto p-4 space-y-4">
				{contextSection}

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

				{prevShotReferenceImage && onUsePrevShotReferenceImageChange && (
					<div className="space-y-2">
						<ContextToggleCard
							label="Previous shot selected image"
							description="Include the previous shot's selected image as a reference"
							checked={usePrevShotReferenceImage ?? false}
							onChange={onUsePrevShotReferenceImageChange}
						/>
						{usePrevShotReferenceImage && (
							<img
								src={prevShotReferenceImage.url}
								alt="Previous shot selected reference"
								className="w-full rounded-lg border border-border object-cover aspect-video opacity-80"
							/>
						)}
					</div>
				)}

				{/* Reference image slider (for shot videos) */}
				{availableImages &&
					availableImages.length > 0 &&
					onReferenceImageIdsChange && (
						<ReferenceImageSlider
							images={availableImages}
							selectedIds={referenceImageIds ?? []}
							onSelect={onReferenceImageIdsChange}
						/>
					)}

				<div className="border-t pt-4 space-y-4">
					<div className="flex items-center justify-between">
						<span className="text-xs font-medium text-muted-foreground">
							Model
						</span>
					</div>
					<ModelPickerModal
						title="Choose A Video Model"
						triggerLabel="Video model"
						selectedId={videoSettings.model}
						options={VIDEO_MODELS.map((model) => ({
							id: model.id,
							label: model.label,
							provider: model.provider,
							description: model.description,
							logoText: model.logoText,
							logoImageUrl: model.logoImageUrl,
							previewImageUrl: model.previewImageUrl,
							accentClassName: model.accentClassName,
						}))}
						gridClassName="grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
						onSelect={(modelId) =>
							onVideoSettingsChange({
								model: modelId,
								modelOptions: getDefaultVideoModelOptions(modelId),
							})
						}
					/>

					<div className="grid grid-cols-2 gap-3">
						{controls.map((control) => {
							const value = videoSettings.modelOptions[control.key];

							if (control.type === "boolean") {
								return (
									<label
										key={control.key}
										className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground"
									>
										<input
											type="checkbox"
											checked={Boolean(value)}
											onChange={(e) =>
												onVideoSettingsChange(
													updateVideoOption(
														videoSettings,
														control.key,
														e.target.checked,
													),
												)
											}
											className="h-3.5 w-3.5 rounded accent-primary"
										/>
										<span>{control.label}</span>
									</label>
								);
							}

							if (control.type === "textarea") {
								return (
									<div key={control.key} className="col-span-2 space-y-1.5">
										<label
											htmlFor={negativePromptId}
											className="text-xs font-medium text-muted-foreground"
										>
											{control.label}
										</label>
										<textarea
											id={negativePromptId}
											rows={3}
											value={typeof value === "string" ? value : ""}
											onChange={(e) =>
												onVideoSettingsChange(
													updateVideoOption(
														videoSettings,
														control.key,
														e.target.value,
													),
												)
											}
											placeholder={control.description ?? ""}
											className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring leading-relaxed"
										/>
									</div>
								);
							}

							return (
								<label key={control.key} className="space-y-1.5">
									<span className="text-xs font-medium text-muted-foreground">
										{control.label}
									</span>
									<select
										value={String(value ?? "")}
										onChange={(e) =>
											onVideoSettingsChange(
												updateVideoOption(
													videoSettings,
													control.key,
													control.key === "duration"
														? Number(e.target.value)
														: e.target.value,
												),
											)
										}
										className="w-full px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-background"
									>
										{control.options?.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</label>
							);
						})}
					</div>

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
				</div>
			</div>

			<div className="p-4 border-t bg-card">
				<Button
					onClick={onGenerate}
					disabled={isQueueing || !videoPrompt.trim()}
					className="w-full gap-2"
					size="lg"
				>
					{isQueueing ? (
						<Loader2 size={16} className="animate-spin" />
					) : (
						<Film size={16} />
					)}
					{isQueueing ? generatingButtonLabel : generateButtonLabel}
				</Button>
			</div>
		</div>
	);
}
