import { useEffect, useState } from 'react'
import { createFileRoute, redirect, Link, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import * as Sentry from '@sentry/tanstackstart-react'
import { db } from '@/db/index'
import { projects, scenes } from '@/db/schema'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { ArrowLeft, Loader2, AlertCircle, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { tasks } from '@trigger.dev/sdk'
import type { generateScript } from '@/trigger/generate-script'
import type { Scene } from '@/db/schema'

// ---------------------------------------------------------------------------
// Server loader
// ---------------------------------------------------------------------------

const loadProject = createServerFn()
  .inputValidator((projectId: string) => projectId)
  .handler(async ({ data: projectId }) => {
    return Sentry.startSpan({ name: 'Load project workspace' }, async () => {
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

      return { project, scenes: projectScenes }
    })
  })

const triggerScript = createServerFn({ method: 'POST' })
  .inputValidator((projectId: string) => projectId)
  .handler(async ({ data: projectId }) => {
    return Sentry.startSpan({ name: 'Trigger generate-script' }, async () => {
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

      // Trigger first — if the API is unreachable we want to fail before mutating state
      let handle: Awaited<ReturnType<typeof tasks.trigger>>
      try {
        handle = await tasks.trigger<typeof generateScript>('generate-script', { projectId })
      } catch (err) {
        await db
          .update(projects)
          .set({ scriptStatus: 'error', scriptJobId: null })
          .where(eq(projects.id, projectId))
        throw err
      }

      // Commit state change and clear old scenes only after the job is queued
      await db.delete(scenes).where(eq(scenes.projectId, projectId))
      await db
        .update(projects)
        .set({ scriptStatus: 'generating', scriptJobId: handle.id })
        .where(eq(projects.id, projectId))
    })
  })

export const Route = createFileRoute('/_auth/projects/$projectId')({
  loader: ({ params }) => loadProject({ data: params.projectId }),
  component: ProjectPage,
})

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const STAGES = [
  { key: 'script', label: 'Script', color: 'border-indigo-400', dot: 'bg-indigo-400' },
  { key: 'images', label: 'Images', color: 'border-blue-400', dot: 'bg-blue-400' },
  { key: 'video', label: 'Video', color: 'border-violet-400', dot: 'bg-violet-400' },
  { key: 'audio', label: 'Audio', color: 'border-amber-400', dot: 'bg-amber-400' },
] as const

function ProjectPage() {
  const { project, scenes: projectScenes } = Route.useLoaderData()
  const router = useRouter()

  // Poll while script is generating
  useEffect(() => {
    if (project.scriptStatus !== 'generating') return
    const id = setInterval(() => router.invalidate(), 3000)
    return () => clearInterval(id)
  }, [project.scriptStatus, router])

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
            <p className="text-sm text-gray-500 mt-0.5 max-w-2xl line-clamp-2">
              {project.directorPrompt}
            </p>
          </div>
          <ScriptStatusBadge status={project.scriptStatus} />
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto">
        <div className="flex h-full min-w-[900px] gap-px bg-gray-200">
          {STAGES.map((stage) => (
            <KanbanColumn
              key={stage.key}
              stage={stage}
              scenes={projectScenes.filter((s) => s.stage === stage.key)}
              projectId={project.id}
              scriptStatus={stage.key === 'script' ? project.scriptStatus : 'done'}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function ScriptStatusBadge({ status }: { status: string }) {
  if (status === 'generating') {
    return (
      <Badge variant="outline" className="gap-1.5 text-amber-600 border-amber-300 bg-amber-50 shrink-0">
        <Loader2 size={11} className="animate-spin" />
        Generating script…
      </Badge>
    )
  }
  if (status === 'error') {
    return (
      <Badge variant="outline" className="gap-1.5 text-red-600 border-red-300 bg-red-50 shrink-0">
        <AlertCircle size={11} />
        Script failed
      </Badge>
    )
  }
  return null
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

type StageConfig = (typeof STAGES)[number]

function KanbanColumn({
  stage,
  scenes: columnScenes,
  projectId,
  scriptStatus,
}: {
  stage: StageConfig
  scenes: Scene[]
  projectId: string
  scriptStatus: string
}) {
  const isLoading = scriptStatus === 'generating'
  const hasError = scriptStatus === 'error'
  const isIdle = scriptStatus === 'idle'

  return (
    <div className="flex-1 bg-gray-50 flex flex-col">
      {/* Column header */}
      <div className="px-4 py-3 bg-white border-b flex items-center gap-2 shrink-0">
        <span className={`w-2 h-2 rounded-full ${stage.dot}`} />
        <span className="text-sm font-semibold text-gray-700">{stage.label}</span>
        {columnScenes.length > 0 && (
          <span className="ml-auto text-xs text-gray-400 tabular-nums">{columnScenes.length}</span>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoading && <GeneratingPlaceholders />}
        {hasError && <ErrorState projectId={projectId} />}
        {(isIdle || (!isLoading && !hasError && columnScenes.length === 0)) && stage.key === 'script' && (
          <EmptyScript projectId={projectId} />
        )}
        {columnScenes.map((scene) => (
          <SceneCard key={scene.id} scene={scene} stageColor={stage.color} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Scene card
// ---------------------------------------------------------------------------

function SceneCard({ scene, stageColor }: { scene: Scene; stageColor: string }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 border-l-4 ${stageColor} p-4 shadow-sm`}>
      {scene.title && (
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          {scene.title}
        </p>
      )}
      <p className="text-sm text-gray-800 leading-relaxed">{scene.description}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

function GeneratingPlaceholders() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-white rounded-lg border border-gray-200 border-l-4 border-l-indigo-300 p-4 animate-pulse">
          <div className="h-3 bg-gray-200 rounded w-1/3 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-full mb-1.5" />
          <div className="h-3 bg-gray-100 rounded w-4/5" />
        </div>
      ))}
      <p className="text-center text-xs text-gray-400 pt-1">
        Generating scenes with the LLM…
      </p>
    </>
  )
}

function TriggerScriptButton({
  projectId,
  label,
  variant = 'default',
}: {
  projectId: string
  label: string
  variant?: 'default' | 'outline'
}) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setIsPending(true)
    setError(null)
    try {
      await triggerScript({ data: projectId })
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <Button size="sm" variant={variant} disabled={isPending} onClick={handleClick}>
        {isPending ? <Loader2 size={13} className="animate-spin mr-1.5" /> : <Wand2 size={13} className="mr-1.5" />}
        {isPending ? 'Starting…' : label}
      </Button>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

function ErrorState({ projectId }: { projectId: string }) {
  return (
    <div className="bg-red-50 rounded-lg border border-red-200 p-4 text-center">
      <AlertCircle size={20} className="text-red-400 mx-auto mb-2" />
      <p className="text-sm font-medium text-red-700">Script generation failed</p>
      <p className="text-xs text-red-500 mt-0.5">Check your Replicate API key or try again.</p>
      <div className="mt-3">
        <TriggerScriptButton projectId={projectId} label="Retry" variant="outline" />
      </div>
    </div>
  )
}

function EmptyScript({ projectId }: { projectId: string }) {
  return (
    <div className="flex flex-col items-center text-center py-8 gap-3">
      <p className="text-xs text-gray-400">No scenes yet.</p>
      <TriggerScriptButton projectId={projectId} label="Generate Script" />
    </div>
  )
}
