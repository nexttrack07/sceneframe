import { createServerFn } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { auth } from '@clerk/tanstack-react-start/server'
import { db } from '@/db/index'
import { projects, scenes, messages, users } from '@/db/schema'
import { and, asc, eq, isNull } from 'drizzle-orm'
import Replicate from 'replicate'
import { decryptUserApiKey } from '@/lib/encryption.server'

const MAX_MESSAGE_LENGTH = 5_000
const MAX_HISTORY_MESSAGES = 30
const REPLICATE_TIMEOUT_MS = 60_000

export interface IntakeAnswers {
  purpose: string
  length: string
  style: string[]
  mood: string[]
  setting: string[]
  concept: string
}

function buildSystemPrompt(projectName: string, intake?: IntakeAnswers | null) {
  const intakeBlock = intake
    ? `
CREATIVE BRIEF (from structured intake):
- Purpose: ${intake.purpose}
- Target length: ${intake.length}
- Visual style: ${intake.style.join(', ')}
- Mood / tone: ${intake.mood.join(', ')}
- Setting: ${intake.setting.join(', ')}
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
- Ask clarifying questions about mood, tone, audience, and visual style — but keep it conversational, not interrogative. One or two questions at a time.
- When you have enough context and the user is happy, propose a scene breakdown.
- When proposing scenes, include a JSON block in your response with this exact format:

\`\`\`scenes
[
  { "title": "Short title", "description": "Detailed visual description for image generation (2-4 sentences). Be specific about lighting, camera angle, mood, subjects, and environment." },
  ...
]
\`\`\`

- After proposing scenes, ask the user if they want to adjust anything.
- Each scene description must stand alone as an image generation prompt — no references to other scenes.
- Keep your conversational text brief and friendly. The scene descriptions should be the detailed part.`
}

// ---------------------------------------------------------------------------
// Load project with scenes and messages
// ---------------------------------------------------------------------------

export const loadProject = createServerFn()
  .inputValidator((projectId: string) => projectId)
  .handler(async ({ data: projectId }) => {
    const { userId } = await auth()
    if (!userId) throw redirect({ to: '/sign-in' })

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, projectId),
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
      ),
    })
    if (!project) throw redirect({ to: '/dashboard' })

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

    return {
      project: {
        ...project,
        settings: (project.settings ?? null) as IntakeAnswers | null,
      },
      scenes: projectScenes,
      messages: projectMessages,
    }
  })

// ---------------------------------------------------------------------------
// Save intake answers to project settings
// ---------------------------------------------------------------------------

export const saveIntake = createServerFn({ method: 'POST' })
  .inputValidator((data: { projectId: string; intake: IntakeAnswers }) => {
    const { intake } = data
    if (!intake.purpose) throw new Error('Purpose is required')
    if (!intake.length) throw new Error('Length is required')
    if (!intake.style.length) throw new Error('At least one style is required')
    if (!intake.mood.length) throw new Error('At least one mood is required')
    if (!intake.setting.length) throw new Error('At least one setting is required')
    if (!intake.concept?.trim() || intake.concept.trim().length < 10) {
      throw new Error('Concept must be at least 10 characters')
    }
    return data
  })
  .handler(async ({ data: { projectId, intake } }) => {
    const { userId } = await auth()
    if (!userId) throw new Error('Unauthenticated')

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, projectId),
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
      ),
    })
    if (!project) throw new Error('Project not found')

    await db
      .update(projects)
      .set({ settings: intake })
      .where(eq(projects.id, projectId))
  })

// ---------------------------------------------------------------------------
// Send a chat message and get LLM response
// ---------------------------------------------------------------------------

export const sendMessage = createServerFn({ method: 'POST' })
  .inputValidator((data: { projectId: string; content: string }) => {
    const trimmed = data.content.trim()
    if (trimmed.length === 0) throw new Error('Message cannot be empty')
    if (trimmed.length > MAX_MESSAGE_LENGTH)
      throw new Error(`Message too long (max ${MAX_MESSAGE_LENGTH} characters)`)
    return { projectId: data.projectId, content: trimmed }
  })
  .handler(async ({ data: { projectId, content } }) => {
    const { userId } = await auth()
    if (!userId) throw new Error('Unauthenticated')

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, projectId),
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
      ),
    })
    if (!project) throw new Error('Project not found')

    await db.insert(messages).values({ projectId, role: 'user', content })

    const history = await db.query.messages.findMany({
      where: eq(messages.projectId, projectId),
      orderBy: asc(messages.createdAt),
    })

    const recentHistory = history.slice(-MAX_HISTORY_MESSAGES)

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    })
    if (!user?.providerKeyEnc || !user?.providerKeyDek) {
      throw new Error('No Replicate API key found. Update it in onboarding.')
    }
    const apiKey = decryptUserApiKey(user.providerKeyEnc, user.providerKeyDek)

    const intake = project.settings as IntakeAnswers | null
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

