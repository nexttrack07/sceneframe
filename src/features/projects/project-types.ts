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
	model: string;
	aspectRatio: "1:1" | "16:9" | "9:16" | "4:5";
	qualityPreset: "fast" | "balanced" | "high";
	batchCount: number;
}

export interface ProjectSettings {
	intake?: IntakeAnswers;
}

export interface TransitionVideoSummary {
	id: string;
	sceneId: string;
	fromShotId: string;
	toShotId: string;
	fromImageId: string | null;
	toImageId: string | null;
	status: "generating" | "done" | "error";
	url: string | null;
	errorMessage: string | null;
	prompt: string | null;
	model: string;
	isSelected: boolean;
	stale: boolean;
	generationId: string | null;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	modelSettings: Record<string, any> | null;
	createdAt: string;
}

export interface SceneAssetSummary {
	id: string;
	sceneId: string;
	shotId: string | null;
	type: "start_image" | "end_image" | "image";
	status: "generating" | "done" | "error";
	url: string | null;
	errorMessage: string | null;
	prompt: string | null;
	model: string | null;
	isSelected: boolean;
	batchId: string | null;
	createdAt: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	modelSettings: Record<string, any> | null;
}
