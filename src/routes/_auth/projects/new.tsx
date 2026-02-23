import { useId, useState } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import * as Sentry from '@sentry/tanstackstart-react'
import { db } from '@/db/index'
import { projects } from '@/db/schema'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft } from 'lucide-react'

const createProject = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; directorPrompt: string }) => data)
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: 'Create project' }, async () => {
      const { userId } = await auth()
      if (!userId) throw new Error('Unauthenticated')

      const { name, directorPrompt } = data
      if (!name.trim()) throw new Error('Project name is required')
      if (!directorPrompt.trim()) throw new Error('Director Prompt is required')

      const [project] = await db
        .insert(projects)
        .values({
          userId,
          name: name.trim(),
          directorPrompt: directorPrompt.trim(),
          scriptStatus: 'idle',
        })
        .returning({ id: projects.id })

      // generate-script job will be wired in Epic 5
      // tasks.trigger('generate-script', { projectId: project.id, userId })

      return { projectId: project.id }
    })
  })

export const Route = createFileRoute('/_auth/projects/new')({
  component: NewProjectPage,
})

function NewProjectPage() {
  const navigate = useNavigate()
  const nameId = useId()
  const promptId = useId()
  const [name, setName] = useState('')
  const [directorPrompt, setDirectorPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsPending(true)
    try {
      const { projectId } = await createProject({ data: { name, directorPrompt } })
      navigate({ to: '/projects/$projectId', params: { projectId } })
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
      >
        <ArrowLeft size={15} />
        Back to projects
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">New Project</h1>
        <p className="text-sm text-gray-500 mt-1">
          Give your project a name and write a Director Prompt — the creative brief that guides
          the entire scene pipeline.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor={nameId}>Project name</Label>
          <Input
            id={nameId}
            placeholder="e.g. Tokyo Night Drive"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={promptId}>Director Prompt</Label>
          <Textarea
            id={promptId}
            placeholder={
              'Describe your video concept in detail. The AI will break this into 3–5 scenes.\n\n' +
              'Example: "A cinematic drive through neon-lit Tokyo streets at night. Rain-slicked roads, ' +
              'reflections in puddles, tight alleyways opening into wide intersections. ' +
              'The mood is tense, solitary, and beautiful."'
            }
            value={directorPrompt}
            onChange={(e) => setDirectorPrompt(e.target.value)}
            required
            rows={7}
            className="resize-none"
          />
          <p className="text-xs text-gray-400">
            The more specific and visual your prompt, the better the scene descriptions.
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex items-center gap-3 pt-2">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Creating…' : 'Create project'}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link to="/dashboard">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  )
}
