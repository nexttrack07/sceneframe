import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db/index'
import { assets, scenes, shots } from '@/db/schema'
import { and, asc, eq, inArray, isNull, desc } from 'drizzle-orm'
import Replicate from 'replicate'
import { uploadFromUrl, deleteObject } from '@/lib/r2.server'
import { randomUUID } from 'node:crypto'
import { assertProjectOwner, assertSceneOwner, assertAssetOwner, assertShotOwner, assertAssetOwnerViaShot } from '@/lib/assert-project-owner.server'
import { normalizeProjectSettings, normalizeImageDefaults } from './project-normalize'
import {
  getUserApiKey,
  parseReplicateImageUrls,
  summarizeReplicateOutput,
  buildLanePrompt,
  qualityPresetToSteps,
} from './replicate-helpers.server'
import type { ShotType } from './project-types'

const MAX_MESSAGE_LENGTH = 5_000
const REPLICATE_TIMEOUT_MS = 60_000

export const updateScene = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { sceneId: string; title?: string | null; description?: string }) => data,
  )
  .handler(async ({ data: { sceneId, title, description } }) => {
    await assertSceneOwner(sceneId)

    const updates: Record<string, string | null> = {}
    if (title !== undefined) updates.title = title
    if (description !== undefined) updates.description = description

    if (Object.keys(updates).length > 0) {
      await db.update(scenes).set(updates).where(eq(scenes.id, sceneId))
    }
  })

export const saveScenePrompt = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { sceneId: string; lane: 'start' | 'end'; prompt: string }) => data,
  )
  .handler(async ({ data: { sceneId, lane, prompt } }) => {
    await assertSceneOwner(sceneId)
    const col = lane === 'start' ? { startFramePrompt: prompt } : { endFramePrompt: prompt }
    await db.update(scenes).set(col).where(eq(scenes.id, sceneId))
  })

export const regenerateSceneDescription = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { sceneId: string; instructions: string; currentDescription: string }) => {
      const trimmed = data.instructions.trim()
      if (trimmed.length === 0) throw new Error('Instructions cannot be empty')
      if (trimmed.length > MAX_MESSAGE_LENGTH)
        throw new Error(`Instructions too long (max ${MAX_MESSAGE_LENGTH} characters)`)
      return { sceneId: data.sceneId, instructions: trimmed, currentDescription: data.currentDescription }
    },
  )
  .handler(async ({ data: { sceneId, instructions, currentDescription } }) => {
    const { userId, project } = await assertSceneOwner(sceneId)
    const apiKey = await getUserApiKey(userId)

    const prompt = `You are refining a scene description for a video project called "${project.name}".

CURRENT SCENE DESCRIPTION:
${currentDescription}

USER'S REQUESTED CHANGES:
${instructions}

Rewrite the scene description incorporating the user's changes. The description must be a detailed visual description suitable for image generation (2-4 sentences). Be specific about lighting, camera angle, mood, subjects, and environment. The description must stand alone — no references to other scenes.

Return ONLY the new description text, nothing else.`

    const replicate = new Replicate({ auth: apiKey })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS)

    try {
      const chunks: string[] = []
      for await (const event of replicate.stream('anthropic/claude-4.5-haiku', {
        input: { prompt, max_tokens: 1024, temperature: 0.7 },
        signal: controller.signal,
      })) {
        chunks.push(String(event))
      }
      const newDescription = chunks.join('').trim()

      if (!newDescription) {
        throw new Error('AI returned an empty response — please try again')
      }

      return { description: newDescription }
    } finally {
      clearTimeout(timeout)
    }
  })

