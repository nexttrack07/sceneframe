/**
 * Audio Segment Server Actions
 *
 * Server functions for multi-track voiceover segment management.
 */

import { auth } from "@clerk/tanstack-react-start/server";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db/index";
import { assets, audioSegments, projects, shots } from "@/db/schema";
import type { AudioSegment, Shot } from "@/db/schema";
import { generateNarrationFromShots } from "./audio-actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SegmentWithShots extends AudioSegment {
	startShot: Shot;
	endShot: Shot;
	voiceoverAsset: {
		id: string;
		url: string | null;
		durationMs: number | null;
	} | null;
}

export interface SegmentBoundary {
	startShotId: string;
	endShotId: string;
	totalDurationSec: number;
	shotCount: number;
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function assertAuth() {
	const { userId } = await auth();
	if (!userId) throw new Error("Unauthenticated");
	return { userId };
}

async function assertProjectOwnership(projectId: string, userId: string) {
	const project = await db.query.projects.findFirst({
		where: and(
			eq(projects.id, projectId),
			eq(projects.userId, userId),
			isNull(projects.deletedAt),
		),
	});
	if (!project) throw new Error("Project not found");
	return project;
}

// ---------------------------------------------------------------------------
// Auto-segmentation algorithm
// ---------------------------------------------------------------------------

interface AutoSegmentOptions {
	targetMinSec?: number;
	targetMaxSec?: number;
	hardMaxSec?: number;
}

export function computeSegmentBoundaries(
	orderedShots: { id: string; durationSec: number }[],
	options: AutoSegmentOptions = {},
): SegmentBoundary[] {
	const { targetMinSec = 60, targetMaxSec = 90, hardMaxSec = 120 } = options;
	const segments: SegmentBoundary[] = [];

	if (orderedShots.length === 0) return segments;

	let currentStartIdx = 0;
	let currentDuration = 0;

	for (let i = 0; i < orderedShots.length; i++) {
		const shotDuration = orderedShots[i].durationSec;
		const wouldBeDuration = currentDuration + shotDuration;

		// If adding this shot exceeds hard max, close current segment
		if (wouldBeDuration > hardMaxSec && currentDuration > 0) {
			segments.push({
				startShotId: orderedShots[currentStartIdx].id,
				endShotId: orderedShots[i - 1].id,
				totalDurationSec: currentDuration,
				shotCount: i - currentStartIdx,
			});
			currentStartIdx = i;
			currentDuration = shotDuration;
			continue;
		}

		// If we're in sweet spot (60-90s) and adding more would exceed, close
		if (currentDuration >= targetMinSec && wouldBeDuration > targetMaxSec) {
			segments.push({
				startShotId: orderedShots[currentStartIdx].id,
				endShotId: orderedShots[i - 1].id,
				totalDurationSec: currentDuration,
				shotCount: i - currentStartIdx,
			});
			currentStartIdx = i;
			currentDuration = shotDuration;
			continue;
		}

		currentDuration = wouldBeDuration;
	}

	// Close final segment
	if (currentStartIdx < orderedShots.length) {
		segments.push({
			startShotId: orderedShots[currentStartIdx].id,
			endShotId: orderedShots[orderedShots.length - 1].id,
			totalDurationSec: currentDuration,
			shotCount: orderedShots.length - currentStartIdx,
		});
	}

	return segments;
}

// ---------------------------------------------------------------------------
// listProjectSegments
// ---------------------------------------------------------------------------

export const listProjectSegments = createServerFn({ method: "GET" })
	.inputValidator((data: { projectId: string }) => data)
	.handler(async ({ data: { projectId } }): Promise<SegmentWithShots[]> => {
		const { userId } = await assertAuth();
		await assertProjectOwnership(projectId, userId);

		const segments = await db.query.audioSegments.findMany({
			where: and(
				eq(audioSegments.projectId, projectId),
				isNull(audioSegments.deletedAt),
			),
			orderBy: [asc(audioSegments.order)],
		});

		// Fetch related data for each segment
		const result: SegmentWithShots[] = [];
		for (const seg of segments) {
			// Fetch start and end shots
			const startShot = await db.query.shots.findFirst({
				where: eq(shots.id, seg.startShotId),
			});
			const endShot = await db.query.shots.findFirst({
				where: eq(shots.id, seg.endShotId),
			});

			if (!startShot || !endShot) continue;

			// Fetch voiceover asset if exists
			let voiceoverAsset = null;
			if (seg.voiceoverAssetId) {
				const asset = await db.query.assets.findFirst({
					where: eq(assets.id, seg.voiceoverAssetId),
				});
				if (asset) {
					voiceoverAsset = {
						id: asset.id,
						url: asset.url,
						durationMs: asset.durationMs,
					};
				}
			}

			result.push({
				...seg,
				startShot,
				endShot,
				voiceoverAsset,
			});
		}

		return result;
	});

// ---------------------------------------------------------------------------
// autoSegmentProject
// ---------------------------------------------------------------------------

export const autoSegmentProject = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { projectId: string; options?: AutoSegmentOptions }) => data,
	)
	.handler(async ({ data: { projectId, options } }) => {
		const { userId } = await assertAuth();
		await assertProjectOwnership(projectId, userId);

		// Get all shots ordered
		const projectShots = await db.query.shots.findMany({
			where: and(eq(shots.projectId, projectId), isNull(shots.deletedAt)),
			orderBy: [asc(shots.order)],
		});

		if (projectShots.length === 0) {
			return { segments: [], created: 0 };
		}

		// Compute boundaries
		const boundaries = computeSegmentBoundaries(
			projectShots.map((s) => ({ id: s.id, durationSec: s.durationSec })),
			options,
		);

		// Create segments
		const createdSegments = [];
		for (let i = 0; i < boundaries.length; i++) {
			const boundary = boundaries[i];
			const [segment] = await db
				.insert(audioSegments)
				.values({
					projectId,
					order: i + 1,
					startShotId: boundary.startShotId,
					endShotId: boundary.endShotId,
					targetDurationSec: boundary.totalDurationSec,
					status: "draft",
				})
				.returning();
			createdSegments.push(segment);
		}

		return { segments: createdSegments, created: createdSegments.length };
	});

