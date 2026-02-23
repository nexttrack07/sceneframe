import { createFileRoute } from '@tanstack/react-router'
import { SignIn } from '@clerk/tanstack-react-start'

// Catch-all for Clerk sub-routes: /sign-in/sso-callback, /sign-in/factor-one, etc.
export const Route = createFileRoute('/sign-in/$')({
  component: SignInPage,
})

function SignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <SignIn routing="path" path="/sign-in" />
    </div>
  )
}
