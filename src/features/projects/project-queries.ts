import { createServerFn } from '@tanstack/react-start'
import { db } from '@/db/index'
import { assets, scenes, messages } from '@/db/schema'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { assertProjectOwner } from '@/lib/assert-project-owner.server'
import { normalizeProjectSettings } from './project-normalize'
import type { ScenePlanEntry } from './project-types'

export const loadProject = createServerFn({ method: 'GET' })
  .inputValidator((projectId: string) => projectId)
  .handler(async ({ data: projectId }) => {
    const { project } = await assertProjectOwner(projectId)

    const [projectScenes, projectMessages] = await Promise.all([
      db.query.scenes.findMany({
        where: and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)),
        orderBy: asc(scenes.order),
      }),
      db.query.messages.findMany({
        where: eq(messages.projectId, projectId),
        orderBy: asc(messages.createdAt),
      }),
    ])

    const sceneIds = projectScenes.map((scene) => scene.id)
    const projectAssets =
      sceneIds.length === 0
        ? []
        : await db.query.assets.findMany({
            where: and(
              inArray(assets.sceneId, sceneIds),
              eq(assets.stage, 'images'),
              isNull(assets.deletedAt),
            ),
            orderBy: asc(assets.createdAt),
          })

    return {
      project: {
        ...project,
        settings: normalizeProjectSettings(project.settings),
      },
      scenes: projectScenes,
      messages: projectMessages,
      assets: projectAssets
        .filter((asset): asset is typeof asset & { type: 'start_image' | 'end_image' } =>
          asset.type === 'start_image' || asset.type === 'end_image',
        )
        .filter(
          (asset): asset is typeof asset & { status: 'generating' | 'done' | 'error' } =>
            asset.status === 'generating' || asset.status === 'done' || asset.status === 'error',
        )
        .map((asset) => ({
          id: asset.id,
          sceneId: asset.sceneId,
          type: asset.type,
          status: asset.status,
          url: asset.url,
          errorMessage: asset.errorMessage,
          prompt: asset.prompt,
          model: asset.model,
          isSelected: asset.isSelected,
          batchId: asset.batchId,
          createdAt: asset.createdAt.toISOString(),
          modelSettings: (asset.modelSettings as Record<string, any>) ?? null,
        })),
    }
  })

export const exportProjectHandoff = createServerFn({ method: 'POST' })
  .inputValidator((data: { projectId: string; format: 'json' | 'markdown' }) => data)
  .handler(async ({ data: { projectId, format } }) => {
    const { project } = await assertProjectOwner(projectId, 'error')

    const projectScenes = await db.query.scenes.findMany({
      where: and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)),
      orderBy: asc(scenes.order),
    })
    const settings = normalizeProjectSettings(project.settings)
    let plan: ScenePlanEntry[] = []
    try {
      plan = project.scriptRaw ? JSON.parse(project.scriptRaw) : []
    } catch {
      plan = []
    }

    if (format === 'json') {
      return {
        content: JSON.stringify(
          {
            project: { id: project.id, name: project.name },
            intake: settings?.intake ?? null,
            scenes: projectScenes.map((scene, i) => ({
              id: scene.id,
              order: i + 1,
              title: scene.title,
              description: scene.description,
              beat: plan[i]?.beat ?? null,
              durationSec: plan[i]?.durationSec ?? null,
            })),
          },
          null,
          2,
        ),
        filename: `${project.name.replace(/\s+/g, '-').toLowerCase()}-handoff.json`,
        mimeType: 'application/json',
      }
    }

    const markdown = [
      `# ${project.name} - Production Handoff`,
      '',
      '## Creative Brief',
      settings?.intake ? `- Channel preset: ${settings.intake.channelPreset}` : '- Brief not found',
      settings?.intake ? `- Audience: ${settings.intake.audience}` : '',
      settings?.intake ? `- Viewer action: ${settings.intake.viewerAction}` : '',
      '',
      '## Scene Plan',
      ...projectScenes.map((scene, i) =>
        [
          `### Scene ${i + 1}${scene.title ? `: ${scene.title}` : ''}`,
          plan[i]?.beat ? `- Beat: ${plan[i].beat}` : '',
          plan[i]?.durationSec ? `- Duration: ${plan[i].durationSec}s` : '',
          '',
          scene.description,
          '',
        ]
          .filter(Boolean)
          .join('\n'),
      ),
    ]
      .filter(Boolean)
      .join('\n')

    return {
      content: markdown,
      filename: `${project.name.replace(/\s+/g, '-').toLowerCase()}-handoff.md`,
      mimeType: 'text/markdown',
    }
  })
