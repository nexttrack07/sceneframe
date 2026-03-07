import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db/index'
import { assets, projects, scenes } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import Replicate from 'replicate'
import { uploadFromUrl } from '@/lib/r2.server'
import { randomUUID } from 'node:crypto'
import { assertProjectOwner, assertSceneOwner, assertAssetOwner } from '@/lib/assert-project-owner.server'
import { normalizeProjectSettings, normalizeImageDefaults, normalizeConsistencyLock } from './project-normalize'
import {
  getUserApiKey,
  parseReplicateImageUrls,
  summarizeReplicateOutput,
  buildLanePrompt,
  qualityPresetToSteps,
} from './replicate-helpers.server'

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

      const settings = normalizeProjectSettings(project.settings) ?? {}
      const sceneVersions = settings.sceneVersions ?? {}
      const existing = sceneVersions[sceneId] ?? []
      sceneVersions[sceneId] = [
        ...existing,
        { description: currentDescription, createdAt: new Date().toISOString() },
      ].slice(-20)

      await db
        .update(projects)
        .set({ settings: { ...settings, sceneVersions } })
        .where(eq(projects.id, project.id))

      return { description: newDescription }
    } finally {
      clearTimeout(timeout)
    }
  })

export const restoreSceneVersion = createServerFn({ method: 'POST' })
  .inputValidator((data: { sceneId: string; description: string }) => data)
  .handler(async ({ data: { sceneId, description } }) => {
    await assertSceneOwner(sceneId)
    await db.update(scenes).set({ description }).where(eq(scenes.id, sceneId))
  })

export const saveSceneAssetDecisionReasons = createServerFn({ method: 'POST' })
  .inputValidator((data: { sceneId: string; reasons: string[] }) => data)
  .handler(async ({ data: { sceneId, reasons } }) => {
    const { project } = await assertSceneOwner(sceneId)

    const settings = normalizeProjectSettings(project.settings) ?? {}
    const assetDecisionReasons = settings.assetDecisionReasons ?? {}
    assetDecisionReasons[sceneId] = reasons

    await db
      .update(projects)
      .set({ settings: { ...settings, assetDecisionReasons } })
      .where(eq(projects.id, project.id))
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
    const imageDefaults = normalizeImageDefaults({
      ...settings?.imageDefaults,
      ...settingsOverrides,
    })
    const consistencyLock = normalizeConsistencyLock(settings?.consistencyLock)
    const finalPrompt =
      promptOverride ?? buildLanePrompt(scene.description, lane, settings?.intake, consistencyLock)
    const isNanoBanana = imageDefaults.model === 'google/nano-banana-pro'
    const outputExtension = isNanoBanana ? 'png' : 'webp'
    const outputContentType = isNanoBanana ? 'image/png' : 'image/webp'

    const batchId = randomUUID()
    const type = lane === 'start' ? 'start_image' as const : 'end_image' as const
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
            consistencyLock,
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

        const storageKey = `projects/${project.id}/scenes/${scene.id}/images/${batchId}/${type}-${i + 1}.${outputExtension}`
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
    const { asset, scene } = await assertAssetOwner(assetId)

    if (asset.type !== 'start_image' && asset.type !== 'end_image') {
      throw new Error('Only image assets can be selected here')
    }
    if (asset.status !== 'done') {
      throw new Error('Only completed assets can be selected')
    }

    await db
      .update(assets)
      .set({ isSelected: false })
      .where(and(eq(assets.sceneId, scene.id), eq(assets.type, asset.type), isNull(assets.deletedAt)))

    await db.update(assets).set({ isSelected: true }).where(eq(assets.id, asset.id))
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
    await assertAssetOwner(assetId)
    const now = new Date()
    await db.update(assets).set({ deletedAt: now }).where(eq(assets.id, assetId))
  })

export const deleteScene = createServerFn({ method: 'POST' })
  .inputValidator((data: { sceneId: string }) => data)
  .handler(async ({ data: { sceneId } }) => {
    await assertSceneOwner(sceneId)

    const now = new Date()

    await db.update(assets).set({ deletedAt: now }).where(
      and(eq(assets.sceneId, sceneId), isNull(assets.deletedAt)),
    )

    await db.update(scenes).set({ deletedAt: now }).where(eq(scenes.id, sceneId))
  })
