import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db/index";
import {
	assets,
	messages,
	motionGraphics,
	shots,
	transitionVideos,
} from "@/db/schema";
import { assertProjectOwner } from "@/lib/assert-project-owner.server";
import { normalizeProjectSettings } from "./project-normalize";

export const loadProject = createServerFn({ method: "GET" })
	.inputValidator((projectId: string) => projectId)
	.handler(async ({ data: projectId }) => {
		const { project } = await assertProjectOwner(projectId);

		const [projectShots, projectMessages] = await Promise.all([
			db.query.shots.findMany({
				where: and(eq(shots.projectId, projectId), isNull(shots.deletedAt)),
				orderBy: asc(shots.order),
			}),
			db.query.messages.findMany({
				where: eq(messages.projectId, projectId),
				orderBy: asc(messages.createdAt),
				limit: 200,
			}),
		]);

		const shotIds = projectShots.map((shot) => shot.id);

		// Load image assets directly by projectId (stage="images")
		const projectAssets = await db.query.assets.findMany({
			where: and(
				eq(assets.projectId, projectId),
				eq(assets.stage, "images"),
				isNull(assets.deletedAt),
			),
			orderBy: asc(assets.createdAt),
		});

		// Load transition videos directly by projectId
		const projectTransitionVideos = await db.query.transitionVideos.findMany({
			where: and(
				eq(transitionVideos.projectId, projectId),
				isNull(transitionVideos.deletedAt),
			),
			orderBy: asc(transitionVideos.createdAt),
		});

		// Load audio assets (stage="audio") — voiceovers + background music
		const audioAssets = await db.query.assets.findMany({
			where: and(
				eq(assets.projectId, projectId),
				eq(assets.stage, "audio"),
				isNull(assets.deletedAt),
			),
			orderBy: asc(assets.createdAt),
		});

		const voiceoverAssets = audioAssets.filter((a) => a.type === "voiceover");
		const backgroundMusicAssets = audioAssets.filter(
			(a) => a.type === "background_music",
		);

		// Load shot video assets (type="video", stage="video")
		const shotVideoAssets =
			shotIds.length === 0
				? []
				: await db.query.assets.findMany({
						where: and(
							eq(assets.type, "video"),
							eq(assets.stage, "video"),
							inArray(assets.shotId, shotIds),
							isNull(assets.deletedAt),
						),
						orderBy: asc(assets.createdAt),
					});

		// Load motion graphics directly by projectId
		const projectMotionGraphics = await db.query.motionGraphics.findMany({
			where: and(
				eq(motionGraphics.projectId, projectId),
				isNull(motionGraphics.deletedAt),
			),
			orderBy: asc(motionGraphics.createdAt),
		});

		return {
			project: {
				...project,
				settings: normalizeProjectSettings(project.settings),
			},
			shots: projectShots,
			messages: projectMessages,
			assets: projectAssets
				.filter(
					(
						asset,
					): asset is typeof asset & {
						type: "start_image" | "end_image" | "image";
					} =>
						asset.type === "start_image" ||
						asset.type === "end_image" ||
						asset.type === "image",
				)
				.filter(
					(
						asset,
					): asset is typeof asset & {
						status: "generating" | "done" | "error";
					} =>
						asset.status === "generating" ||
						asset.status === "done" ||
						asset.status === "error",
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
					// biome-ignore lint/suspicious/noExplicitAny: modelSettings is a flexible JSON column; typed as Record<string, unknown> at DB layer but any is needed here for the cast
					modelSettings: (asset.modelSettings as Record<string, any>) ?? null,
				})),
			voiceovers: voiceoverAssets
				.filter(
					(a): a is typeof a & { status: "generating" | "done" | "error" } =>
						a.status === "generating" ||
						a.status === "done" ||
						a.status === "error",
				)
				.map((a) => ({
					id: a.id,
					projectId: a.projectId,
					type: "voiceover" as const,
					status: a.status,
					jobId: a.jobId,
					url: a.url,
					errorMessage: a.errorMessage,
					prompt: a.prompt,
					model: a.model,
					durationMs: a.durationMs,
					isSelected: a.isSelected,
					createdAt: a.createdAt.toISOString(),
				})),
			backgroundMusic: backgroundMusicAssets
				.filter(
					(a): a is typeof a & { status: "generating" | "done" | "error" } =>
						a.status === "generating" ||
						a.status === "done" ||
						a.status === "error",
				)
				.map((a) => ({
					id: a.id,
					projectId: a.projectId,
					type: "background_music" as const,
					status: a.status,
					jobId: a.jobId,
					url: a.url,
					errorMessage: a.errorMessage,
					prompt: a.prompt,
					model: a.model,
					durationMs: a.durationMs,
					isSelected: a.isSelected,
					createdAt: a.createdAt.toISOString(),
				})),
			transitionVideos: projectTransitionVideos.map((tv) => ({
				id: tv.id,
				projectId: tv.projectId,
				fromShotId: tv.fromShotId,
				toShotId: tv.toShotId,
				fromImageId: tv.fromImageId,
				toImageId: tv.toImageId,
				status: tv.status,
				url: tv.url,
				errorMessage: tv.errorMessage,
				prompt: tv.prompt,
				model: tv.model,
				isSelected: tv.isSelected,
				stale: tv.stale,
				generationId: tv.generationId,
				jobId: tv.jobId,
				// biome-ignore lint/suspicious/noExplicitAny: modelSettings is a flexible JSON column
				modelSettings: (tv.modelSettings as Record<string, any>) ?? null,
				createdAt: tv.createdAt.toISOString(),
			})),
			shotVideoAssets: shotVideoAssets
				.filter(
					(
						a,
					): a is typeof a & {
						shotId: string;
						status: "queued" | "generating" | "finalizing" | "done" | "error";
					} =>
						a.shotId !== null &&
						(a.status === "queued" ||
							a.status === "generating" ||
							a.status === "finalizing" ||
							a.status === "done" ||
							a.status === "error"),
				)
				.map((a) => ({
					id: a.id,
					projectId: a.projectId,
					shotId: a.shotId,
					status: a.status,
					url: a.url,
					errorMessage: a.errorMessage,
					prompt: a.prompt,
					model: a.model ?? "",
					isSelected: a.isSelected,
					generationId: a.generationId,
					jobId: a.jobId,
					// biome-ignore lint/suspicious/noExplicitAny: modelSettings is a flexible JSON column
					modelSettings: (a.modelSettings as Record<string, any>) ?? null,
					createdAt: a.createdAt.toISOString(),
					thumbnailUrl: null,
					durationMs: a.durationMs,
					generationDurationMs: a.generationDurationMs,
				})),
			motionGraphics: projectMotionGraphics.map((graphic) => ({
				id: graphic.id,
				projectId: graphic.projectId,
				shotId: graphic.shotId,
				preset: graphic.preset,
				title: graphic.title,
				sourceText: graphic.sourceText,
				spec: graphic.spec,
				createdAt: graphic.createdAt.toISOString(),
			})),
		};
	});

