import { useEffect, useId, useRef, useState } from 'react'
import { createFileRoute, redirect, Link, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import { db } from '@/db/index'
import { projects, scenes, messages } from '@/db/schema'
import { and, asc, eq, isNull } from 'drizzle-orm'
import {
  ArrowLeft,
  Loader2,
  Send,
  Check,
  ChevronRight,
  Film,
  Image as ImageIcon,
  Video,
  Music,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import Replicate from 'replicate'
import type { Scene, Message } from '@/db/schema'
import { users } from '@/db/schema'
import { decryptUserApiKey } from '@/lib/encryption.server'

// ---------------------------------------------------------------------------
// Server functions
// ---------------------------------------------------------------------------

const loadProject = createServerFn()
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

    const projectScenes = await db.query.scenes.findMany({
      where: and(eq(scenes.projectId, projectId), isNull(scenes.deletedAt)),
      orderBy: asc(scenes.order),
    })

    const projectMessages = await db.query.messages.findMany({
      where: eq(messages.projectId, projectId),
      orderBy: asc(messages.createdAt),
    })

    return {
      project: { ...project, settings: (project.settings ?? {}) as Record<string, never> },
      scenes: projectScenes,
      messages: projectMessages,
    }
  })

const sendMessage = createServerFn({ method: 'POST' })
  .inputValidator((data: { projectId: string; content: string }) => data)
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

    // Save user message
    await db.insert(messages).values({ projectId, role: 'user', content })

    // Load full conversation history
    const history = await db.query.messages.findMany({
      where: eq(messages.projectId, projectId),
      orderBy: asc(messages.createdAt),
    })

    // Get user's Replicate API key
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    })
    if (!user?.providerKeyEnc || !user?.providerKeyDek) {
      throw new Error('No Replicate API key found. Update it in onboarding.')
    }
    const apiKey = decryptUserApiKey(user.providerKeyEnc, user.providerKeyDek)

    const systemPrompt = `You are a creative director helping a user develop scenes for a short video project called "${project.name}".

Your job is to understand what the user wants and help them craft 3-5 distinct visual scenes.

CONVERSATION RULES:
- If the user hasn't described their concept yet, ask what the video is about.
- Ask clarifying questions about mood, tone, audience, and visual style — but keep it conversational, not interrogative. One or two questions at a time.
- When you have enough context, propose a scene breakdown.
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

    // Build messages for the LLM
    const llmMessages = history.map((m) =>
      m.role === 'user' ? `User: ${m.content}` : `Assistant: ${m.content}`,
    )
    const prompt = `${systemPrompt}\n\n${llmMessages.join('\n\n')}`

    // Call Claude via Replicate streaming
    const replicate = new Replicate({ auth: apiKey })
    const chunks: string[] = []
    for await (const event of replicate.stream('anthropic/claude-4.5-haiku', {
      input: {
        prompt,
        max_tokens: 2048,
        temperature: 0.7,
      },
    })) {
      chunks.push(String(event))
    }
    const assistantContent = chunks.join('')

    // Save assistant message
    await db.insert(messages).values({ projectId, role: 'assistant', content: assistantContent })

    return { content: assistantContent }
  })

const approveScenes = createServerFn({ method: 'POST' })
  .inputValidator((data: { projectId: string; parsedScenes: { title: string; description: string }[] }) => data)
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

    // Delete any existing scenes
    await db.delete(scenes).where(eq(scenes.projectId, projectId))

    // Insert approved scenes
    await db.insert(scenes).values(
      parsedScenes.map((scene, i) => ({
        projectId,
        order: (i + 1) * 1.0,
        title: scene.title || null,
        description: scene.description,
        stage: 'script' as const,
      })),
    )

    // Build a summary from the scenes for directorPrompt
    const summary = parsedScenes.map((s) => s.title).join(' → ')
    await db
      .update(projects)
      .set({ scriptStatus: 'done', directorPrompt: summary })
      .where(eq(projects.id, projectId))
  })

const resetWorkshop = createServerFn({ method: 'POST' })
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

    await db.delete(scenes).where(eq(scenes.projectId, projectId))
    await db.delete(messages).where(eq(messages.projectId, projectId))
    await db
      .update(projects)
      .set({ scriptStatus: 'idle', directorPrompt: '', scriptRaw: null, scriptJobId: null })
      .where(eq(projects.id, projectId))
  })

const updateScene = createServerFn({ method: 'POST' })
  .inputValidator((data: { sceneId: string; title?: string; description?: string }) => data)
  .handler(async ({ data: { sceneId, title, description } }) => {
    const { userId } = await auth()
    if (!userId) throw new Error('Unauthenticated')

    const scene = await db.query.scenes.findFirst({
      where: and(eq(scenes.id, sceneId), isNull(scenes.deletedAt)),
    })
    if (!scene) throw new Error('Scene not found')

    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, scene.projectId), eq(projects.userId, userId)),
    })
    if (!project) throw new Error('Unauthorized')

    const updates: Record<string, string> = {}
    if (title !== undefined) updates.title = title
    if (description !== undefined) updates.description = description

    if (Object.keys(updates).length > 0) {
      await db.update(scenes).set(updates).where(eq(scenes.id, sceneId))
    }
  })

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/_auth/projects/$projectId')({
  loader: ({ params }) => loadProject({ data: params.projectId }),
  component: ProjectPage,
})

// ---------------------------------------------------------------------------
// Page — switches between Workshop and Storyboard
// ---------------------------------------------------------------------------

function ProjectPage() {
  const { project, scenes: projectScenes, messages: projectMessages } = Route.useLoaderData()

  const isWorkshopPhase = project.scriptStatus !== 'done'

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <div className="px-6 py-4 border-b bg-white shrink-0">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-2 transition-colors"
        >
          <ArrowLeft size={14} />
          All projects
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
            {!isWorkshopPhase && projectScenes.length > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                {projectScenes.length} scene{projectScenes.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          {isWorkshopPhase ? (
            <Badge variant="outline" className="gap-1.5 text-indigo-600 border-indigo-300 bg-indigo-50 shrink-0">
              <Film size={11} />
              Script Workshop
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1.5 text-emerald-600 border-emerald-300 bg-emerald-50 shrink-0">
              <Check size={11} />
              Script approved
            </Badge>
          )}
        </div>
      </div>

      {/* Content */}
      {isWorkshopPhase ? (
        <ScriptWorkshop
          projectId={project.id}
          existingMessages={projectMessages}
        />
      ) : (
        <Storyboard
          projectId={project.id}
          scenes={projectScenes}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Script Workshop (Intake + Chat)
// ---------------------------------------------------------------------------

function parseSceneProposal(content: string): { title: string; description: string }[] | null {
  const match = content.match(/```scenes\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1])
    if (!Array.isArray(parsed) || parsed.length < 1) return null
    return parsed.map((s: { title?: string; description?: string }) => ({
      title: String(s.title ?? '').trim(),
      description: String(s.description ?? '').trim(),
    })).filter((s: { description: string }) => s.description.length > 0)
  } catch {
    return null
  }
}