export const generateImagePrompt = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { sceneId: string; lane: 'start' | 'end'; currentPrompt?: string }) => data,
  )
  .handler(async ({ data: { sceneId, lane, currentPrompt } }) => {
    const { userId, scene, project } = await assertSceneOwner(sceneId)
    const apiKey = await getUserApiKey(userId)
    const settings = normalizeProjectSettings(project.settings)

    const systemPrompt = `You are an expert image prompt engineer for AI image generation models like Flux and Stable Diffusion.
Given a scene description from a video project, write a detailed, vivid image generation prompt for the ${lane === 'start' ? 'opening' : 'closing'} frame of this scene.

You MUST use this exact structured format with these sections:

[Subject]: Describe the main subject(s) in detail — appearance, expression, pose, clothing, distinguishing features.

[Action]: What the subject is doing in this specific moment.

[Environment]: The setting, background, and surrounding elements in rich detail.

[Cinematography]: Camera angle, lens type, depth of field, framing, and composition.

[Lighting/Style]: Lighting direction, quality, color grading, mood, and artistic style.

[Technical]: Photography/rendering style, resolution, aspect ratio, and technical quality descriptors.

Rules:
- Each section should be 1-2 detailed sentences
- Be extremely specific and vivid — avoid vague terms
- Use professional cinematic and photography language
- The prompt must stand alone — no references to other scenes or frames
- Do NOT include meta-instructions like "generate an image of"
${settings?.intake?.audience ? `- Target audience: ${settings.intake.audience}` : ''}
${settings?.intake?.viewerAction ? `- Video goal: ${settings.intake.viewerAction}` : ''}

Return ONLY the structured prompt, nothing else.`

    const userMessage = currentPrompt
      ? `Scene description: ${scene.description}\n\nCurrent prompt (improve this): ${currentPrompt}`
      : `Scene description: ${scene.description}`

    const replicate = new Replicate({ auth: apiKey })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS)

    try {
      const chunks: string[] = []
      for await (const event of replicate.stream('anthropic/claude-4.5-haiku', {
        input: { prompt: `${systemPrompt}\n\n${userMessage}`, max_tokens: 1024, temperature: 0.8 },
        signal: controller.signal,
      })) {
        chunks.push(String(event))
      }
      const generatedPrompt = chunks.join('').trim()
      if (!generatedPrompt) throw new Error('AI returned an empty response — please try again')

      // Persist the generated prompt to the scene
      const col = lane === 'start' ? { startFramePrompt: generatedPrompt } : { endFramePrompt: generatedPrompt }
      await db.update(scenes).set(col).where(eq(scenes.id, scene.id))

      return { prompt: generatedPrompt }
    } finally {
      clearTimeout(timeout)
    }
  })

export const generateSceneImages = createServerFn({ method: 'POST' })
  .inputValidator((data: { sceneId: string; lane: 'start' | 'end'; promptOverride?: string; settingsOverrides?: { model?: string; aspectRatio?: string; qualityPreset?: string; batchCount?: number } }) => {
    const lane = data.lane === 'end' ? 'end' as const : 'start' as const
    return {
      sceneId: data.sceneId,
      lane,
      promptOverride: data.promptOverride?.trim() || undefined,
      settingsOverrides: data.settingsOverrides,
    }
  })
  .handler(async ({ data: { sceneId, lane, promptOverride, settingsOverrides } }) => {
    const { userId, scene, project } = await assertSceneOwner(sceneId)
    const apiKey = await getUserApiKey(userId)

    const settings = normalizeProjectSettings(project.settings)

    // Default settings from last-used asset for this scene, then fallback to app defaults
    const lastAsset = await db.query.assets.findFirst({
      where: and(eq(assets.sceneId, sceneId), eq(assets.stage, 'images'), isNull(assets.deletedAt)),
      orderBy: desc(assets.createdAt),
    })
    const lastSettings = lastAsset?.modelSettings as Record<string, unknown> | null

    const imageDefaults = normalizeImageDefaults({
      ...lastSettings,
      ...settingsOverrides,
    })

    const finalPrompt =
      promptOverride ?? buildLanePrompt(scene.description, lane, settings?.intake)
    const isNanoBanana = imageDefaults.model === 'google/nano-banana-pro'
    const outputExtension = isNanoBanana ? 'png' : 'webp'
    const outputContentType = isNanoBanana ? 'image/png' : 'image/webp'

    const batchId = randomUUID()
    const type = 'image' as const
    const generationCount = Math.max(1, Math.min(4, imageDefaults.batchCount))

    const placeholders = await db
      .insert(assets)
      .values(
        Array.from({ length: generationCount }).map(() => ({
          sceneId: scene.id,
          type,
          stage: 'images' as const,
          prompt: finalPrompt,
          model: imageDefaults.model,
          modelSettings: {
            aspectRatio: imageDefaults.aspectRatio,
            qualityPreset: imageDefaults.qualityPreset,
            batchCount: generationCount,
            outputFormat: outputExtension,
            generationLane: lane,
          },
          status: 'generating' as const,
          isSelected: false,
          batchId,
          generationId: batchId,
        })),
      )
      .returning({ id: assets.id })

    if (scene.stage === 'script') {
      await db.update(scenes).set({ stage: 'images' }).where(eq(scenes.id, scene.id))
    }

    // Persist the prompt to the scene so it survives invalidation
    const promptCol = lane === 'start' ? { startFramePrompt: finalPrompt } : { endFramePrompt: finalPrompt }
    await db.update(scenes).set(promptCol).where(eq(scenes.id, scene.id))

    const queuedAssetIds = placeholders.map((row) => row.id)
    const replicate = new Replicate({ auth: apiKey })

    const replicateInput = isNanoBanana
      ? {
          prompt: finalPrompt,
          aspect_ratio: imageDefaults.aspectRatio,
          output_format: 'png' as const,
        }
      : {
          prompt: finalPrompt,
          aspect_ratio: imageDefaults.aspectRatio,
          num_outputs: 1,
          output_format: 'webp' as const,
          num_inference_steps: qualityPresetToSteps(imageDefaults.qualityPreset),
        }

    // Fire all Replicate calls in parallel to avoid blocking for N * generation_time
    const results = await Promise.allSettled(
      queuedAssetIds.map(async (assetId, i) => {
        const output = await replicate.run(imageDefaults.model as `${string}/${string}`, {
          input: replicateInput,
        })

        const urls = parseReplicateImageUrls(output)
        const sourceUrl = urls[0]

        if (!sourceUrl) {
          throw new Error(`No output URL found (${summarizeReplicateOutput(output)}).`)
        }

        const storageKey = `projects/${project.id}/scenes/${scene.id}/images/${batchId}/image-${i + 1}.${outputExtension}`
        const storedUrl = await uploadFromUrl(sourceUrl, storageKey, outputContentType)

        await db
          .update(assets)
          .set({
            url: storedUrl,
            storageKey,
            status: 'done',
            errorMessage: null,
          })
          .where(eq(assets.id, assetId))
      }),
    )

    let completedCount = 0
    let failedCount = 0
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        completedCount += 1
      } else {
        const reason = (results[i] as PromiseRejectedResult).reason
        const errorMessage = reason instanceof Error ? reason.message : 'Image generation failed'
        await db
          .update(assets)
          .set({ status: 'error', errorMessage })
          .where(eq(assets.id, queuedAssetIds[i]))
        failedCount += 1
      }
    }

    return { queuedCount: queuedAssetIds.length, completedCount, failedCount, batchId }
  })