// ---------------------------------------------------------------------------
// createAudioSegment
// ---------------------------------------------------------------------------

export const createAudioSegment = createServerFn({ method: "POST" })
	.inputValidator(
		(data: {
			projectId: string;
			startShotId: string;
			endShotId: string;
			order: number;
		}) => data,
	)
	.handler(async ({ data: { projectId, startShotId, endShotId, order } }) => {
		const { userId } = await assertAuth();
		await assertProjectOwnership(projectId, userId);

		// Calculate target duration from shots
		const startShot = await db.query.shots.findFirst({
			where: eq(shots.id, startShotId),
		});
		const endShot = await db.query.shots.findFirst({
			where: eq(shots.id, endShotId),
		});

		if (!startShot || !endShot) {
			throw new Error("Invalid shot range");
		}

		// Get all shots in range
		const shotsInRange = await db.query.shots.findMany({
			where: and(
				eq(shots.projectId, projectId),
				isNull(shots.deletedAt),
				gte(shots.order, startShot.order),
				lte(shots.order, endShot.order),
			),
		});

		const targetDurationSec = shotsInRange.reduce(
			(sum, s) => sum + s.durationSec,
			0,
		);

		const [segment] = await db
			.insert(audioSegments)
			.values({
				projectId,
				order,
				startShotId,
				endShotId,
				targetDurationSec,
				status: "draft",
			})
			.returning();

		return segment;
	});

// ---------------------------------------------------------------------------
// updateSegmentScript
// ---------------------------------------------------------------------------

export const updateSegmentScript = createServerFn({ method: "POST" })
	.inputValidator((data: { segmentId: string; script: string }) => data)
	.handler(async ({ data: { segmentId, script } }) => {
		const { userId } = await assertAuth();

		const segment = await db.query.audioSegments.findFirst({
			where: eq(audioSegments.id, segmentId),
		});
		if (!segment) throw new Error("Segment not found");

		await assertProjectOwnership(segment.projectId, userId);

		const [updated] = await db
			.update(audioSegments)
			.set({ script, updatedAt: new Date() })
			.where(eq(audioSegments.id, segmentId))
			.returning();

		return updated;
	});

// ---------------------------------------------------------------------------
// updateSegmentShotRange
// ---------------------------------------------------------------------------

export const updateSegmentShotRange = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { segmentId: string; startShotId: string; endShotId: string }) =>
			data,
	)
	.handler(async ({ data: { segmentId, startShotId, endShotId } }) => {
		const { userId } = await assertAuth();

		const segment = await db.query.audioSegments.findFirst({
			where: eq(audioSegments.id, segmentId),
		});
		if (!segment) throw new Error("Segment not found");

		await assertProjectOwnership(segment.projectId, userId);

		// Get shots to recalculate duration
		const startShot = await db.query.shots.findFirst({
			where: eq(shots.id, startShotId),
		});
		const endShot = await db.query.shots.findFirst({
			where: eq(shots.id, endShotId),
		});

		if (!startShot || !endShot) {
			throw new Error("Invalid shot range");
		}

		// Validate order
		if (startShot.order > endShot.order) {
			throw new Error("Start shot must come before end shot");
		}

		// Get all shots in range
		const shotsInRange = await db.query.shots.findMany({
			where: and(
				eq(shots.projectId, segment.projectId),
				isNull(shots.deletedAt),
				gte(shots.order, startShot.order),
				lte(shots.order, endShot.order),
			),
		});

		const targetDurationSec = shotsInRange.reduce(
			(sum, s) => sum + s.durationSec,
			0,
		);

		const [updated] = await db
			.update(audioSegments)
			.set({
				startShotId,
				endShotId,
				targetDurationSec,
				// Reset status if shot range changed and we had audio
				status: segment.voiceoverAssetId ? "draft" : segment.status,
				updatedAt: new Date(),
			})
			.where(eq(audioSegments.id, segmentId))
			.returning();

		return updated;
	});

