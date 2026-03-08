import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db/index'
import { assets, projects, scenes, messages, shots } from '@/db/schema'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import Replicate from 'replicate'
import { assertProjectOwner } from '@/lib/assert-project-owner.server'
import { normalizeProjectSettings } from './project-normalize'
import { getUserApiKey, buildSystemPrompt, buildShotBreakdownPrompt, parseShotBreakdownResponse } from './replicate-helpers.server'
import type { IntakeAnswers, ScenePlanEntry, ShotPlanEntry, ProjectSettings } from './project-types'

const MAX_MESSAGE_LENGTH = 5_000
const MAX_HISTORY_MESSAGES = 30
const REPLICATE_TIMEOUT_MS = 60_000

export const saveIntake = createServerFn({ method: 'POST' })
  .inputValidator((data: { projectId: string; intake: IntakeAnswers }) => {
    const { intake } = data
    if (!intake.channelPreset) throw new Error('Channel preset is required')
    if (!intake.purpose) throw new Error('Purpose is required')
    if (!intake.length) throw new Error('Length is required')
    if (!intake.style.length) throw new Error('At least one style is required')
    if (!intake.mood.length) throw new Error('At least one mood is required')
    if (!intake.setting.length) throw new Error('At least one setting is required')
    if (!intake.audience?.trim()) throw new Error('Audience is required')
    if (!intake.viewerAction?.trim()) throw new Error('Viewer action is required')
    if (!intake.concept?.trim() || intake.concept.trim().length < 10) {
      throw new Error('Concept must be at least 10 characters')
    }
    return data
  })
  .handler(async ({ data: { projectId, intake } }) => {
    const { project } = await assertProjectOwner(projectId, 'error')

    const existing = normalizeProjectSettings(project.settings)
    const merged: ProjectSettings = {
      ...existing,
      intake,
      hookConfirmed: false,
    }

    await db.update(projects).set({ settings: merged }).where(eq(projects.id, projectId))
  })

export const setHookConfirmed = createServerFn({ method: 'POST' })
  .inputValidator((data: { projectId: string; confirmed: boolean }) => data)
  .handler(async ({ data: { projectId, confirmed } }) => {
    const { project } = await assertProjectOwner(projectId, 'error')

    const existing = normalizeProjectSettings(project.settings)
    const merged: ProjectSettings = { ...existing, hookConfirmed: confirmed }
    await db.update(projects).set({ settings: merged }).where(eq(projects.id, projectId))
  })