// ---------------------------------------------------------------------------
// Approve proposed scenes (transactional)
// ---------------------------------------------------------------------------

export const approveScenes = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { projectId: string; parsedScenes: { title: string; description: string }[] }) => {
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
  .handler(async ({ data: { projectId, parsedScenes } }) => {
    const { userId } = await auth()
    if (!userId) throw new Error('Unauthenticated')

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, projectId),
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
      ),
    })
    if (!project) throw new Error('Project not found')

    await db
      .update(scenes)
      .set({ deletedAt: new Date() })
      .where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)))

    await db.insert(scenes).values(
      parsedScenes.map((scene, i) => ({
        projectId,
        order: i + 1,
        title: scene.title || null,
        description: scene.description,
        stage: 'script' as const,
      })),
    )

    const summary = parsedScenes.map((s) => s.title).join(' → ')
    await db
      .update(projects)
      .set({ scriptStatus: 'done', directorPrompt: summary })
      .where(eq(projects.id, projectId))
  })

// ---------------------------------------------------------------------------
// Reset workshop — clears scenes, messages, and intake settings
// ---------------------------------------------------------------------------

export const resetWorkshop = createServerFn({ method: 'POST' })
  .inputValidator((projectId: string) => projectId)
  .handler(async ({ data: projectId }) => {
    const { userId } = await auth()
    if (!userId) throw new Error('Unauthenticated')

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, projectId),
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
      ),
    })
    if (!project) throw new Error('Project not found')

    await db
      .update(scenes)
      .set({ deletedAt: new Date() })
      .where(and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)))

    // messages table has no deletedAt column — hard delete is intentional
    await db.delete(messages).where(eq(messages.projectId, projectId))

    await db
      .update(projects)
      .set({ scriptStatus: 'idle', directorPrompt: '', scriptRaw: null, scriptJobId: null, settings: null })
      .where(eq(projects.id, projectId))
  })

// ---------------------------------------------------------------------------
// Update a single scene's title / description
// ---------------------------------------------------------------------------

export const updateScene = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { sceneId: string; title?: string | null; description?: string }) => data,
  )
  .handler(async ({ data: { sceneId, title, description } }) => {
    const { userId } = await auth()
    if (!userId) throw new Error('Unauthenticated')

    const scene = await db.query.scenes.findFirst({
      where: and(eq(scenes.id, sceneId), isNull(scenes.deletedAt)),
    })
    if (!scene) throw new Error('Scene not found')

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, scene.projectId),
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
      ),
    })
    if (!project) throw new Error('Unauthorized')

    const updates: Record<string, string | null> = {}
    if (title !== undefined) updates.title = title
    if (description !== undefined) updates.description = description

    if (Object.keys(updates).length > 0) {
      await db.update(scenes).set(updates).where(eq(scenes.id, sceneId))
    }
  })

// ---------------------------------------------------------------------------
// Regenerate a scene description via LLM
// ---------------------------------------------------------------------------

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
    const { userId } = await auth()
    if (!userId) throw new Error('Unauthenticated')

    const scene = await db.query.scenes.findFirst({
      where: and(eq(scenes.id, sceneId), isNull(scenes.deletedAt)),
    })
    if (!scene) throw new Error('Scene not found')

    const project = await db.query.projects.findFirst({
      where: and(
        eq(projects.id, scene.projectId),
        eq(projects.userId, userId),
        isNull(projects.deletedAt),
      ),
    })
    if (!project) throw new Error('Unauthorized')

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    })
    if (!user?.providerKeyEnc || !user?.providerKeyDek) {
      throw new Error('No Replicate API key found. Update it in onboarding.')
    }
    const apiKey = decryptUserApiKey(user.providerKeyEnc, user.providerKeyDek)

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