export const selectAsset = createServerFn({ method: 'POST' })
  .inputValidator((data: { assetId: string }) => data)
  .handler(async ({ data: { assetId } }) => {
    const { asset } = await assertAssetOwner(assetId)

    if (!['start_image', 'end_image', 'image'].includes(asset.type)) {
      throw new Error('Only image assets can be selected here')
    }
    if (asset.status !== 'done') {
      throw new Error('Only completed assets can be selected')
    }

    await db.transaction(async (tx) => {
      await tx
        .update(assets)
        .set({ isSelected: false })
        .where(and(
          eq(assets.sceneId, asset.sceneId),
          isNull(assets.shotId),
          inArray(assets.type, ['start_image', 'end_image', 'image']),
          isNull(assets.deletedAt),
        ))
      await tx.update(assets).set({ isSelected: true }).where(eq(assets.id, asset.id))
    })
  })

export const reorderScene = createServerFn({ method: 'POST' })
  .inputValidator((data: { sceneId: string; newOrder: number }) => {
    if (typeof data.newOrder !== 'number' || !Number.isFinite(data.newOrder)) {
      throw new Error('newOrder must be a finite number')
    }
    return data
  })
  .handler(async ({ data: { sceneId, newOrder } }) => {
    await assertSceneOwner(sceneId)
    await db.update(scenes).set({ order: newOrder }).where(eq(scenes.id, sceneId))
  })

export const addScene = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { projectId: string; title?: string; description: string; afterOrder: number }) => {
      if (!data.description?.trim()) throw new Error('Description is required')
      if (typeof data.afterOrder !== 'number' || !Number.isFinite(data.afterOrder)) {
        throw new Error('afterOrder must be a finite number')
      }
      return data
    },
  )
  .handler(async ({ data: { projectId, title, description, afterOrder } }) => {
    await assertProjectOwner(projectId, 'error')

    const newOrder = afterOrder + 0.5

    await db.insert(scenes).values({
      projectId,
      order: newOrder,
      title: title || null,
      description,
      stage: 'script' as const,
    })
  })

export const deleteAsset = createServerFn({ method: 'POST' })
  .inputValidator((data: { assetId: string }) => data)
  .handler(async ({ data: { assetId } }) => {
    const { asset } = await assertAssetOwner(assetId)
    if (asset.storageKey) {
      await deleteObject(asset.storageKey).catch(() => {})
    }
    await db.update(assets).set({ deletedAt: new Date() }).where(eq(assets.id, assetId))
  })

