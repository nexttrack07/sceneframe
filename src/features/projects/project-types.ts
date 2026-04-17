export type ImageModelId = string;
export type ImageSettingValue = string | number | boolean;
export type VideoModelId = string;
export type VideoSettingValue = string | number | boolean;
export type MotionGraphicPreset = "lower_third" | "callout";
export type PromptAssetType =
	| "cinematic"
	| "documentary"
	| "infographic"
	| "text_graphic"
	| "talking_head"
	| "transition";
export type PromptAssetTypeSelection = "auto" | PromptAssetType;
export type VideoLifecycleStatus =
	| "queued"
	| "generating"
	| "finalizing"
	| "done"
	| "error";

export interface IntakeAnswers {
	channelPreset?: string;
	purpose?: string;
	length?: string;
	style?: string[];
	mood?: string[];
	setting?: string[];
	audioMode?: string;
	audience?: string;
	viewerAction?: string;
	workingTitle?: string;
	thumbnailPromise?: string;
	concept?: string;
	targetDurationSec?: number;
}

export interface ScenePlanEntry {
	sceneNumber?: number;
	title: string;
	description: string;
	durationSec?: number;
	beat?: string;
	hookRole?: "hook" | "body" | "cta";
}

export interface OpeningHookDraft {
	headline: string;
	narration: string;
	visualDirection: string;
}

export type WorkshopStage =
	| "outline"
	| "shots"
	| "prompts"
	| "audio";

export interface OutlineEntry {
	title: string;
	summary: string;
}

export interface ShotDraftEntry {
	description: string;
	shotType: "talking" | "visual";
	shotSize: "extreme-wide" | "wide" | "medium" | "close-up" | "extreme-close-up" | "insert";
	durationSec: number;
}

/**
 * Image prompt entry in WorkshopState.
 * V2 uses shotId for stable linking; shotIndex is kept for legacy read compatibility.
 */
export interface ImagePromptEntry {
	/** Stable shot ID (v2). Required for new entries. */
	shotId?: string;
	/** Position-based index (v1, deprecated). Used only for legacy data migration. */
	shotIndex?: number;
	/** The image generation prompt text. */
	prompt: string;
	/** Hash of shot.description when this prompt was generated. Used for staleness detection. */
	sourceHash?: string;
}

export interface WorkshopState {
	stage: WorkshopStage;
	outline?: OutlineEntry[];
	shots?: ShotDraftEntry[];
	imagePrompts?: ImagePromptEntry[];
	staleStages?: Array<"outline" | "shots" | "prompts" | "audio">;
}

/** @deprecated Use WorkshopState instead */
export type ScriptDraft = WorkshopState;

export interface ScriptEditSelection {
	project: boolean;
	shotIds: string[];
}

export interface ScriptEditDraft {
	scope: ScriptEditSelection;
	instructions: string;
	summary: string;
	shotUpdates: Array<{
		shotId: string;
		description: string;
	}>;
}

export type ShotType = "talking" | "visual";
export type ShotSize =
	| "extreme-wide"
	| "wide"
	| "medium"
	| "close-up"
	| "extreme-close-up"
	| "insert";

export interface ShotPlanEntry {
	description: string;
	imagePrompt?: string;
	shotType: ShotType;
	shotSize: ShotSize;
	durationSec: number;
}

export interface ImageDefaults {
	model: ImageModelId;
	batchCount: number;
	modelOptions: Record<string, ImageSettingValue>;
}

export interface VideoDefaults {
	model: VideoModelId;
	modelOptions: Record<string, VideoSettingValue>;
}

export interface Character {
	id: string;
	name: string;
	description: string;
	visualPromptFragment: string;
	referenceImageIds?: string[];
	primaryImageId?: string | null;
	defaultEnabled?: boolean;
}

export interface ProjectReferenceImageInfo {
	id: string;
	url: string;
	label?: string | null;
	storageKey?: string | null;
}

export interface CharacterWithImages extends Character {
	images?: ProjectReferenceImageInfo[];
}

export interface Location {
	id: string;
	name: string;
	description: string;
	visualPromptFragment: string;
	images?: ProjectReferenceImageInfo[];
	primaryImageId?: string | null;
	defaultEnabled?: boolean;
}

