import { createFileRoute, redirect, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import * as Sentry from '@sentry/tanstackstart-react'
import { db } from '@/db/index'
import { projects } from '@/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { ArrowLeft } from 'lucide-react'

const loadProject = createServerFn()
  .inputValidator((projectId: string) => projectId)
  .handler(async ({ data: projectId }) => {
    return Sentry.startSpan({ name: 'Load project' }, async () => {
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

      return { project }
    })
  })

export const Route = createFileRoute('/_auth/projects/$projectId')({
  loader: ({ params }) => loadProject({ data: params.projectId }),
  component: ProjectPage,
})

function ProjectPage() {
  const { project } = Route.useLoaderData()

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft size={15} />
        All projects
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
        <p className="text-sm text-gray-500 mt-1 max-w-2xl">{project.directorPrompt}</p>
      </div>

      <div className="rounded-xl border border-dashed border-gray-300 bg-white flex items-center justify-center py-24 text-center">
        <div>
          <p className="text-sm font-medium text-gray-500">Scene workspace coming in Epic 5</p>
          <p className="text-xs text-gray-400 mt-1">
            The 4-column Kanban board (Script → Images → Video → Audio) will be built here.
          </p>
        </div>
      </div>
    </div>
  )
}