// ---------------------------------------------------------------------------
// deleteAudioSegment
// ---------------------------------------------------------------------------

export const deleteAudioSegment = createServerFn({ method: "POST" })
	.inputValidator((data: { segmentId: string }) => data)
	.handler(async ({ data: { segmentId } }) => {
		const { userId } = await assertAuth();

		const segment = await db.query.audioSegments.findFirst({
			where: eq(audioSegments.id, segmentId),
		});
		if (!segment) throw new Error("Segment not found");

		await assertProjectOwnership(segment.projectId, userId);

		// Soft delete
		await db
			.update(audioSegments)
			.set({ deletedAt: new Date() })
			.where(eq(audioSegments.id, segmentId));

		return { success: true };
	});

// ---------------------------------------------------------------------------
// generateSegmentScript
// ---------------------------------------------------------------------------

export const generateSegmentScript = createServerFn({ method: "POST" })
	.inputValidator((data: { segmentId: string }) => data)
	.handler(async ({ data: { segmentId } }) => {
		const { userId } = await assertAuth();

		const segment = await db.query.audioSegments.findFirst({
			where: eq(audioSegments.id, segmentId),
		});
		if (!segment) throw new Error("Segment not found");

		await assertProjectOwnership(segment.projectId, userId);

		// Get shots in range
		const startShot = await db.query.shots.findFirst({
			where: eq(shots.id, segment.startShotId),
		});
		const endShot = await db.query.shots.findFirst({
			where: eq(shots.id, segment.endShotId),
		});

		if (!startShot || !endShot) {
			throw new Error("Invalid shot range");
		}

		const shotsInRange = await db.query.shots.findMany({
			where: and(
				eq(shots.projectId, segment.projectId),
				isNull(shots.deletedAt),
				gte(shots.order, startShot.order),
				lte(shots.order, endShot.order),
			),
			orderBy: [asc(shots.order)],
		});

		// Calculate target duration from shots
		const targetDuration = shotsInRange.reduce(
			(sum, s) => sum + s.durationSec,
			0,
		);

		// Generate proper narration from shot descriptions using AI
		const { script } = await generateNarrationFromShots({
			data: {
				shotDescriptions: shotsInRange.map((s) => s.description),
				targetDurationSec: targetDuration,
			},
		});

		// Save script to segment
		const [updated] = await db
			.update(audioSegments)
			.set({ script, updatedAt: new Date() })
			.where(eq(audioSegments.id, segmentId))
			.returning();

		return { script: updated.script };
	});

// ---------------------------------------------------------------------------
// generateSegmentAudio
// ---------------------------------------------------------------------------

export const generateSegmentAudio = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { segmentId: string; voiceId: string; batchId?: string }) => data,
	)
	.handler(async ({ data: { segmentId, voiceId, batchId: providedBatchId } }) => {
		const { userId } = await assertAuth();

		const segment = await db.query.audioSegments.findFirst({
			where: eq(audioSegments.id, segmentId),
		});
		if (!segment) throw new Error("Segment not found");

		await assertProjectOwnership(segment.projectId, userId);

		if (!segment.script?.trim()) {
			throw new Error("Segment has no script. Generate script first.");
		}

		const generationId = crypto.randomUUID();
		const batchId = providedBatchId ?? crypto.randomUUID();

		// Create placeholder asset
		const [placeholderAsset] = await db
			.insert(assets)
			.values({
				projectId: segment.projectId,
				type: "voiceover",
				stage: "audio",
				prompt: segment.script,
				model: "eleven_multilingual_v2",
				status: "queued",
				isSelected: false,
				generationId,
			})
			.returning();

		// Update segment status to generating and link placeholder
		await db
			.update(audioSegments)
			.set({
				status: "generating",
				voiceId,
				voiceoverAssetId: placeholderAsset.id,
				errorMessage: null,
				updatedAt: new Date(),
			})
			.where(eq(audioSegments.id, segmentId));

		// Import and trigger the task
		const { generateSegmentAudioAsset } = await import(
			"@/trigger/generate-segment-audio-asset"
		);

		const handle = await generateSegmentAudioAsset.trigger(
			{
				assetId: placeholderAsset.id,
				segmentId,
				userId,
				projectId: segment.projectId,
				generationId,
				script: segment.script,
				voiceId,
			},
			{
				tags: [
					`project:${segment.projectId}`,
					`segment:${segmentId}`,
					`audio:${placeholderAsset.id}`,
					`batch:${batchId}`,
				],
			},
		);

		// Store trigger run ID on asset
		await db
			.update(assets)
			.set({ jobId: handle.id })
			.where(eq(assets.id, placeholderAsset.id));

		return {
			assetId: placeholderAsset.id,
			batchId,
			runId: handle.id,
		};
	});

