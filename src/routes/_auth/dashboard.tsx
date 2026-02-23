import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import * as Sentry from '@sentry/tanstackstart-react'
import { db } from '@/db/index'
import { users } from '@/db/schema'
import type { Project } from '@/db/schema'
import { eq, isNull, desc } from 'drizzle-orm'
import { Button } from '@/components/ui/button'
import { Plus, Film, Clock } from 'lucide-react'

const loadDashboard = createServerFn().handler(async () => {
  return Sentry.startSpan({ name: 'Load dashboard' }, async () => {
    const { userId } = await auth()
    if (!userId) throw redirect({ to: '/sign-in' })

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    })

    if (!user?.onboardingComplete) {
      throw redirect({ to: '/onboarding' })
    }

    const userProjects = await db.query.projects.findMany({
      where: (p) => eq(p.userId, userId) && isNull(p.deletedAt),
      orderBy: (p) => desc(p.createdAt),
    })

    return { projects: userProjects }
  })
})

export const Route = createFileRoute('/_auth/dashboard')({
  loader: () => loadDashboard(),
  component: DashboardPage,
})

function DashboardPage() {
  const { projects: userProjects } = Route.useLoaderData()

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Each project is a Director Prompt and its generated scene pipeline.
          </p>
        </div>
        <Button asChild>
          <Link to="/projects/new">
            <Plus size={16} className="mr-1.5" />
            New Project
          </Link>
        </Button>
      </div>

      {userProjects.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {userProjects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-14 h-14 rounded-full bg-indigo-50 flex items-center justify-center mb-4">
        <Film size={24} className="text-indigo-500" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-1">No projects yet</h2>
      <p className="text-sm text-gray-500 max-w-xs mb-6">
        Create your first project by writing a Director Prompt — a short concept for your video.
      </p>
      <Button asChild>
        <Link to="/projects/new">
          <Plus size={16} className="mr-1.5" />
          New Project
        </Link>
      </Button>
    </div>
  )
}

function ProjectCard({ project }: { project: Project }) {
  const created = new Date(project.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const statusLabel: Record<string, string> = {
    idle: 'Draft',
    generating: 'Generating…',
    done: 'Ready',
    error: 'Error',
  }

  const statusColor: Record<string, string> = {
    idle: 'bg-gray-100 text-gray-500',
    generating: 'bg-amber-100 text-amber-700',
    done: 'bg-green-100 text-green-700',
    error: 'bg-red-100 text-red-600',
  }

  return (
    <Link
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      className="group block bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
          {project.name}
        </h3>
        <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${statusColor[project.scriptStatus] ?? statusColor.idle}`}>
          {statusLabel[project.scriptStatus] ?? 'Draft'}
        </span>
      </div>
      <p className="text-sm text-gray-500 line-clamp-2 mb-4">{project.directorPrompt}</p>
      <div className="flex items-center gap-1 text-xs text-gray-400">
        <Clock size={12} />
        <span>{created}</span>
      </div>
    </Link>
  )
}
