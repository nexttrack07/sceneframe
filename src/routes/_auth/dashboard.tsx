import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import * as Sentry from '@sentry/tanstackstart-react'
import { db } from '@/db/index'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

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

    return { userId }
  })
})

export const Route = createFileRoute('/_auth/dashboard')({
  loader: () => loadDashboard(),
  component: DashboardPage,
})

function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-500">Your projects will appear here. (Epic 4)</p>
      </div>
    </div>
  )
}