export interface LocationWithImages extends Location {
	images?: ProjectReferenceImageInfo[];
}

export interface ShotPromptContextSettings {
	useProjectCharacters?: boolean;
	excludedCharacterIds?: string[];
	useProjectLocations?: boolean;
	excludedLocationIds?: string[];
}

export interface ProjectSettings {
	intake?: IntakeAnswers;
	characters?: Character[];
	locations?: Location[];
	shotPromptContext?: Record<string, ShotPromptContextSettings>;
	workshop?: {
		openingHook?: OpeningHookDraft | null;
	};
}

export interface MotionGraphicTextItemSpec {
	id: string;
	text: string;
	role: "headline" | "subheadline" | "label";
	left: number;
	top: number;
	width: number;
	height: number;
	fontSize: number;
	color: string;
	align: "left" | "center" | "right";
	fromOffsetFrames: number;
	durationInFrames: number;
	enterAnimation: "fade" | "slide-up" | "slide-left" | "pop";
	enterAnimationDurationInSeconds: number;
	exitAnimation: "fade" | "slide-up" | "slide-left" | "pop";
	exitAnimationDurationInSeconds: number;
}

export interface MotionGraphicSpec {
	items: MotionGraphicTextItemSpec[];
}

export interface MotionGraphicSummary {
	id: string;
	projectId: string;
	shotId: string;
	preset: MotionGraphicPreset;
	title: string;
	sourceText: string;
	spec: MotionGraphicSpec;
	createdAt: string;
}

// Base video type shared by both transition and shot videos
export interface BaseVideoSummary {
	id: string;
	projectId: string;
	status: VideoLifecycleStatus;
	url: string | null;
	errorMessage: string | null;
	prompt: string | null;
	model: string;
	isSelected: boolean;
	generationId: string | null;
	jobId: string | null;
	// biome-ignore lint/suspicious/noExplicitAny: flexible JSON column; shape varies by model
	modelSettings: Record<string, any> | null;
	createdAt: string;
}

// Transition-specific video (extends base)
export interface TransitionVideoSummary extends BaseVideoSummary {
	fromShotId: string;
	toShotId: string;
	fromImageId: string | null;
	toImageId: string | null;
	stale: boolean;
}

// Shot-specific video (extends base)
export interface ShotVideoSummary extends BaseVideoSummary {
	shotId: string;
	thumbnailUrl: string | null;
	durationMs: number | null;
	generationDurationMs: number | null;
}

export interface VoiceoverAssetSummary {
	id: string;
	projectId: string;
	type: "voiceover";
	status: "generating" | "done" | "error";
	jobId: string | null;
	url: string | null;
	errorMessage: string | null;
	prompt: string | null;
	model: string | null;
	durationMs: number | null;
	isSelected: boolean;
	createdAt: string;
}

export interface BackgroundMusicAssetSummary {
	id: string;
	projectId: string;
	type: "background_music";
	status: "generating" | "done" | "error";
	jobId: string | null;
	url: string | null;
	errorMessage: string | null;
	prompt: string | null;
	model: string | null;
	durationMs: number | null;
	isSelected: boolean;
	createdAt: string;
}

export interface SceneAssetSummary {
	id: string;
	projectId: string;
	shotId: string | null;
	type: "start_image" | "end_image" | "image";
	status: "generating" | "done" | "error";
	jobId: string | null;
	url: string | null;
	errorMessage: string | null;
	prompt: string | null;
	model: string | null;
	isSelected: boolean;
	batchId: string | null;
	createdAt: string;
	generationDurationMs: number | null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	// biome-ignore lint/suspicious/noExplicitAny: flexible JSON column; shape varies by model
	modelSettings: Record<string, any> | null;
}

export type TriggerRunUiStatus =
	| "queued"
	| "running"
	| "retrying"
	| "completed"
	| "failed"
	| "canceled"
	| "unknown";

export interface TriggerRunSummary {
	assetId: string;
	jobId: string;
	status: TriggerRunUiStatus;
	attemptCount: number;
	createdAt: string | null;
	startedAt: string | null;
	finishedAt: string | null;
	errorMessage: string | null;
}
