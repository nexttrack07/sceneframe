import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Loader2, Film, RefreshCw, Trash2, AlertTriangle } from 'lucide-react'
import type { Shot } from '@/db/schema'
import type { SceneAssetSummary, TransitionVideoSummary } from '../project-types'
import {
  generateTransitionVideo,
  generateTransitionVideoPrompt,
  pollTransitionVideo,
  selectTransitionVideo,
  deleteTransitionVideo,
} from '../scene-actions'
import { useToast } from '@/components/ui/toast'

export function TransitionConnector({
  fromShot,
  toShot,
  fromShotAssets,
  toShotAssets,
  transitionVideos,
}: {
  fromShot: Shot
  toShot: Shot
  fromShotAssets: SceneAssetSummary[]
  toShotAssets: SceneAssetSummary[]
  transitionVideos: TransitionVideoSummary[]
}) {
  const router = useRouter()
  const { toast } = useToast()
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatingPhase, setGeneratingPhase] = useState<'prompt' | 'video' | null>(null)
  const cancelRef = useRef(false)
  const [videoPrompt, setVideoPrompt] = useState('')
  const [showPromptInput, setShowPromptInput] = useState(false)

  const fromSelected = fromShotAssets.find((a) => a.isSelected && a.status === 'done')
  const toSelected = toShotAssets.find((a) => a.isSelected && a.status === 'done')
  const bothReady = !!fromSelected && !!toSelected

  const pairTransitions = transitionVideos.filter(
    (tv) => tv.fromShotId === fromShot.id && tv.toShotId === toShot.id,
  )
  const selectedTransition = pairTransitions.find((tv) => tv.isSelected && tv.status === 'done')
  const generatingTransition = pairTransitions.find((tv) => tv.status === 'generating')
  const staleTransition = selectedTransition?.stale ? selectedTransition : null

  // Auto-resume polling for any stuck generating transition on mount
  useEffect(() => {
    if (!generatingTransition || isGenerating) return
    const transitionVideoId = generatingTransition.id
    cancelRef.current = false
    setIsGenerating(true)
    setGeneratingPhase('video')

    const POLL_TIMEOUT_MS = 12 * 60 * 1000
    const deadline = Date.now() + POLL_TIMEOUT_MS

    const interval = setInterval(async () => {
      if (cancelRef.current || Date.now() > deadline) {
        clearInterval(interval)
        setIsGenerating(false)
        setGeneratingPhase(null)
        return
      }
      try {
        const result = await pollTransitionVideo({ data: { transitionVideoId } })
        if (result.status === 'done') {
          if (!selectedTransition) {
            await selectTransitionVideo({ data: { transitionVideoId } })
          }
          clearInterval(interval)
          setIsGenerating(false)
          setGeneratingPhase(null)
          await router.invalidate()
          toast('Transition video ready', 'success')
        } else if (result.status === 'error') {
          clearInterval(interval)
          setIsGenerating(false)
          setGeneratingPhase(null)
          await router.invalidate()
          toast(result.errorMessage ?? 'Video generation failed', 'error')
        }
      } catch {
        // transient error — keep polling, don't stop
      }
    }, 5000)

    return () => {
      clearInterval(interval)
      cancelRef.current = true
    }
  }, [generatingTransition?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCancelStuck() {
    // Cancel local polling
    cancelRef.current = true
    // Delete the stuck DB record so it stops blocking the UI
    if (generatingTransition) {
      try {
        await deleteTransitionVideo({ data: { transitionVideoId: generatingTransition.id } })
        await router.invalidate()
      } catch {
        // best effort
      }
    }
    setIsGenerating(false)
    setGeneratingPhase(null)
  }

  async function handleGenerate() {
    setIsGenerating(true)
    cancelRef.current = false
    try {
      let prompt = videoPrompt.trim()
      if (!prompt) {
        setGeneratingPhase('prompt')
        const result = await generateTransitionVideoPrompt({
          data: { fromShotId: fromShot.id, toShotId: toShot.id },
        })
        prompt = result.prompt
      }

      setGeneratingPhase('video')
      const { transitionVideoId } = await generateTransitionVideo({
        data: { fromShotId: fromShot.id, toShotId: toShot.id, prompt },
      })

      const POLL_TIMEOUT_MS = 12 * 60 * 1000 // 12 minutes
      const deadline = Date.now() + POLL_TIMEOUT_MS

      await new Promise<void>((resolve, reject) => {
        const interval = setInterval(async () => {
          if (Date.now() > deadline || cancelRef.current) {
            clearInterval(interval)
            reject(new Error(cancelRef.current ? 'Cancelled' : 'Video generation timed out — Kling may still be processing. Refresh to check status.'))
            return
          }
          try {
            const result = await pollTransitionVideo({ data: { transitionVideoId } })
            if (result.status === 'done') {
              if (!selectedTransition) {
                await selectTransitionVideo({ data: { transitionVideoId } })
              }
              clearInterval(interval)
              resolve()
            } else if (result.status === 'error') {
              clearInterval(interval)
              reject(new Error(result.errorMessage ?? 'Video generation failed'))
            }
          } catch {
            // transient error — keep polling
          }
        }, 5000)
      })

      await router.invalidate()
      toast('Transition video generated', 'success')
      setVideoPrompt('')
      setShowPromptInput(false)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate video'
      toast(msg, 'error')
    } finally {
      setIsGenerating(false)
      setGeneratingPhase(null)
      cancelRef.current = false
    }
  }

  async function handleDelete(transitionVideoId: string) {
    try {
      await deleteTransitionVideo({ data: { transitionVideoId } })
      await router.invalidate()
      toast('Video deleted', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete', 'error')
    }
  }

  if (!bothReady) {
    return (
      <div className="flex items-center justify-center py-1.5 ml-6 mr-2">
        <div className="flex-1 border-t border-dashed border-border/40" />
      </div>
    )
  }

  if (generatingTransition || isGenerating) {
    return (
      <div className="flex items-center gap-2 py-1.5 ml-6 mr-2">
        <div className="flex-1 border-t border-border/40" />
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 border border-border/60 rounded-full px-3 py-1">
            <Loader2 size={11} className="animate-spin" />
            {generatingPhase === 'prompt' ? 'Writing prompt...' : generatingPhase === 'video' ? 'Generating video (3–7 min)...' : 'Generating...'}
          </div>
          <button
            type="button"
            onClick={handleCancelStuck}
            className="text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-full px-2 py-0.5 hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
        </div>
        <div className="flex-1 border-t border-border/40" />
      </div>
    )
  }

  if (selectedTransition) {
    return (
      <div className="flex items-center gap-2 py-1.5 ml-6 mr-2">
        <div className="flex-1 border-t border-border/40" />
        <div className="flex items-center gap-1.5 shrink-0">
          {staleTransition && (
            <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
              <AlertTriangle size={10} />
              Stale
            </span>
          )}
          {selectedTransition.url && (
            <video
              src={selectedTransition.url}
              className="h-8 rounded border border-border aspect-video object-cover"
              preload="metadata"
            />
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-full px-2 py-0.5 hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={10} />
            Regenerate
          </button>
          <button
            type="button"
            onClick={() => handleDelete(selectedTransition.id)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive border border-border/60 rounded-full px-2 py-0.5 hover:bg-muted/50 transition-colors"
          >
            <Trash2 size={10} />
          </button>
        </div>
        <div className="flex-1 border-t border-border/40" />
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 py-1.5 ml-6 mr-2">
      <div className="flex-1 border-t border-border/40" />
      <div className="shrink-0 flex items-center gap-1.5">
        {showPromptInput ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={videoPrompt}
              onChange={(e) => setVideoPrompt(e.target.value)}
              placeholder="Motion prompt (optional)..."
              className="text-xs border border-border rounded-full px-3 py-0.5 w-48 focus:outline-none focus:ring-1 focus:ring-primary/30 bg-background"
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-1 text-xs font-medium text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 rounded-full px-3 py-0.5 transition-colors disabled:opacity-50"
            >
              <Film size={11} />
              Generate
            </button>
            <button
              type="button"
              onClick={() => setShowPromptInput(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowPromptInput(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary border border-dashed border-border hover:border-primary/30 hover:bg-primary/5 rounded-full px-3 py-0.5 transition-colors"
          >
            <Film size={11} />
            Generate transition →
          </button>
        )}
      </div>
      <div className="flex-1 border-t border-border/40" />
    </div>
  )
}
