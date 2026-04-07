import type Replicate from "replicate";
import type { PromptAssetType } from "./project-types";

export async function buildSceneVisualBrief(args: {
	replicate: Replicate;
	medium: "image" | "video" | "transition";
	projectName: string;
	sceneTitle?: string | null;
	sceneDescription: string;
	projectContext?: string | null;
	shotContext?: string | null;
}) {
	void args.replicate;

	return [
		`- Visual spine: ${args.sceneDescription.trim()}`,
		`- Light behavior: derive lighting directly from the scene description and preserve the scene's stated mood and atmosphere.`,
		`- Framing language: honor ${args.medium === "transition" ? "the start/end shot framing and make the bridge explicit" : "the shot descriptions and any current-scene composition cues"} without inventing unrelated camera language.`,
		`- Texture motif: preserve concrete tactile details, materials, weather, and environmental surface cues already present in the scene and shot context.`,
		args.projectContext
			? `- Project context: ${args.projectContext.trim()}`
			: null,
		args.shotContext ? `- Shot context: ${args.shotContext.trim()}` : null,
	]
		.filter(Boolean)
		.join("\n");
}

export async function critiqueAndRewritePrompt(args: {
	replicate: Replicate;
	medium: "image" | "video" | "transition";
	assetType: PromptAssetType;
	prompt: string;
	context?: string | null;
}) {
	void args.replicate;
	void args.medium;
	void args.assetType;
	void args.context;

	return args.prompt.trim() || args.prompt;
}
