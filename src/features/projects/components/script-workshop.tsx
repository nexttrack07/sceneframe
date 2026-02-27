import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Loader2, Send, Check, Film, Pencil, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import type { Message } from '@/db/schema'
import {
  sendMessage,
  approveScenes,
  saveIntake,
  resetWorkshop,
  setHookConfirmed,
} from '../project-actions'
import type {
  IntakeAnswers,
  ProjectSettings,
  ScenePlanEntry,
} from '../project-actions'
import { IntakeForm } from './intake-form'

export function parseSceneProposal(
  content: string,
): ScenePlanEntry[] | null {
  const match = content.match(/```scenes\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1])
    if (!Array.isArray(parsed) || parsed.length < 1) return null
    return parsed
      .map((s: {
        title?: string
        description?: string
        durationSec?: number
        beat?: string
        hookRole?: 'hook' | 'body' | 'cta'
      }) => ({
        title: String(s.title ?? '').trim(),
        description: String(s.description ?? '').trim(),
        durationSec: Number.isFinite(s.durationSec) ? Number(s.durationSec) : undefined,
        beat: typeof s.beat === 'string' ? s.beat : undefined,
        hookRole: s.hookRole,
      }))
      .filter((s: { description: string }) => s.description.length > 0)
  } catch {
    return null
  }
}

function composeBrief(intake: IntakeAnswers): string {
  const parts: string[] = []
  parts.push(
    `Channel preset: ${intake.channelPreset}. I'd like to create a ${intake.length.toLowerCase()} ${intake.style.join(', ').toLowerCase()} video`,
  )
  if (intake.purpose) parts[0] += ` for ${intake.purpose.toLowerCase()}`
  parts[0] += '.'

  if (intake.mood.length > 0) {
    parts.push(`The mood should be ${intake.mood.join(', ').toLowerCase()}.`)
  }
  if (intake.setting.length > 0) {
    parts.push(`Setting: ${intake.setting.join(', ').toLowerCase()}.`)
  }
  parts.push(`Audience: ${intake.audience}.`)
  parts.push(`Desired viewer action: ${intake.viewerAction}.`)
  if (intake.workingTitle?.trim()) parts.push(`Working title: ${intake.workingTitle.trim()}.`)
  if (intake.thumbnailPromise?.trim())
    parts.push(`Thumbnail promise: ${intake.thumbnailPromise.trim()}.`)
  parts.push(`Here's my concept: ${intake.concept}`)
  return parts.join(' ')
}

function targetDurationRange(length: string): { min: number; max: number } | null {
  const map: Record<string, { min: number; max: number }> = {
    '15 seconds': { min: 12, max: 18 },
    '30 seconds': { min: 24, max: 36 },
    '1 minute': { min: 50, max: 70 },
    '2-3 minutes': { min: 120, max: 190 },
    '5+ minutes': { min: 280, max: 520 },
  }
  return map[length] ?? null
}

function estimateDuration(scene: ScenePlanEntry): number {
  if (scene.durationSec && Number.isFinite(scene.durationSec)) return Math.max(2, scene.durationSec)
  const words = scene.description.trim().split(/\s+/).length
  return Math.max(3, Math.min(18, Math.round(words / 3)))
}

