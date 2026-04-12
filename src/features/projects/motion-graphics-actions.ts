import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/index";
import {
	assets,
	motionGraphics,
	projects,
	shots,
	transitionVideos,
} from "@/db/schema";
import { buildEditorState } from "@/features/editor/bridge/build-editor-state";
import { DEFAULT_FPS } from "@/features/editor/vendor/constants";
import type { EditorStarterItem } from "@/features/editor/vendor/items/item-type";
import type { UndoableState } from "@/features/editor/vendor/state/types";
import { assertProjectOwner } from "@/lib/assert-project-owner.server";
import {
	buildMotionGraphicSpec,
	getMotionGraphicTitle,
} from "./motion-graphics";
import type {
	MotionGraphicPreset,
	MotionGraphicTextItemSpec,
	SceneAssetSummary,
	TransitionVideoSummary,
	VoiceoverAssetSummary,
} from "./project-types";

function createTextEditorItem({
	specItem,
	from,
}: {
	specItem: MotionGraphicTextItemSpec;
	from: number;
}): EditorStarterItem {
	return {
		id: crypto.randomUUID(),
		type: "text",
		text: specItem.text,
		color: specItem.color,
		top: specItem.top,
		left: specItem.left,
		width: specItem.width,
		height: specItem.height,
		align: specItem.align,
		opacity: 1,
		rotation: 0,
		fontFamily: "Roboto",
		fontSize: specItem.fontSize,
		lineHeight: 1.1,
		letterSpacing: 0,
		resizeOnEdit: true,
		direction: "ltr",
		fontStyle: {
			variant: "normal",
			weight: specItem.role === "headline" ? "700" : "400",
		},
		isDraggingInTimeline: false,
		strokeWidth: 0,
		strokeColor: "#000000",
		enterAnimation: specItem.enterAnimation,
		enterAnimationDurationInSeconds: specItem.enterAnimationDurationInSeconds,
		exitAnimation: specItem.exitAnimation,
		exitAnimationDurationInSeconds: specItem.exitAnimationDurationInSeconds,
		fadeInDurationInSeconds: 0,
		fadeOutDurationInSeconds: 0,
		background: null,
		from,
		durationInFrames: specItem.durationInFrames,
	};
}

async function buildInitialEditorState(
	projectId: string,
): Promise<UndoableState> {
	const projectShots = await db.query.shots.findMany({
		where: and(eq(shots.projectId, projectId), isNull(shots.deletedAt)),
		orderBy: asc(shots.order),
	});

	const shotIds = projectShots.map((shot) => shot.id);

	const [projectAssets, projectTransitionVideos, audioAssets] =
		await Promise.all([
			db.query.assets.findMany({
				where: and(
					eq(assets.projectId, projectId),
					eq(assets.stage, "images"),
					isNull(assets.deletedAt),
				),
				orderBy: asc(assets.createdAt),
			}),
			db.query.transitionVideos.findMany({
				where: and(
					eq(transitionVideos.projectId, projectId),
					isNull(transitionVideos.deletedAt),
				),
				orderBy: asc(transitionVideos.createdAt),
			}),
			db.query.assets.findMany({
				where: and(
					eq(assets.projectId, projectId),
					eq(assets.stage, "audio"),
					isNull(assets.deletedAt),
				),
				orderBy: asc(assets.createdAt),
			}),
		]);

	// Suppress unused variable warning — shotIds is available for future FK filtering
	void shotIds;

	const normalizedAssets: SceneAssetSummary[] = projectAssets
		.filter(
			(
				asset,
			): asset is typeof asset & {
				type: "start_image" | "end_image" | "image";
				status: "generating" | "done" | "error";
			} =>
				(asset.type === "start_image" ||
					asset.type === "end_image" ||
					asset.type === "image") &&
				(asset.status === "generating" ||
					asset.status === "done" ||
					asset.status === "error"),
		)
		.map((asset) => ({
			id: asset.id,
			projectId: asset.projectId,
			shotId: asset.shotId,
			type: asset.type,
			status: asset.status,
			jobId: asset.jobId,
			url: asset.url,
			errorMessage: asset.errorMessage,
			prompt: asset.prompt,
			model: asset.model,
			isSelected: asset.isSelected,
			batchId: asset.batchId,
			createdAt: asset.createdAt.toISOString(),
			generationDurationMs: asset.generationDurationMs,
			modelSettings: (asset.modelSettings as Record<string, unknown>) ?? null,
		}));

	const normalizedTransitions: TransitionVideoSummary[] =
		projectTransitionVideos.map((video) => ({
			id: video.id,
			projectId: video.projectId,
			fromShotId: video.fromShotId,
			toShotId: video.toShotId,
			fromImageId: video.fromImageId,
			toImageId: video.toImageId,
			status: video.status,
			url: video.url,
			errorMessage: video.errorMessage,
			prompt: video.prompt,
			model: video.model,
			isSelected: video.isSelected,
			stale: video.stale,
			generationId: video.generationId,
			jobId: video.jobId,
			modelSettings: (video.modelSettings as Record<string, unknown>) ?? null,
			createdAt: video.createdAt.toISOString(),
		}));

	const normalizedVoiceovers: VoiceoverAssetSummary[] = audioAssets
		.filter(
			(
				asset,
			): asset is typeof asset & {
				type: "voiceover";
				status: "generating" | "done" | "error";
			} =>
				asset.type === "voiceover" &&
				(asset.status === "generating" ||
					asset.status === "done" ||
					asset.status === "error"),
		)
		.map((asset) => ({
			id: asset.id,
			projectId: asset.projectId,
			type: "voiceover" as const,
			status: asset.status,
			jobId: asset.jobId,
			url: asset.url,
			errorMessage: asset.errorMessage,
			prompt: asset.prompt,
			model: asset.model,
			durationMs: asset.durationMs,
			isSelected: asset.isSelected,
			createdAt: asset.createdAt.toISOString(),
		}));

	return buildEditorState({
		shots: projectShots,
		assets: normalizedAssets,
		shotVideoAssets: [],
		transitionVideos: normalizedTransitions,
		voiceovers: normalizedVoiceovers,
		backgroundMusic: [],
	});
}