export const deleteScene = createServerFn({ method: 'POST' })
  .inputValidator((data: { sceneId: string }) => data)
  .handler(async ({ data: { sceneId } }) => {
    await assertSceneOwner(sceneId)

    const now = new Date()

    // Get child shot IDs
    const childShotIds = (
      await db
        .select({ id: shots.id })
        .from(shots)
        .where(and(eq(shots.sceneId, sceneId), isNull(shots.deletedAt)))
    ).map((r) => r.id)

    // Collect storageKeys for R2 cleanup
    const assetRows: { storageKey: string | null }[] = []
    if (childShotIds.length > 0) {
      const shotAssets = await db
        .select({ storageKey: assets.storageKey })
        .from(assets)
        .where(and(inArray(assets.shotId, childShotIds), isNull(assets.deletedAt)))
      assetRows.push(...shotAssets)
    }
    const sceneAssets = await db
      .select({ storageKey: assets.storageKey })
      .from(assets)
      .where(and(eq(assets.sceneId, sceneId), isNull(assets.shotId), isNull(assets.deletedAt)))
    assetRows.push(...sceneAssets)

    const storageKeys = assetRows.map((r) => r.storageKey).filter((k): k is string => k !== null)
    await Promise.allSettled(storageKeys.map((key) => deleteObject(key)))

    // Soft-delete assets belonging to child shots
    if (childShotIds.length > 0) {
      await db
        .update(assets)
        .set({ deletedAt: now })
        .where(and(inArray(assets.shotId, childShotIds), isNull(assets.deletedAt)))
    }

    // Soft-delete scene-level assets (those without a shotId)
    await db.update(assets).set({ deletedAt: now }).where(
      and(eq(assets.sceneId, sceneId), isNull(assets.shotId), isNull(assets.deletedAt)),
    )

    // Soft-delete child shots
    if (childShotIds.length > 0) {
      await db
        .update(shots)
        .set({ deletedAt: now })
        .where(inArray(shots.id, childShotIds))
    }

    await db.update(scenes).set({ deletedAt: now }).where(eq(scenes.id, sceneId))
  })

// ---------------------------------------------------------------------------
// recomputeProjectTimestamps
// ---------------------------------------------------------------------------

async function recomputeProjectTimestamps(projectId: string) {
  // Load all non-deleted shots for the project, ordered by scene.order ASC, shot.order ASC
  const projectScenes = await db
    .select({ id: scenes.id, order: scenes.order })
    .from(scenes)
    .where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)))
    .orderBy(asc(scenes.order))

  if (projectScenes.length === 0) return

  const sceneIds = projectScenes.map((s) => s.id)
  const allShots = await db
    .select({ id: shots.id, sceneId: shots.sceneId, order: shots.order, durationSec: shots.durationSec })
    .from(shots)
    .where(and(inArray(shots.sceneId, sceneIds), isNull(shots.deletedAt)))
    .orderBy(asc(shots.order))

  // Sort shots by scene order then shot order
  const sceneOrderMap = new Map(projectScenes.map((s, i) => [s.id, i]))
  allShots.sort((a, b) => {
    const sceneOrdA = sceneOrderMap.get(a.sceneId) ?? 0
    const sceneOrdB = sceneOrderMap.get(b.sceneId) ?? 0
    if (sceneOrdA !== sceneOrdB) return sceneOrdA - sceneOrdB
    return a.order - b.order
  })

  // Compute cumulative timestamps and batch update in parallel
  let cursor = 0
  const updates: { id: string; timestampStart: number; timestampEnd: number }[] = []
  for (const shot of allShots) {
    const start = cursor
    cursor += shot.durationSec
    updates.push({ id: shot.id, timestampStart: start, timestampEnd: cursor })
  }

  await Promise.all(
    updates.map((u) =>
      db
        .update(shots)
        .set({ timestampStart: u.timestampStart, timestampEnd: u.timestampEnd })
        .where(eq(shots.id, u.id)),
    ),
  )
}

// ---------------------------------------------------------------------------
// updateShot
// ---------------------------------------------------------------------------