// ---------------------------------------------------------------------------
// generateAllSegments
// ---------------------------------------------------------------------------

export const generateAllSegments = createServerFn({ method: "POST" })
	.inputValidator((data: { projectId: string; voiceId: string }) => data)
	.handler(async ({ data: { projectId, voiceId } }) => {
		const { userId } = await assertAuth();
		await assertProjectOwnership(projectId, userId);

		const segments = await db.query.audioSegments.findMany({
			where: and(
				eq(audioSegments.projectId, projectId),
				isNull(audioSegments.deletedAt),
			),
			orderBy: [asc(audioSegments.order)],
		});

		// Create a shared batchId for all segments in this generation
		const batchId = crypto.randomUUID();

		const results: {
			segmentId: string;
			triggered: boolean;
			skipped?: boolean;
			error?: string;
		}[] = [];

		for (const segment of segments) {
			// Skip segments that are already done
			if (segment.status === "done" && segment.voiceoverAssetId) {
				results.push({ segmentId: segment.id, triggered: false, skipped: true });
				continue;
			}

			// Generate script if missing (this is still synchronous)
			if (!segment.script?.trim()) {
				try {
					await generateSegmentScript({ data: { segmentId: segment.id } });
				} catch (err) {
					results.push({
						segmentId: segment.id,
						triggered: false,
						error: "Failed to generate script",
					});
					continue;
				}
			}

			// Trigger audio generation (returns immediately)
			try {
				await generateSegmentAudio({
					data: { segmentId: segment.id, voiceId, batchId },
				});
				results.push({ segmentId: segment.id, triggered: true });
			} catch (err) {
				results.push({
					segmentId: segment.id,
					triggered: false,
					error: err instanceof Error ? err.message : "Unknown error",
				});
			}
		}

		return { batchId, results };
	});

// ---------------------------------------------------------------------------
// migrateProjectToSegments
// ---------------------------------------------------------------------------

export const migrateProjectToSegments = createServerFn({ method: "POST" })
	.inputValidator(
		(data: { projectId: string; legacyVoiceoverAssetId?: string }) => data,
	)
	.handler(async ({ data: { projectId, legacyVoiceoverAssetId } }) => {
		const { userId } = await assertAuth();
		await assertProjectOwnership(projectId, userId);

		// Check if segments already exist
		const existingSegments = await db.query.audioSegments.findMany({
			where: and(
				eq(audioSegments.projectId, projectId),
				isNull(audioSegments.deletedAt),
			),
		});

		if (existingSegments.length > 0) {
			return { migrated: false, message: "Segments already exist" };
		}

		// Get all shots
		const projectShots = await db.query.shots.findMany({
			where: and(eq(shots.projectId, projectId), isNull(shots.deletedAt)),
			orderBy: [asc(shots.order)],
		});

		if (projectShots.length === 0) {
			return { migrated: false, message: "No shots in project" };
		}

		// Create single segment covering all shots
		const firstShot = projectShots[0];
		const lastShot = projectShots[projectShots.length - 1];
		const totalDuration = projectShots.reduce(
			(sum, s) => sum + s.durationSec,
			0,
		);

		// Get legacy voiceover's script if provided
		let script: string | null = null;
		if (legacyVoiceoverAssetId) {
			const legacyAsset = await db.query.assets.findFirst({
				where: eq(assets.id, legacyVoiceoverAssetId),
			});
			if (legacyAsset?.prompt) {
				script = legacyAsset.prompt;
			}
		}

		const [segment] = await db
			.insert(audioSegments)
			.values({
				projectId,
				order: 1,
				startShotId: firstShot.id,
				endShotId: lastShot.id,
				targetDurationSec: totalDuration,
				script,
				voiceoverAssetId: legacyVoiceoverAssetId ?? null,
				status: legacyVoiceoverAssetId ? "done" : "draft",
			})
			.returning();

		return { migrated: true, segment };
	});
