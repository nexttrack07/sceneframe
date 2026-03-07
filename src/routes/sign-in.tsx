import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '@clerk/tanstack-react-start'

export const Route = createFileRoute('/sign-in')({
  component: SignInPage,
})

function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted">
      <SignIn routing="path" path="/sign-in" forceRedirectUrl="/dashboard" />
    </div>
  )
}