export const updateShot = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { shotId: string; description?: string; shotType?: ShotType; durationSec?: number }) => data,
  )
  .handler(async ({ data: { shotId, description, shotType, durationSec } }) => {
    const { shot, scene } = await assertShotOwner(shotId)

    const updates: Record<string, unknown> = {}
    if (description !== undefined) updates.description = description
    if (shotType !== undefined) updates.shotType = shotType
    if (durationSec !== undefined) updates.durationSec = durationSec

    if (Object.keys(updates).length > 0) {
      await db.update(shots).set(updates).where(eq(shots.id, shotId))
    }

    if (durationSec !== undefined && durationSec !== shot.durationSec) {
      await recomputeProjectTimestamps(scene.projectId)
    }
  })

// ---------------------------------------------------------------------------
// deleteShot
// ---------------------------------------------------------------------------

export const deleteShot = createServerFn({ method: 'POST' })
  .inputValidator((data: { shotId: string }) => data)
  .handler(async ({ data: { shotId } }) => {
    const { scene } = await assertShotOwner(shotId)

    const now = new Date()

    // Collect storageKeys for R2 cleanup
    const shotAssets = await db
      .select({ storageKey: assets.storageKey })
      .from(assets)
      .where(and(eq(assets.shotId, shotId), isNull(assets.deletedAt)))
    const storageKeys = shotAssets.map((r) => r.storageKey).filter((k): k is string => k !== null)
    await Promise.allSettled(storageKeys.map((key) => deleteObject(key)))

    // Soft-delete shot's assets
    await db
      .update(assets)
      .set({ deletedAt: now })
      .where(and(eq(assets.shotId, shotId), isNull(assets.deletedAt)))

    // Soft-delete the shot
    await db.update(shots).set({ deletedAt: now }).where(eq(shots.id, shotId))

    await recomputeProjectTimestamps(scene.projectId)
  })

// ---------------------------------------------------------------------------
// addShot
// ---------------------------------------------------------------------------

export const addShot = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { sceneId: string; description: string; shotType: ShotType; afterOrder: number }) => {
      if (!data.description?.trim()) throw new Error('Description is required')
      if (typeof data.afterOrder !== 'number' || !Number.isFinite(data.afterOrder)) {
        throw new Error('afterOrder must be a finite number')
      }
      return data
    },
  )
  .handler(async ({ data: { sceneId, description, shotType, afterOrder } }) => {
    const { scene } = await assertSceneOwner(sceneId)

    const newOrder = afterOrder + 0.5

    await db.insert(shots).values({
      sceneId,
      order: newOrder,
      description,
      shotType,
      durationSec: 5,
    })

    await recomputeProjectTimestamps(scene.projectId)
  })

// ---------------------------------------------------------------------------
// reorderShot
// ---------------------------------------------------------------------------

export const reorderShot = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { shotId: string; newOrder: number; targetSceneId?: string }) => {
      if (typeof data.newOrder !== 'number' || !Number.isFinite(data.newOrder)) {
        throw new Error('newOrder must be a finite number')
      }
      return data
    },
  )
  .handler(async ({ data: { shotId, newOrder, targetSceneId } }) => {
    const { scene } = await assertShotOwner(shotId)

    const updates: Record<string, unknown> = { order: newOrder }
    if (targetSceneId) {
      // Verify the target scene belongs to the same user/project
      await assertSceneOwner(targetSceneId)
      updates.sceneId = targetSceneId
    }

    await db.update(shots).set(updates).where(eq(shots.id, shotId))

    await recomputeProjectTimestamps(scene.projectId)
  })

// ---------------------------------------------------------------------------
// saveShotPrompt
// ---------------------------------------------------------------------------

export const saveShotPrompt = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { shotId: string; prompt: string }) => data,
  )
  .handler(async ({ data: { shotId, prompt } }) => {
    await assertShotOwner(shotId)
    await db.update(shots).set({ imagePrompt: prompt }).where(eq(shots.id, shotId))
  })

// ---------------------------------------------------------------------------
// generateShotImagePrompt
// ---------------------------------------------------------------------------