export const exportProjectHandoff = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { projectId: string; format: "json" | "markdown" }) => data,
	)
	.handler(async ({ data: { projectId, format } }) => {
		const { project } = await assertProjectOwner(projectId, "error");

		const [projectShots, settings] = await Promise.all([
			db.query.shots.findMany({
				where: and(eq(shots.projectId, projectId), isNull(shots.deletedAt)),
				orderBy: asc(shots.order),
			}),
			Promise.resolve(normalizeProjectSettings(project.settings)),
		]);

		if (format === "json") {
			return {
				content: JSON.stringify(
					{
						project: { id: project.id, name: project.name },
						intake: settings?.intake ?? null,
						shots: projectShots.map((shot, i) => ({
							id: shot.id,
							order: i + 1,
							description: shot.description,
							shotType: shot.shotType,
							shotSize: shot.shotSize,
							durationSec: shot.durationSec,
							timestampStart: shot.timestampStart,
							timestampEnd: shot.timestampEnd,
						})),
					},
					null,
					2,
				),
				filename: `${project.name.replace(/\s+/g, "-").toLowerCase()}-handoff.json`,
				mimeType: "application/json",
			};
		}

		const markdown = [
			`# ${project.name} - Production Handoff`,
			"",
			"## Creative Brief",
			settings?.intake
				? `- Channel preset: ${settings.intake.channelPreset}`
				: "- Brief not found",
			settings?.intake ? `- Audience: ${settings.intake.audience}` : "",
			settings?.intake
				? `- Viewer action: ${settings.intake.viewerAction}`
				: "",
			"",
			"## Shot List",
			...projectShots.map((shot, i) =>
				[
					`### Shot ${i + 1}`,
					`- Type: ${shot.shotType} / Size: ${shot.shotSize}`,
					shot.durationSec ? `- Duration: ${shot.durationSec}s` : "",
					"",
					shot.description,
					"",
				]
					.filter(Boolean)
					.join("\n"),
			),
		]
			.filter(Boolean)
			.join("\n");

		return {
			content: markdown,
			filename: `${project.name.replace(/\s+/g, "-").toLowerCase()}-handoff.md`,
			mimeType: "text/markdown",
		};
	});
