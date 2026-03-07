import type { IntakeAnswers, ScenePlanEntry } from '../project-types'

export function parseSceneProposal(
  content: string,
): ScenePlanEntry[] | null {
  const match = content.match(/```scenes\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1])
    if (!Array.isArray(parsed) || parsed.length < 1) return null
    return parsed
      .map((s: {
        title?: string
        description?: string
        durationSec?: number
        beat?: string
        hookRole?: 'hook' | 'body' | 'cta'
      }) => ({
        title: String(s.title ?? '').trim(),
        description: String(s.description ?? '').trim(),
        durationSec: Number.isFinite(s.durationSec) ? Number(s.durationSec) : undefined,
        beat: typeof s.beat === 'string' ? s.beat : undefined,
        hookRole: s.hookRole,
      }))
      .filter((s: { description: string }) => s.description.length > 0)
  } catch {
    return null
  }
}

export function composeBrief(intake: IntakeAnswers): string {
  const parts: string[] = []
  parts.push(
    `Channel preset: ${intake.channelPreset}. I'd like to create a ${intake.length.toLowerCase()} ${intake.style.join(', ').toLowerCase()} video`,
  )
  if (intake.purpose) parts[0] += ` for ${intake.purpose.toLowerCase()}`
  parts[0] += '.'

  if (intake.mood.length > 0) {
    parts.push(`The mood should be ${intake.mood.join(', ').toLowerCase()}.`)
  }
  if (intake.setting.length > 0) {
    parts.push(`Setting: ${intake.setting.join(', ').toLowerCase()}.`)
  }
  parts.push(`Audience: ${intake.audience}.`)
  parts.push(`Desired viewer action: ${intake.viewerAction}.`)
  if (intake.workingTitle?.trim()) parts.push(`Working title: ${intake.workingTitle.trim()}.`)
  if (intake.thumbnailPromise?.trim())
    parts.push(`Thumbnail promise: ${intake.thumbnailPromise.trim()}.`)
  parts.push(`Here's my concept: ${intake.concept}`)
  return parts.join(' ')
}

export function targetDurationRange(length: string): { min: number; max: number } | null {
  const map: Record<string, { min: number; max: number }> = {
    '15 seconds': { min: 12, max: 18 },
    '30 seconds': { min: 24, max: 36 },
    '1 minute': { min: 50, max: 70 },
    '2-3 minutes': { min: 120, max: 190 },
    '5+ minutes': { min: 280, max: 520 },
  }
  return map[length] ?? null
}

export function estimateDuration(scene: ScenePlanEntry): number {
  if (scene.durationSec && Number.isFinite(scene.durationSec)) return Math.max(2, scene.durationSec)
  const words = scene.description.trim().split(/\s+/).length
  return Math.max(3, Math.min(18, Math.round(words / 3)))
}
