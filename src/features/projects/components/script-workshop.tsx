import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Loader2, Send, Check, Film } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { Message } from '@/db/schema'
import { sendMessage, approveScenes } from '../project-actions'

export function parseSceneProposal(
  content: string,
): { title: string; description: string }[] | null {
  const match = content.match(/```scenes\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[1])
    if (!Array.isArray(parsed) || parsed.length < 1) return null
    return parsed
      .map((s: { title?: string; description?: string }) => ({
        title: String(s.title ?? '').trim(),
        description: String(s.description ?? '').trim(),
      }))
      .filter((s: { description: string }) => s.description.length > 0)
  } catch {
    return null
  }
}

export function ScriptWorkshop({
  projectId,
  existingMessages,
}: {
  projectId: string
  existingMessages: Message[]
}) {
  const router = useRouter()
  const [chatMessages, setChatMessages] = useState<Message[]>(existingMessages)
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isApproving, setIsApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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

  async function handleSend() {
    if (!input.trim() || isSending) return
    setError(null)

    const userMsg: Message = {
      id: crypto.randomUUID(),
      projectId,
      role: 'user',
      content: input.trim(),
      createdAt: new Date(),
    }
    setChatMessages((prev) => [...prev, userMsg])
    setInput('')
    setIsSending(true)

    try {
      const result = await sendMessage({ data: { projectId, content: userMsg.content } })
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

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {chatMessages.length === 0 && (
          <div className="text-center py-12">
            <Film size={32} className="text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">Welcome to the Script Workshop</p>
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
        <div className="px-6 py-3 border-t bg-primary/10 flex items-center justify-between">
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
              disabled={isApproving}
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
            placeholder={
              chatMessages.length === 0 ? 'Describe your video concept...' : 'Type a message...'
            }
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
                <p className="text-sm text-foreground leading-relaxed">{scene.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
