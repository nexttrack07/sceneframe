import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'

const checkAuth = createServerFn().handler(async () => {
  const { userId } = await auth()
  if (!userId) {
    throw redirect({ to: '/sign-in' })
  }
  return { userId }
})

export const Route = createFileRoute('/_auth')({
  beforeLoad: () => checkAuth(),
  component: () => <Outlet />,
})