function ensureTextTrack(state: UndoableState): {
	state: UndoableState;
	trackId: string;
} {
	const existingTrack = state.tracks.find(
		(track) => track.id === "track-text-overlays",
	);
	if (existingTrack) {
		return { state, trackId: existingTrack.id };
	}

	return {
		state: {
			...state,
			tracks: [
				...state.tracks,
				{
					id: "track-text-overlays",
					items: [],
					hidden: false,
					muted: false,
				},
			],
		},
		trackId: "track-text-overlays",
	};
}

async function getMotionGraphicForProject({
	projectId,
	motionGraphicId,
}: {
	projectId: string;
	motionGraphicId: string;
}) {
	const graphic = await db.query.motionGraphics.findFirst({
		where: and(
			eq(motionGraphics.id, motionGraphicId),
			eq(motionGraphics.projectId, projectId),
			isNull(motionGraphics.deletedAt),
		),
	});
	if (!graphic) throw new Error("Motion graphic not found");

	return graphic;
}

function getShotStartFrame(
	orderedShots: Array<{ id: string; durationSec: number }>,
	shotId: string,
) {
	let start = 0;
	for (const shot of orderedShots) {
		if (shot.id === shotId) return start;
		start += Math.round(shot.durationSec * DEFAULT_FPS);
	}
	return 0;
}

export const createShotMotionGraphic = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			shotId: string;
			preset: MotionGraphicPreset;
		}) => data,
	)
	.handler(async ({ data: { projectId, shotId, preset } }) => {
		await assertProjectOwner(projectId, "error");

		const shot = await db.query.shots.findFirst({
			where: and(
				eq(shots.id, shotId),
				eq(shots.projectId, projectId),
				isNull(shots.deletedAt),
			),
		});
		if (!shot) throw new Error("Shot not found");

		const sourceText = shot.description.trim();
		const spec = buildMotionGraphicSpec({
			preset,
			sourceText,
			shotDurationSec: shot.durationSec,
		});
		const title = getMotionGraphicTitle({ preset, sourceText });

		const [created] = await db
			.insert(motionGraphics)
			.values({
				projectId,
				shotId,
				preset,
				title,
				sourceText,
				spec,
			})
			.returning();

		return {
			id: created.id,
		};
	});

export const deleteShotMotionGraphic = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { projectId: string; motionGraphicId: string }) => data,
	)
	.handler(async ({ data: { projectId, motionGraphicId } }) => {
		await assertProjectOwner(projectId, "error");
		await getMotionGraphicForProject({ projectId, motionGraphicId });

		await db
			.update(motionGraphics)
			.set({ deletedAt: new Date() })
			.where(eq(motionGraphics.id, motionGraphicId));
	});

export const importShotMotionGraphicToEditor = createServerFn({
	method: "POST",
})
	.inputValidator(
		(data: { projectId: string; motionGraphicId: string }) => data,
	)
	.handler(async ({ data: { projectId, motionGraphicId } }) => {
		const { project } = await assertProjectOwner(projectId, "error");
		const graphic = await getMotionGraphicForProject({
			projectId,
			motionGraphicId,
		});

		const orderedShots = await db
			.select({
				id: shots.id,
				durationSec: shots.durationSec,
			})
			.from(shots)
			.where(
				and(
					eq(shots.projectId, projectId),
					isNull(shots.deletedAt),
				),
			)
			.orderBy(asc(shots.order));

		const baseState = project.editorState
			? (project.editorState as UndoableState)
			: await buildInitialEditorState(projectId);

		const { state: stateWithTrack, trackId } = ensureTextTrack(baseState);
		const shotStartFrame = getShotStartFrame(orderedShots, graphic.shotId);

		const newItems = graphic.spec.items.map((specItem) =>
			createTextEditorItem({
				specItem,
				from: shotStartFrame + specItem.fromOffsetFrames,
			}),
		);

		const nextState: UndoableState = {
			...stateWithTrack,
			items: {
				...stateWithTrack.items,
				...Object.fromEntries(newItems.map((item) => [item.id, item])),
			},
			tracks: stateWithTrack.tracks.map((track) =>
				track.id === trackId
					? {
							...track,
							items: [...track.items, ...newItems.map((item) => item.id)],
						}
					: track,
			),
		};

		await db
			.update(projects)
			.set({
				editorState: nextState as unknown as Record<string, unknown>,
			})
			.where(eq(projects.id, projectId));

		return {
			importedCount: newItems.length,
		};
	});