export const generateShotImagePrompt = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { shotId: string; lane: 'start' | 'end' }) => data,
  )
  .handler(async ({ data: { shotId, lane } }) => {
    const { userId, shot, project } = await assertShotOwner(shotId)
    const apiKey = await getUserApiKey(userId)
    const settings = normalizeProjectSettings(project.settings)

    const isStart = lane === 'start'
    const frameLabel = isStart ? 'FIRST (start) frame' : 'LAST (end) frame'
    const momentInstruction = isStart
      ? 'This is the FIRST frame — describe the scene at T=0, before any action has occurred. Capture the initial state: where subjects are positioned, their starting pose and expression, the environment as it looks at the very beginning of the shot.'
      : 'This is the LAST frame — describe the scene at the end of the shot, after all action has completed. Capture the final state: where subjects have moved to, their ending pose and expression, any environmental changes that occurred during the shot.'

    const systemPrompt = `You are an expert image prompt engineer for AI image generation models like Flux and Stable Diffusion.
You are generating the ${frameLabel} of a video shot. This image will be used as a keyframe in Kling AI video generation — the start and end frames must be visually distinct enough for the AI to interpolate meaningful motion between them.

${momentInstruction}

First, silently reason about the shot's motion arc: what changes between the beginning and end of this shot? Then write the image prompt for the ${frameLabel} only.

You MUST use this exact structured format:

[Subject]: Describe the main subject(s) — appearance, expression, pose, clothing. Be specific about their state at this exact moment in the shot.

[Action]: What the subject is doing at this precise moment (not during the shot — at this frame specifically).

[Environment]: The setting and surrounding elements at this moment.

[Cinematography]: Camera angle, lens, depth of field, framing, composition.

[Lighting/Style]: Lighting, color grading, mood, artistic style.

[Technical]: Photography/rendering style and quality descriptors.

Rules:
- Each section 1-2 sentences, extremely specific
- The subject's pose/position/expression must reflect the ${isStart ? 'beginning' : 'end'} of the action — not a neutral or generic state
- Use professional cinematic language
- Do NOT reference the other frame or describe motion — only describe this single frozen moment
- Do NOT include meta-instructions like "generate an image of"
${settings?.intake?.audience ? `- Target audience: ${settings.intake.audience}` : ''}
${settings?.intake?.viewerAction ? `- Video goal: ${settings.intake.viewerAction}` : ''}

Return ONLY the structured prompt, nothing else.`

    const userMessage = `Shot description: ${shot.description}`

    const replicate = new Replicate({ auth: apiKey })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS)

    try {
      const chunks: string[] = []
      for await (const event of replicate.stream('anthropic/claude-4.5-haiku', {
        input: { prompt: `${systemPrompt}\n\n${userMessage}`, max_tokens: 1024, temperature: 0.8 },
        signal: controller.signal,
      })) {
        chunks.push(String(event))
      }
      const generatedPrompt = chunks.join('').trim()
      if (!generatedPrompt) throw new Error('AI returned an empty response — please try again')

      return { prompt: generatedPrompt }
    } finally {
      clearTimeout(timeout)
    }
  })

// ---------------------------------------------------------------------------
// generateShotImages
// ---------------------------------------------------------------------------