export const sendMessage = createServerFn({ method: 'POST' })
  .inputValidator((data: { projectId: string; content: string }) => {
    const trimmed = data.content.trim()
    if (trimmed.length === 0) throw new Error('Message cannot be empty')
    if (trimmed.length > MAX_MESSAGE_LENGTH)
      throw new Error(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`)
    return { projectId: data.projectId, content: trimmed }
  })
  .handler(async ({ data: { projectId, content } }) => {
    const { userId, project } = await assertProjectOwner(projectId, 'error')

    await db.insert(messages).values({ projectId, role: 'user', content })

    const history = await db.query.messages.findMany({
      where: eq(messages.projectId, projectId),
      orderBy: asc(messages.createdAt),
    })

    const recentHistory = history.slice(-MAX_HISTORY_MESSAGES)
    const apiKey = await getUserApiKey(userId)

    const intake = normalizeProjectSettings(project.settings)?.intake ?? null
    const systemPrompt = buildSystemPrompt(project.name, intake)
    const llmMessages = recentHistory.map((m) =>
      m.role === 'user' ? `User: ${m.content}` : `Assistant: ${m.content}`,
    )
    const prompt = `${systemPrompt}\n\n${llmMessages.join('\n\n')}`

    const replicate = new Replicate({ auth: apiKey })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS)

    try {
      const chunks: string[] = []
      for await (const event of replicate.stream('anthropic/claude-4.5-haiku', {
        input: { prompt, max_tokens: 2048, temperature: 0.7 },
        signal: controller.signal,
      })) {
        chunks.push(String(event))
      }
      const assistantContent = chunks.join('')

      if (!assistantContent.trim()) {
        throw new Error('AI returned an empty response — please try again')
      }

      await db
        .insert(messages)
        .values({ projectId, role: 'assistant', content: assistantContent })

      return { content: assistantContent }
    } finally {
      clearTimeout(timeout)
    }
  })

export const approveScenes = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { projectId: string; parsedScenes: ScenePlanEntry[]; targetDurationSec?: number }) => {
      if (!Array.isArray(data.parsedScenes) || data.parsedScenes.length < 1) {
        throw new Error('At least one scene is required')
      }
      if (data.parsedScenes.length > 10) {
        throw new Error('Too many scenes (max 10)')
      }
      for (const scene of data.parsedScenes) {
        if (!scene.description?.trim()) {
          throw new Error('Every scene must have a description')
        }
      }
      return data
    },
  )
  .handler(async ({ data: { projectId, parsedScenes, targetDurationSec = 300 } }) => {
    const { userId } = await assertProjectOwner(projectId, 'error')

    // ---------------------------------------------------------------
    // 1. OUTSIDE transaction: call AI to generate shot breakdown
    // ---------------------------------------------------------------
    let shotPlan: ShotPlanEntry[]

    try {
      const apiKey = await getUserApiKey(userId)
      const prompt = buildShotBreakdownPrompt(
        parsedScenes.map((s) => ({ title: s.title || '', description: s.description })),
        targetDurationSec,
      )

      const replicate = new Replicate({ auth: apiKey })
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), REPLICATE_TIMEOUT_MS)

      try {
        const chunks: string[] = []
        for await (const event of replicate.stream('anthropic/claude-4.5-haiku', {
          input: { prompt, max_tokens: 4096, temperature: 0.5 },
          signal: controller.signal,
        })) {
          chunks.push(String(event))
        }
        const aiResponse = chunks.join('')
        const parsed = parseShotBreakdownResponse(aiResponse, parsedScenes.length)
        shotPlan = parsed ?? buildFallbackShotPlan(parsedScenes)
      } finally {
        clearTimeout(timeout)
      }
    } catch {
      // AI failed entirely — fall back to 1 shot per scene
      shotPlan = buildFallbackShotPlan(parsedScenes)
    }

    // ---------------------------------------------------------------
    // 2. Compute cumulative timestamps
    // ---------------------------------------------------------------
    let cursor = 0
    const timestampedShots = shotPlan.map((shot) => {
      const start = cursor
      cursor += shot.durationSec
      return { ...shot, timestampStart: start, timestampEnd: cursor }
    })

    // ---------------------------------------------------------------
    // 3. INSIDE a single transaction: persist everything
    // ---------------------------------------------------------------
    await db.transaction(async (tx) => {
      // Soft-delete existing shots (via scene IDs)
      const existingSceneIds = (
        await tx
          .select({ id: scenes.id })
          .from(scenes)
          .where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)))
      ).map((r) => r.id)

      if (existingSceneIds.length > 0) {
        await tx
          .update(shots)
          .set({ deletedAt: new Date() })
          .where(and(inArray(shots.sceneId, existingSceneIds), isNull(shots.deletedAt)))
      }

      // Soft-delete existing scenes
      await tx
        .update(scenes)
        .set({ deletedAt: new Date() })
        .where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)))

      // Insert new scene rows
      const insertedScenes = await tx
        .insert(scenes)
        .values(
          parsedScenes.map((scene, i) => ({
            projectId,
            order: i + 1,
            title: scene.title || null,
            description: scene.description,
            stage: 'script' as const,
          })),
        )
        .returning({ id: scenes.id })

      // Insert new shot rows
      // Group shots by sceneIndex, then assign order within each scene
      const shotsByScene = new Map<number, typeof timestampedShots>()
      for (const shot of timestampedShots) {
        const existing = shotsByScene.get(shot.sceneIndex) ?? []
        existing.push(shot)
        shotsByScene.set(shot.sceneIndex, existing)
      }

      const shotValues: Array<{
        sceneId: string
        order: number
        description: string
        shotType: 'talking' | 'visual'
        durationSec: number
        timestampStart: number
        timestampEnd: number
      }> = []

      for (const [sceneIndex, sceneShots] of shotsByScene) {
        const sceneRow = insertedScenes[sceneIndex]
        if (!sceneRow) continue
        sceneShots.forEach((shot, i) => {
          shotValues.push({
            sceneId: sceneRow.id,
            order: i + 1,
            description: shot.description,
            shotType: shot.shotType,
            durationSec: shot.durationSec,
            timestampStart: shot.timestampStart,
            timestampEnd: shot.timestampEnd,
          })
        })
      }

      if (shotValues.length > 0) {
        await tx.insert(shots).values(shotValues)
      }

      // Update project
      const summary = parsedScenes.map((s) => s.title).join(' → ')
      await tx
        .update(projects)
        .set({ scriptStatus: 'done', directorPrompt: summary, scriptRaw: JSON.stringify(parsedScenes) })
        .where(eq(projects.id, projectId))
    })
  })

function buildFallbackShotPlan(parsedScenes: ScenePlanEntry[]): ShotPlanEntry[] {
  return parsedScenes.map((scene, i) => ({
    sceneIndex: i,
    description: scene.description,
    shotType: 'visual' as const,
    durationSec: 5,
  }))
}

export const resetWorkshop = createServerFn({ method: 'POST' })
  .inputValidator((projectId: string) => projectId)
  .handler(async ({ data: projectId }) => {
    await assertProjectOwner(projectId, 'error')

    await db.transaction(async (tx) => {
      // Soft-delete shots via scene IDs before soft-deleting scenes
      const sceneIds = (
        await tx
          .select({ id: scenes.id })
          .from(scenes)
          .where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)))
      ).map((r) => r.id)

      if (sceneIds.length > 0) {
        await tx
          .update(shots)
          .set({ deletedAt: new Date() })
          .where(and(inArray(shots.sceneId, sceneIds), isNull(shots.deletedAt)))

        // Soft-delete assets for those scenes/shots
        await tx
          .update(assets)
          .set({ deletedAt: new Date() })
          .where(and(inArray(assets.sceneId, sceneIds), isNull(assets.deletedAt)))
      }

      await tx
        .update(scenes)
        .set({ deletedAt: new Date() })
        .where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)))

      // messages table has no deletedAt column — hard delete is intentional
      await tx.delete(messages).where(eq(messages.projectId, projectId))

      await tx
        .update(projects)
        .set({ scriptStatus: 'idle', directorPrompt: '', scriptRaw: null, scriptJobId: null, settings: null })
        .where(eq(projects.id, projectId))
    })
  })

