export type ImageModelId = string;
export type ImageSettingValue = string | number | boolean;
export type VideoModelId = string;
export type VideoSettingValue = string | number | boolean;

export interface IntakeAnswers {
	channelPreset: string;
	purpose?: string;
	length: string;
	style?: string[];
	mood?: string[];
	setting?: string[];
	audience?: string;
	viewerAction?: string;
	workingTitle?: string;
	thumbnailPromise?: string;
	concept: string;
	targetDurationSec?: number;
}

export interface ScenePlanEntry {
	title: string;
	description: string;
	durationSec?: number;
	beat?: string;
	hookRole?: "hook" | "body" | "cta";
}

export type ShotType = "talking" | "visual";

export interface ShotPlanEntry {
	description: string;
	shotType: ShotType;
	durationSec: number;
	sceneIndex: number;
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
}

export interface ProjectSettings {
	intake?: IntakeAnswers;
	characters?: Character[];
}

// Base video type shared by both transition and shot videos
export interface BaseVideoSummary {
	id: string;
	sceneId: string;
	status: "generating" | "done" | "error";
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
	sceneId: string;
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
	sceneId: string;
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
	sceneId: string;
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