export const generateShotImages = createServerFn({ method: 'POST' })
  .inputValidator((data: { shotId: string; lane: 'start' | 'end'; promptOverride?: string; settingsOverrides?: { model?: string; aspectRatio?: string; qualityPreset?: string; batchCount?: number } }) => {
    const lane = data.lane === 'end' ? 'end' as const : 'start' as const
    return {
      shotId: data.shotId,
      lane,
      promptOverride: data.promptOverride?.trim() || undefined,
      settingsOverrides: data.settingsOverrides,
    }
  })
  .handler(async ({ data: { shotId, lane, promptOverride, settingsOverrides } }) => {
    const { userId, shot, scene, project } = await assertShotOwner(shotId)
    const apiKey = await getUserApiKey(userId)

    const settings = normalizeProjectSettings(project.settings)

    // Default settings from last-used asset for this shot, then fallback to app defaults
    const lastAsset = await db.query.assets.findFirst({
      where: and(eq(assets.shotId, shotId), eq(assets.stage, 'images'), isNull(assets.deletedAt)),
      orderBy: desc(assets.createdAt),
    })
    const lastSettings = lastAsset?.modelSettings as Record<string, unknown> | null

    const imageDefaults = normalizeImageDefaults({
      ...lastSettings,
      ...settingsOverrides,
    })

    const finalPrompt =
      promptOverride ?? shot.imagePrompt ?? buildLanePrompt(shot.description, lane, settings?.intake)
    const isNanoBanana = imageDefaults.model === 'google/nano-banana-pro'
    const outputExtension = isNanoBanana ? 'png' : 'webp'
    const outputContentType = isNanoBanana ? 'image/png' : 'image/webp'

    const batchId = randomUUID()
    const type = 'image' as const
    const generationCount = Math.max(1, Math.min(4, imageDefaults.batchCount))

    const placeholders = await db
      .insert(assets)
      .values(
        Array.from({ length: generationCount }).map(() => ({
          sceneId: scene.id,
          shotId: shot.id,
          type,
          stage: 'images' as const,
          prompt: finalPrompt,
          model: imageDefaults.model,
          modelSettings: {
            aspectRatio: imageDefaults.aspectRatio,
            qualityPreset: imageDefaults.qualityPreset,
            batchCount: generationCount,
            outputFormat: outputExtension,
            generationLane: lane,
          },
          status: 'generating' as const,
          isSelected: false,
          batchId,
          generationId: batchId,
        })),
      )
      .returning({ id: assets.id })

    if (scene.stage === 'script') {
      await db.update(scenes).set({ stage: 'images' }).where(eq(scenes.id, scene.id))
    }

    // Persist the prompt to the shot so it survives invalidation
    await db.update(shots).set({ imagePrompt: finalPrompt }).where(eq(shots.id, shot.id))

    const queuedAssetIds = placeholders.map((row) => row.id)
    const replicate = new Replicate({ auth: apiKey })

    const replicateInput = isNanoBanana
      ? {
          prompt: finalPrompt,
          aspect_ratio: imageDefaults.aspectRatio,
          output_format: 'png' as const,
        }
      : {
          prompt: finalPrompt,
          aspect_ratio: imageDefaults.aspectRatio,
          num_outputs: 1,
          output_format: 'webp' as const,
          num_inference_steps: qualityPresetToSteps(imageDefaults.qualityPreset),
        }

    // Fire all Replicate calls in parallel
    const results = await Promise.allSettled(
      queuedAssetIds.map(async (assetId, i) => {
        const output = await replicate.run(imageDefaults.model as `${string}/${string}`, {
          input: replicateInput,
        })

        const urls = parseReplicateImageUrls(output)
        const sourceUrl = urls[0]

        if (!sourceUrl) {
          throw new Error(`No output URL found (${summarizeReplicateOutput(output)}).`)
        }

        const storageKey = `projects/${project.id}/scenes/${scene.id}/shots/${shot.id}/images/${batchId}/image-${i + 1}.${outputExtension}`
        const storedUrl = await uploadFromUrl(sourceUrl, storageKey, outputContentType)

        await db
          .update(assets)
          .set({
            url: storedUrl,
            storageKey,
            status: 'done',
            errorMessage: null,
          })
          .where(eq(assets.id, assetId))
      }),
    )

    let completedCount = 0
    let failedCount = 0
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') {
        completedCount += 1
      } else {
        const reason = (results[i] as PromiseRejectedResult).reason
        const errorMessage = reason instanceof Error ? reason.message : 'Image generation failed'
        await db
          .update(assets)
          .set({ status: 'error', errorMessage })
          .where(eq(assets.id, queuedAssetIds[i]))
        failedCount += 1
      }
    }

    return { queuedCount: queuedAssetIds.length, completedCount, failedCount, batchId }
  })

// ---------------------------------------------------------------------------
// generateShotVideoPrompt
// ---------------------------------------------------------------------------

export const generateShotVideoPrompt = createServerFn({ method: 'POST' })
  .inputValidator((data: { shotId: string }) => data)
  .handler(async ({ data: { shotId } }) => {
    const { userId, shot, project } = await assertShotOwner(shotId)
    const apiKey = await getUserApiKey(userId)
    const settings = normalizeProjectSettings(project.settings)

    const systemPrompt = `You are an expert prompt engineer for Kling AI video generation.
Given a shot description, write a video motion prompt using this exact structured format:

[Cinematography]: Describe the camera movement precisely — type of shot, direction, speed, and how it evolves. Be specific (e.g. "slow dolly forward", "rapid zoom-out accelerating into aerial bird's-eye view", "static locked-off medium shot").

[Subject]: Describe the main subject(s) and how they appear or change as the camera moves. Include relevant visual details only where they support understanding the motion.

[Action]: Describe exactly what the subject does during the clip — movement, gestures, direction, speed, and how the action resolves by the end of the shot.

[Context]: Describe the environment and any environmental motion — wind, crowds, light shifts, background elements in motion.

[Style & Ambiance]: Visual style, mood, lighting quality, and overall aesthetic. Be specific about the feel and tone.

Rules:
- Write each section as 1-3 dense, specific sentences
- Present tense throughout
- Prioritize motion and action — static description belongs in the start frame image, not here
- Be precise about speed and direction — avoid vague terms like "dynamic" or "cinematic"
- The start frame image already establishes appearance — reference it only to anchor motion
${settings?.intake?.style?.length ? `- Visual style: ${settings.intake.style.join(', ')}` : ''}
${settings?.intake?.mood?.length ? `- Mood: ${settings.intake.mood.join(', ')}` : ''}

Return ONLY the structured prompt, nothing else.`

    const userMessage = `Shot description: ${shot.description}`

    const replicate = new Replicate({ auth: apiKey })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS)

    try {
      const chunks: string[] = []
      for await (const event of replicate.stream('anthropic/claude-4.5-haiku', {
        input: { prompt: `${systemPrompt}\n\n${userMessage}`, max_tokens: 1024, temperature: 0.7 },
        signal: controller.signal,
      })) {
        chunks.push(String(event))
      }
      const generatedPrompt = chunks.join('').trim()
      if (!generatedPrompt) throw new Error('AI returned an empty response — please try again')
      return { prompt: generatedPrompt }
    } finally {
      clearTimeout(timeout)
    }
  })

