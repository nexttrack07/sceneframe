import { db } from '@/db/index'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { decryptUserApiKey } from '@/lib/encryption.server'
import type { IntakeAnswers, ImageDefaults, ShotPlanEntry, ShotType } from './project-types'

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

  return `${laneDirection}

Scene description:
${sceneDescription}

Creative brief hints:
${intakeHints}

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

export function buildShotBreakdownPrompt(
  scenes: { title: string; description: string }[],
  targetDurationSec: number,
): string {
  const sceneList = scenes
    .map(
      (s, i) =>
        `Scene ${i} (title: "${s.title || `Scene ${i + 1}`}"): ${s.description}`,
    )
    .join('\n')

  return `You are a video production assistant. Break the following scenes into 5-second shots for a video with a target duration of ${targetDurationSec} seconds.

SCENES:
${sceneList}

RULES:
- Distribute shots across scenes proportionally based on scene importance and description length.
- Each shot must be exactly 5 seconds (durationSec: 5) unless you have a strong reason to vary (min 1, max 10).
- shotType is either "talking" (person speaking to camera) or "visual" (b-roll, graphics, environment).
- Each shot description must be a single, self-contained visual prompt (1-2 sentences).
- Total duration should be close to ${targetDurationSec} seconds.
- sceneIndex is zero-based matching the scene list above.

Return a JSON block with this exact format:

\`\`\`json
{
  "shots": [
    { "sceneIndex": 0, "description": "...", "shotType": "visual", "durationSec": 5 }
  ]
}
\`\`\`

Return ONLY the JSON block, nothing else.`
}

export function parseShotBreakdownResponse(
  response: string,
  sceneCount: number,
): ShotPlanEntry[] | null {
  try {
    // Extract JSON from fenced code block
    const fenceMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
    const jsonStr = fenceMatch ? fenceMatch[1] : response

    const parsed = JSON.parse(jsonStr.trim())
    const rawShots = Array.isArray(parsed) ? parsed : parsed?.shots
    if (!Array.isArray(rawShots) || rawShots.length === 0) return null

    const validShotTypes: ShotType[] = ['talking', 'visual']

    const result: ShotPlanEntry[] = rawShots
      .filter(
        (s: unknown): s is Record<string, unknown> =>
          typeof s === 'object' && s !== null,
      )
      .filter((s) => {
        const idx = Number(s.sceneIndex)
        return Number.isFinite(idx) && idx >= 0 && idx < sceneCount
      })
      .filter((s) => typeof s.description === 'string' && (s.description as string).trim().length > 0)
      .map((s) => {
        const rawType = String(s.shotType ?? 'visual')
        const shotType: ShotType = validShotTypes.includes(rawType as ShotType)
          ? (rawType as ShotType)
          : 'visual'
        const rawDuration = Number(s.durationSec ?? 5)
        const durationSec = rawDuration >= 1 && rawDuration <= 10 ? rawDuration : 5

        return {
          sceneIndex: Number(s.sceneIndex),
          description: (s.description as string).trim(),
          shotType,
          durationSec,
        }
      })

    return result.length > 0 ? result : null
  } catch {
    return null
  }
}
