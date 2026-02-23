import { useId, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { auth } from '@clerk/tanstack-react-start/server'
import * as Sentry from '@sentry/tanstackstart-react'
import { db } from '@/db/index'
import { users } from '@/db/schema'
import { encryptUserApiKey } from '@/lib/encryption.server'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const saveApiKey = createServerFn({ method: 'POST' })
  .inputValidator((data: { apiKey: string }) => data)
  .handler(async ({ data }) => {
    return Sentry.startSpan({ name: 'Save Replicate API key' }, async () => {
      const { userId } = await auth()
      if (!userId) throw redirect({ to: '/sign-in' })

      const { apiKey } = data
      if (!apiKey?.startsWith('r8_')) {
        throw new Error('Invalid Replicate API key — must start with r8_')
      }

      const { providerKeyEnc, providerKeyDek } = encryptUserApiKey(apiKey)

      await db
        .insert(users)
        .values({
          id: userId,
          providerKeyEnc,
          providerKeyDek,
          onboardingComplete: true,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            providerKeyEnc,
            providerKeyDek,
            onboardingComplete: true,
          },
        })

      return { ok: true }
    })
  })

export const Route = createFileRoute('/_auth/onboarding')({
  component: OnboardingPage,
})

function OnboardingPage() {
  const navigate = useNavigate()
  const apiKeyId = useId()
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsPending(true)
    try {
      await saveApiKey({ data: { apiKey } })
      navigate({ to: '/dashboard' })
    } catch (err: unknown) {
      if (err instanceof Error) setError(err.message)
    } finally {
      setIsPending(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">Welcome to SceneFrame</CardTitle>
          <CardDescription>
            Enter your Replicate API key to start generating cinematic scenes.
            Your key is encrypted and stored securely — we never see it in plain text.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={apiKeyId}>Replicate API Key</Label>
              <Input
                id={apiKeyId}
                type="password"
                placeholder="r8_••••••••••••••••••••••••••••••••••••••••"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Get your key at{' '}
                <a
                  href="https://replicate.com/account/api-tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  replicate.com/account/api-tokens
                </a>
              </p>
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save and continue'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