// ---------------------------------------------------------------------------
// generateShotVideo
// ---------------------------------------------------------------------------

const KLING_VIDEO_TIMEOUT_MS = 300_000 // 5 minutes

export const generateShotVideo = createServerFn({ method: 'POST' })
  .inputValidator((data: { shotId: string; prompt: string }) => data)
  .handler(async ({ data: { shotId, prompt } }) => {
    const { shot, scene, project } = await assertShotOwner(shotId)

    // Get the selected image to use as start frame
    const selectedAsset = await db.query.assets.findFirst({
      where: and(
        eq(assets.shotId, shotId),
        inArray(assets.type, ['start_image', 'end_image', 'image']),
        eq(assets.isSelected, true),
        eq(assets.status, 'done'),
        isNull(assets.deletedAt),
      ),
    })
    if (!selectedAsset?.url) throw new Error('No selected image found — select a start frame image first')

    const { userId } = await assertShotOwner(shotId)
    const apiKey = await getUserApiKey(userId)

    // Insert placeholder asset
    const [placeholder] = await db
      .insert(assets)
      .values({
        sceneId: scene.id,
        shotId: shot.id,
        type: 'video' as const,
        stage: 'video' as const,
        prompt,
        model: 'kwaivgi/kling-v3-omni-video',
        modelSettings: { duration: shot.durationSec },
        status: 'generating' as const,
        isSelected: false,
        batchId: randomUUID(),
        generationId: randomUUID(),
      })
      .returning({ id: assets.id })

    const replicate = new Replicate({ auth: apiKey })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), KLING_VIDEO_TIMEOUT_MS)

    try {
      const output = await replicate.run('kwaivgi/kling-v3-omni-video', {
        input: {
          prompt,
          start_image: selectedAsset.url,
          duration: Math.max(3, Math.min(15, shot.durationSec)),
          generate_audio: false,
        },
        signal: controller.signal,
      })

      if (typeof output !== 'string' || !output) {
        throw new Error(`Unexpected output format from Kling: ${summarizeReplicateOutput(output)}`)
      }
      const videoUrl = output

      const storageKey = `projects/${project.id}/scenes/${scene.id}/shots/${shot.id}/videos/${placeholder.id}.mp4`
      const storedUrl = await uploadFromUrl(videoUrl, storageKey, 'video/mp4')

      await db
        .update(assets)
        .set({ url: storedUrl, storageKey, status: 'done', errorMessage: null })
        .where(eq(assets.id, placeholder.id))

      return { assetId: placeholder.id, url: storedUrl }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Video generation failed'
      await db
        .update(assets)
        .set({ status: 'error', errorMessage })
        .where(eq(assets.id, placeholder.id))
      throw err
    } finally {
      clearTimeout(timeout)
    }
  })

// ---------------------------------------------------------------------------
// selectShotAsset
// ---------------------------------------------------------------------------

export const selectShotAsset = createServerFn({ method: 'POST' })
  .inputValidator((data: { assetId: string }) => data)
  .handler(async ({ data: { assetId } }) => {
    const { asset, shot } = await assertAssetOwnerViaShot(assetId)

    if (!['start_image', 'end_image', 'image'].includes(asset.type)) {
      throw new Error('Only image assets can be selected here')
    }
    if (asset.status !== 'done') {
      throw new Error('Only completed assets can be selected')
    }

    // Deselect all image-type assets for this shot, then select the target
    await db.transaction(async (tx) => {
      await tx
        .update(assets)
        .set({ isSelected: false })
        .where(and(
          eq(assets.shotId, shot.id),
          inArray(assets.type, ['start_image', 'end_image', 'image']),
          isNull(assets.deletedAt),
        ))
      await tx.update(assets).set({ isSelected: true }).where(eq(assets.id, asset.id))
    })
  })