function ScriptWorkshop({
  projectId,
  existingMessages,
}: {
  projectId: string
  existingMessages: Message[]
}) {
  const router = useRouter()
  const [chatMessages, setChatMessages] = useState<Message[]>(existingMessages)
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const messageCount = chatMessages.length
  useEffect(() => {
    if (messageCount > 0) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messageCount])

  // Find the last scene proposal in the conversation
  let lastProposal: { title: string; description: string }[] | null = null
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i].role === 'assistant') {
      const parsed = parseSceneProposal(chatMessages[i].content)
      if (parsed && parsed.length >= 1) {
        lastProposal = parsed
        break
      }
    }
  }

  async function handleSend() {
    if (!input.trim() || isSending) return
    setError(null)

    const userMsg: Message = {
      id: crypto.randomUUID(),
      projectId,
      role: 'user',
      content: input.trim(),
      createdAt: new Date(),
    }
    setChatMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsSending(true)

    try {
      const result = await sendMessage({ data: { projectId, content: userMsg.content } })
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        projectId,
        role: 'assistant',
        content: result.content,
        createdAt: new Date(),
      }
      setChatMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get response')
    } finally {
      setIsSending(false)
    }
  }

  async function handleApprove() {
    if (!lastProposal || isApproving) return
    setIsApproving(true)
    try {
      await approveScenes({ data: { projectId, parsedScenes: lastProposal } })
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve scenes')
    } finally {
      setIsApproving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {chatMessages.length === 0 && (
          <div className="text-center py-12">
            <Film size={32} className="text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Welcome to the Script Workshop</p>
            <p className="text-sm text-gray-400 mt-1 max-w-md mx-auto">
              Describe your video concept and I'll help you develop it into a set of scenes.
              Start with the big idea — we'll refine it together.
            </p>
          </div>
        )}

        {chatMessages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {isSending && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
              <Film size={13} className="text-indigo-600" />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-md px-4 py-3">
              <Loader2 size={16} className="animate-spin text-gray-400" />
            </div>
          </div>
        )}
      </div>

      {/* Approve bar */}
      {lastProposal && !isSending && (
        <div className="px-6 py-3 border-t bg-indigo-50 flex items-center justify-between">
          <p className="text-sm text-indigo-700">
            <strong>{lastProposal.length} scenes</strong> proposed. Happy with this breakdown?
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setInput('Can you adjust...')}
              disabled={isApproving}
            >
              Request changes
            </Button>
            <Button
              size="sm"
              onClick={handleApprove}
              disabled={isApproving}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {isApproving ? (
                <Loader2 size={13} className="animate-spin mr-1.5" />
              ) : (
                <Check size={13} className="mr-1.5" />
              )}
              {isApproving ? 'Approving…' : 'Approve script'}
            </Button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 border-t bg-white">
        {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={chatMessages.length === 0
              ? "Describe your video concept..."
              : "Type a message..."
            }
            rows={2}
            className="resize-none flex-1"
            disabled={isSending}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="shrink-0 self-end"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat bubble
// ---------------------------------------------------------------------------

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  // Strip scene JSON block from display, show as cards instead
  const sceneProposal = !isUser ? parseSceneProposal(message.content) : null
  const displayText = !isUser
    ? message.content.replace(/```scenes\s*[\s\S]*?```/, '').trim()
    : message.content

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
        isUser ? 'bg-gray-200' : 'bg-indigo-100'
      }`}>
        {isUser ? (
          <span className="text-xs font-semibold text-gray-600">You</span>
        ) : (
          <Film size={13} className="text-indigo-600" />
        )}
      </div>
      <div className={`max-w-[75%] space-y-3`}>
        {displayText && (
          <div className={`rounded-2xl px-4 py-3 ${
            isUser
              ? 'bg-gray-900 text-white rounded-tr-md'
              : 'bg-gray-100 text-gray-800 rounded-tl-md'
          }`}>
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{displayText}</p>
          </div>
        )}
        {sceneProposal && (
          <div className="space-y-2">
            {sceneProposal.map((scene, i) => (
              <div key={`${scene.title}-${scene.description.slice(0, 30)}`} className="bg-white border border-indigo-200 rounded-lg p-3 shadow-sm">
                <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">
                  Scene {i + 1}{scene.title ? `: ${scene.title}` : ''}
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">{scene.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Storyboard View
// ---------------------------------------------------------------------------

function Storyboard({
  projectId,
  scenes: storyScenes,
}: {
  projectId: string
  scenes: Scene[]
}) {
  const router = useRouter()
  const [isResetting, setIsResetting] = useState(false)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)

  const selectedScene = storyScenes.find((s) => s.id === selectedSceneId) ?? null

  async function handleReset() {
    if (!confirm('This will clear all scenes and chat history. Start over?')) return
    setIsResetting(true)
    try {
      await resetWorkshop({ data: projectId })
      router.invalidate()
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* Scene list */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Storyboard</h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleReset}
            disabled={isResetting}
            className="text-gray-400 hover:text-red-600"
          >
            <RotateCcw size={13} className="mr-1.5" />
            {isResetting ? 'Resetting…' : 'Redo script'}
          </Button>
        </div>

        <div className="grid gap-3">
          {storyScenes.map((scene, i) => (
            <StoryboardCard
              key={scene.id}
              scene={scene}
              index={i}
              isSelected={scene.id === selectedSceneId}
              onSelect={() => setSelectedSceneId(scene.id === selectedSceneId ? null : scene.id)}
            />
          ))}
        </div>
      </div>

      {/* Scene detail panel */}
      {selectedScene && (
        <SceneDetailPanel
          scene={selectedScene}
          onClose={() => setSelectedSceneId(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Storyboard card
// ---------------------------------------------------------------------------

const PIPELINE_STAGES = [
  { key: 'script', label: 'Script', icon: Film },
  { key: 'images', label: 'Images', icon: ImageIcon },
  { key: 'video', label: 'Video', icon: Video },
  { key: 'audio', label: 'Audio', icon: Music },
] as const

function StoryboardCard({
  scene,
  index,
  isSelected,
  onSelect,
}: {
  scene: Scene
  index: number
  isSelected: boolean
  onSelect: () => void
}) {
  const currentStageIndex = PIPELINE_STAGES.findIndex((s) => s.key === scene.stage)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left bg-white rounded-xl border-2 p-4 transition-all hover:shadow-md ${
        isSelected ? 'border-indigo-400 shadow-md' : 'border-gray-200 hover:border-gray-300'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Scene number */}
        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-gray-500">{index + 1}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {scene.title && (
            <p className="font-semibold text-gray-900 text-sm mb-0.5">{scene.title}</p>
          )}
          <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">{scene.description}</p>

          {/* Pipeline progress */}
          <div className="flex items-center gap-3 mt-3">
            {PIPELINE_STAGES.map((stage, i) => {
              const isDone = i <= currentStageIndex
              const Icon = stage.icon
              return (
                <div key={stage.key} className="flex items-center gap-1">
                  <Icon size={12} className={isDone ? 'text-indigo-500' : 'text-gray-300'} />
                  <span className={`text-xs ${isDone ? 'text-indigo-600 font-medium' : 'text-gray-400'}`}>
                    {stage.label}
                  </span>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <ChevronRight size={10} className="text-gray-300 ml-1" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Scene Detail Panel (slide-over)
// ---------------------------------------------------------------------------

function SceneDetailPanel({
  scene,
  onClose,
}: {
  scene: Scene
  onClose: () => void
}) {
  const router = useRouter()
  const id = useId()
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`
  const [title, setTitle] = useState(scene.title ?? '')
  const [description, setDescription] = useState(scene.description)
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)

  useEffect(() => {
    setTitle(scene.title ?? '')
    setDescription(scene.description)
    setIsDirty(false)
  }, [scene.title, scene.description])

  function handleTitleChange(val: string) {
    setTitle(val)
    setIsDirty(true)
  }

  function handleDescriptionChange(val: string) {
    setDescription(val)
    setIsDirty(true)
  }

  async function handleSave() {
    if (!isDirty) return
    setIsSaving(true)
    try {
      await updateScene({ data: { sceneId: scene.id, title: title || undefined, description } })
      setIsDirty(false)
      router.invalidate()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="w-[400px] border-l bg-white flex flex-col shrink-0">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Scene Details</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          ✕
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Title */}
        <div className="space-y-1.5">
          <label htmlFor={titleId} className="text-xs font-medium text-gray-500 uppercase tracking-wide">Title</label>
          <input
            id={titleId}
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Scene title"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label htmlFor={descriptionId} className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</label>
          <textarea
            id={descriptionId}
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent leading-relaxed"
            placeholder="Visual description for this scene..."
          />
        </div>

        {isDirty && (
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 size={13} className="animate-spin mr-1.5" /> : null}
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        )}

        {/* Asset sections (placeholders for future epics) */}
        <div className="pt-4 border-t space-y-4">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Assets</h4>

          <AssetSection
            icon={ImageIcon}
            label="Images"
            status="pending"
            description="Generate start and end frame images from this scene description."
          />
          <AssetSection
            icon={Video}
            label="Video"
            status="locked"
            description="Generate video requires images first."
          />
          <AssetSection
            icon={Music}
            label="Audio"
            status="locked"
            description="Generate audio for this scene."
          />
        </div>
      </div>
    </div>
  )
}

function AssetSection({
  icon: Icon,
  label,
  status,
  description,
}: {
  icon: typeof Film
  label: string
  status: 'pending' | 'generating' | 'done' | 'locked'
  description: string
}) {
  return (
    <div className={`rounded-lg border p-3 ${status === 'locked' ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-gray-500" />
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <Badge variant="outline" className="ml-auto text-xs">
          {status === 'locked' ? 'Needs prior stage' : status === 'pending' ? 'Ready' : status}
        </Badge>
      </div>
      <p className="text-xs text-gray-400">{description}</p>
      {status === 'pending' && (
        <Button size="sm" variant="outline" className="mt-2 w-full" disabled>
          Generate {label} (coming soon)
        </Button>
      )}
    </div>
  )
}
