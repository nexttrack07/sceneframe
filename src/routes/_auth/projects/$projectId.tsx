import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowLeft, Check, Film, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { loadProject } from '@/features/projects/project-actions'
import type { ScenePlanEntry } from '@/features/projects/project-actions'
import { ScriptWorkshop } from '@/features/projects/components/script-workshop'
import { Storyboard } from '@/features/projects/components/storyboard'

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export const Route = createFileRoute('/_auth/projects/$projectId')({
  loader: ({ params }) => loadProject({ data: params.projectId }),
  component: ProjectPage,
  pendingComponent: ProjectPending,
  errorComponent: ProjectError,
})

// ---------------------------------------------------------------------------
// Page — switches between Workshop and Storyboard
// ---------------------------------------------------------------------------

function ProjectPage() {
  const { project, scenes: projectScenes, messages: projectMessages } = Route.useLoaderData()
  const scenePlan: ScenePlanEntry[] = (() => {
    if (!project.scriptRaw) return []
    try {
      return JSON.parse(project.scriptRaw) as ScenePlanEntry[]
    } catch {
      return []
    }
  })()

  const isWorkshopPhase = project.scriptStatus !== 'done'

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <ProjectHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
            {!isWorkshopPhase && projectScenes.length > 0 && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {projectScenes.length} scene{projectScenes.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
          {isWorkshopPhase ? (
            <Badge
              variant="outline"
              className="gap-1.5 text-primary border-primary/40 bg-primary/10 shrink-0"
            >
              <Film size={11} />
              Script Workshop
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="gap-1.5 text-success border-success/40 bg-success/10 shrink-0"
            >
              <Check size={11} />
              Script approved
            </Badge>
          )}
        </div>
      </ProjectHeader>

      {/* Content — key on ScriptWorkshop ensures fresh state if loader re-runs */}
      {isWorkshopPhase ? (
        <ScriptWorkshop
          key={project.id}
          projectId={project.id}
          existingMessages={projectMessages}
          projectSettings={project.settings}
        />
      ) : (
        <Storyboard
          projectId={project.id}
          scenes={projectScenes}
          projectSettings={project.settings}
          scenePlan={scenePlan}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared header
// ---------------------------------------------------------------------------

function ProjectHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div className="px-6 py-4 border-b bg-card shrink-0">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2 transition-colors"
      >
        <ArrowLeft size={14} />
        All projects
      </Link>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Pending / Error states
// ---------------------------------------------------------------------------

function ProjectPending() {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <ProjectHeader>
        <div className="h-6 w-48 bg-muted rounded animate-pulse mt-1" />
      </ProjectHeader>
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    </div>
  )
}

function ProjectError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      <ProjectHeader />
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-sm text-destructive text-center max-w-md">
          {error.message || 'Something went wrong loading this project.'}
        </p>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={reset}>
            Try again
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
