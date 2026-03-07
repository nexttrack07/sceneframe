import { db } from '@/db/index'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { decryptUserApiKey } from '@/lib/encryption.server'
import type { IntakeAnswers, ConsistencyLock, ImageDefaults } from './project-types'

export async function getUserApiKey(userId: string) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })
  if (!user?.providerKeyEnc || !user?.providerKeyDek) {
    throw new Error('No Replicate API key found. Update it in onboarding.')
  }
  return decryptUserApiKey(user.providerKeyEnc, user.providerKeyDek)
}

export function parseReplicateImageUrls(output: unknown): string[] {
  const urls: string[] = []
  const walk = (value: unknown) => {
    if (!value) return
    if (typeof value === 'string') {
      if (value.startsWith('http://') || value.startsWith('https://')) urls.push(value)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>
      if (typeof record.toString === 'function') {
        const stringValue = String(record.toString())
        if (stringValue.startsWith('http://') || stringValue.startsWith('https://')) {
          urls.push(stringValue)
        }
      }
      if (typeof record.url === 'function') {
        try {
          const maybeUrl = (record.url as () => unknown).call(record)
          walk(maybeUrl)
        } catch {
          // Ignore malformed file-like objects and keep walking.
        }
      }
      walk(record.url)
      walk(record.output)
      walk(record.images)
      walk(record.data)
      walk(record.image)
      walk(record.files)
      walk(record.file)
      walk(record.urls)
    }
  }
  walk(output)
  return Array.from(new Set(urls))
}

export function summarizeReplicateOutput(output: unknown): string {
  if (output == null) return 'null'
  if (typeof output === 'string') return 'string'
  if (Array.isArray(output)) return `array(${output.length})`
  if (typeof output === 'object') {
    return `object keys=[${Object.keys(output as Record<string, unknown>).join(', ')}]`
  }
  return typeof output
}

export function buildLanePrompt(
  sceneDescription: string,
  lane: 'start' | 'end',
  intake: IntakeAnswers | undefined,
  consistencyLock: ConsistencyLock,
): string {
  const laneDirection =
    lane === 'start'
      ? 'Generate the START frame of this scene (opening moment).'
      : 'Generate the END frame of this scene (closing moment).'

  const intakeHints = intake
    ? [
        `Video purpose: ${intake.purpose}`,
        `Visual style: ${intake.style.join(', ')}`,
        `Mood: ${intake.mood.join(', ')}`,
        `Setting: ${intake.setting.join(', ')}`,
        `Target audience: ${intake.audience}`,
        intake.workingTitle ? `Working title: ${intake.workingTitle}` : null,
        intake.thumbnailPromise ? `Thumbnail promise: ${intake.thumbnailPromise}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    : 'No structured creative brief provided.'

  const consistencyHints =
    consistencyLock.enabled && consistencyLock.referenceUrls.length > 0
      ? `Consistency lock is ENABLED (${consistencyLock.strength} strength). Keep subject identity, style, and tone aligned with these references:\n${consistencyLock.referenceUrls
          .map((url) => `- ${url}`)
          .join('\n')}`
      : 'Consistency lock is disabled.'

  return `${laneDirection}

Scene description:
${sceneDescription}

Creative brief hints:
${intakeHints}

${consistencyHints}

Return a single high-quality still frame with clear cinematic composition, clean lighting, and strong readability.`
}

export function buildSystemPrompt(projectName: string, intake?: IntakeAnswers | null) {
  const intakeBlock = intake
    ? `
CREATIVE BRIEF (from structured intake):
- Channel preset: ${intake.channelPreset}
- Purpose: ${intake.purpose}
- Target length: ${intake.length}
- Visual style: ${intake.style.join(', ')}
- Mood / tone: ${intake.mood.join(', ')}
- Setting: ${intake.setting.join(', ')}
- Audience: ${intake.audience}
- Desired viewer action: ${intake.viewerAction}
- Working title: ${intake.workingTitle || 'Not provided'}
- Thumbnail promise: ${intake.thumbnailPromise || 'Not provided'}
- Concept: ${intake.concept}
`
    : ''

  const firstResponseRule = intake
    ? `- The user has already provided a structured creative brief. Your FIRST response must summarize their brief back to them in a friendly, conversational way and confirm you understand their vision. Do NOT propose scenes yet in your first response — wait for the user to confirm or adjust.`
    : `- If the user hasn't described their concept yet, ask what the video is about.`

  return `You are a creative director helping a user develop scenes for a short video project called "${projectName}".

Your job is to understand what the user wants and help them craft 3-8 distinct visual scenes.
${intakeBlock}
CONVERSATION RULES:
${firstResponseRule}
- In your first meaningful response after brief confirmation, propose an explicit opening hook that is optimized for the first 3-10 seconds.
- Ask clarifying questions about mood, tone, audience, and visual style — but keep it conversational, not interrogative. One or two questions at a time.
- When you have enough context and the user is happy, propose a scene breakdown.
- When proposing scenes, include a JSON block in your response with this exact format:

\`\`\`scenes
[
  {
    "title": "Short title",
    "description": "Detailed visual description for image generation (2-4 sentences). Be specific about lighting, camera angle, mood, subjects, and environment.",
    "durationSec": 6,
    "beat": "Hook / Problem / Proof / Payoff / CTA",
    "hookRole": "hook|body|cta"
  },
  ...
]
\`\`\`

- After proposing scenes, ask the user if they want to adjust anything.
- Each scene description must stand alone as an image generation prompt — no references to other scenes.
- Keep your conversational text brief and friendly. The scene descriptions should be the detailed part.`
}

export function qualityPresetToSteps(quality: ImageDefaults['qualityPreset']): number {
  if (quality === 'fast') return 20
  if (quality === 'high') return 40
  return 30
}