export function ScriptWorkshop({
  projectId,
  existingMessages,
  projectSettings,
}: {
  projectId: string
  existingMessages: Message[]
  projectSettings: ProjectSettings | null
}) {
  const router = useRouter()
  const [chatMessages, setChatMessages] = useState<Message[]>(existingMessages)
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const intake = projectSettings?.intake ?? null
  const intakeComplete = Boolean(intake?.concept)
  const [showIntake, setShowIntake] = useState(!intakeComplete)
  const [hookConfirmed, setHookConfirmedState] = useState(Boolean(projectSettings?.hookConfirmed))

  const messageCount = chatMessages.length
  useEffect(() => {
    if (messageCount > 0) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messageCount])

  const lastProposal = useMemo(() => {
    for (let i = chatMessages.length - 1; i >= 0; i--) {
      if (chatMessages[i].role === 'assistant') {
        const parsed = parseSceneProposal(chatMessages[i].content)
        if (parsed && parsed.length >= 1) return parsed
      }
    }
    return null
  }, [chatMessages])
  const totalDurationSec = useMemo(
    () => (lastProposal ? lastProposal.reduce((sum, s) => sum + estimateDuration(s), 0) : 0),
    [lastProposal],
  )
  const targetRange = useMemo(() => (intake ? targetDurationRange(intake.length) : null), [intake])

  const doSendMessage = useCallback(
    async (content: string) => {
      const userMsg: Message = {
        id: crypto.randomUUID(),
        projectId,
        role: 'user',
        content,
        createdAt: new Date(),
      }
      setChatMessages((prev) => [...prev, userMsg])
      setIsSending(true)
      setError(null)

      try {
        const result = await sendMessage({ data: { projectId, content } })
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          projectId,
          role: 'assistant',
          content: result.content,
          createdAt: new Date(),
        }
        setChatMessages((prev) => [...prev, assistantMsg])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get response')
      } finally {
        setIsSending(false)
      }
    },
    [projectId],
  )

  async function handleSend() {
    if (!input.trim() || isSending) return
    const content = input.trim()
    setInput('')
    await doSendMessage(content)
  }

  async function handleConfirmHook() {
    try {
      await setHookConfirmed({ data: { projectId, confirmed: true } })
      setHookConfirmedState(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm hook')
    }
  }

  const handleIntakeComplete = useCallback(
    async (intake: IntakeAnswers) => {
      setError(null)
      await saveIntake({ data: { projectId, intake } })
      setHookConfirmedState(false)
      setShowIntake(false)
      const brief = composeBrief(intake)
      await doSendMessage(brief)
    },
    [projectId, doSendMessage],
  )

  async function handleEditBrief() {
    setError(null)
    try {
      await resetWorkshop({ data: projectId })
      setChatMessages([])
      setShowIntake(true)
      setHookConfirmedState(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart brief and chat')
    }
  }

  async function handleApprove() {
    if (!lastProposal || isApproving) return
    setIsApproving(true)
    try {
      await approveScenes({ data: { projectId, parsedScenes: lastProposal } })
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve scenes')
    } finally {
      setIsApproving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (showIntake) {
    return (
      <IntakeForm
        onComplete={handleIntakeComplete}
        error={error}
        onDismissError={() => setError(null)}
      />
    )
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Chat header with Edit Creative Brief */}
      {intakeComplete && chatMessages.length > 0 && (
        <div className="px-6 py-2 border-b bg-card flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-xs text-muted-foreground">Script Chat</p>
            {intake?.audience && <Badge variant="outline">Audience: {intake.audience}</Badge>}
            {intake?.viewerAction && <Badge variant="outline">Goal: {intake.viewerAction}</Badge>}
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Pencil size={12} />
                Edit Creative Brief
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Re-do Creative Brief?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will clear your current Script Chat and scenes so you can start fresh with a
                  new Creative Brief.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleEditBrief}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Reset &amp; re-do
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {chatMessages.length === 0 && (
          <div className="text-center py-12">
            <Film size={32} className="text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Welcome to Script Chat</p>
            <p className="text-sm text-muted-foreground/70 mt-1 max-w-md mx-auto">
              Describe your video concept and I&apos;ll help you develop it into a set of scenes.
              Start with the big idea — we&apos;ll refine it together.
            </p>
          </div>
        )}

        {chatMessages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}

        {isSending && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Film size={13} className="text-primary" />
            </div>
            <div className="bg-muted rounded-2xl rounded-tl-md px-4 py-3">
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Approve bar */}
      {lastProposal && !isSending && (
        <div className="border-t bg-primary/10">
          {!hookConfirmed && (
            <div className="px-6 pt-3">
              <div className="rounded-lg border border-warning/40 bg-warning/15 p-3 flex items-center justify-between gap-3">
                <p className="text-xs text-warning">
                  Confirm the opening hook before approving scenes.
                </p>
                <Button size="sm" onClick={handleConfirmHook}>
                  Hook confirmed
                </Button>
              </div>
            </div>
          )}
          {targetRange && (
            <div className="px-6 pt-3">
              <div className="rounded-lg border border-border bg-card p-2.5 flex items-center gap-2 text-xs text-muted-foreground">
                <Timer size={13} />
                <span>
                  Estimated runtime: <strong className="text-foreground">{totalDurationSec}s</strong>{' '}
                  (target {targetRange.min}-{targetRange.max}s)
                </span>
              </div>
            </div>
          )}
          <div className="px-6 py-3 flex items-center justify-between">
            <p className="text-sm text-primary">
              <strong>{lastProposal.length} scenes</strong> proposed. Happy with this breakdown?
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setInput('Can you adjust...')
                  setTimeout(() => textareaRef.current?.focus(), 0)
                }}
                disabled={isApproving}
              >
                Request changes
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isApproving || !hookConfirmed}
                className="bg-primary hover:bg-primary/90"
              >
                {isApproving ? (
                  <Loader2 size={13} className="animate-spin mr-1.5" />
                ) : (
                  <Check size={13} className="mr-1.5" />
                )}
                {isApproving ? 'Approving…' : 'Approve script'}
              </Button>
            </div>
          </div>
          <p className="px-6 pb-3 text-xs text-muted-foreground">
            Don&apos;t worry — you can still edit and refine each scene individually after approving.
          </p>
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 border-t bg-card">
        {error && (
          <div className="flex items-center gap-2 mb-2 text-xs text-destructive">
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-destructive/50 hover:text-destructive"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={2}
            className="resize-none flex-1"
            disabled={isSending}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="shrink-0 self-end"
          >
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Chat bubble
// ---------------------------------------------------------------------------

function ChatBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'

  const sceneProposal = !isUser ? parseSceneProposal(message.content) : null
  const displayText = !isUser
    ? message.content.replace(/```scenes\s*[\s\S]*?```/, '').trim()
    : message.content

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? 'bg-muted' : 'bg-primary/15'
        }`}
      >
        {isUser ? (
          <span className="text-xs font-semibold text-muted-foreground">You</span>
        ) : (
          <Film size={13} className="text-primary" />
        )}
      </div>
      <div className="max-w-[75%] space-y-3">
        {displayText && (
          <div
            className={`rounded-2xl px-4 py-3 ${
              isUser
                ? 'bg-foreground text-background rounded-tr-md'
                : 'bg-muted text-foreground rounded-tl-md'
            }`}
          >
            <p className="text-sm whitespace-pre-wrap leading-relaxed">{displayText}</p>
          </div>
        )}
        {sceneProposal && (
          <div className="space-y-2">
            {sceneProposal.map((scene, i) => (
              <div
                key={`${scene.title}-${scene.description.slice(0, 30)}`}
                className="bg-card border border-primary/30 rounded-lg p-3 shadow-sm"
              >
                <p className="text-xs font-semibold text-primary uppercase tracking-wide mb-1">
                  Scene {i + 1}
                  {scene.title ? `: ${scene.title}` : ''}
                </p>
                {(scene.beat || scene.durationSec || scene.hookRole) && (
                  <p className="text-[11px] text-muted-foreground mb-1">
                    {[scene.beat ? `Beat: ${scene.beat}` : null, scene.durationSec ? `${scene.durationSec}s` : null, scene.hookRole ? `Role: ${scene.hookRole}` : null]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                )}
                <p className="text-sm text-foreground leading-relaxed">{scene.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
