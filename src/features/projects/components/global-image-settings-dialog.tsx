import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { SlidersHorizontal } from 'lucide-react'
import type { ConsistencyLock, ImageDefaults, ProjectSettings } from '../project-actions'
import { saveConsistencyLock, saveImageDefaults } from '../project-actions'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

const DEFAULT_IMAGE_DEFAULTS: ImageDefaults = {
  model: 'black-forest-labs/flux-schnell',
  aspectRatio: '16:9',
  qualityPreset: 'balanced',
  batchCount: 2,
}

const DEFAULT_CONSISTENCY_LOCK: ConsistencyLock = {
  enabled: false,
  strength: 'medium',
  referenceUrls: [],
}

export function GlobalImageSettingsDialog({
  projectId,
  projectSettings,
}: {
  projectId: string
  projectSettings: ProjectSettings | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [referenceUrlsText, setReferenceUrlsText] = useState('')
  const [imageDefaults, setImageDefaults] = useState<ImageDefaults>(DEFAULT_IMAGE_DEFAULTS)
  const [consistencyLock, setConsistencyLock] = useState<ConsistencyLock>(DEFAULT_CONSISTENCY_LOCK)

  useEffect(() => {
    if (!open) return
    const defaults = projectSettings?.imageDefaults ?? DEFAULT_IMAGE_DEFAULTS
    const lock = projectSettings?.consistencyLock ?? DEFAULT_CONSISTENCY_LOCK
    setImageDefaults(defaults)
    setConsistencyLock(lock)
    setReferenceUrlsText((lock.referenceUrls ?? []).join('\n'))
    setError(null)
  }, [open, projectSettings])

  async function handleSave() {
    setIsSaving(true)
    setError(null)
    try {
      const referenceUrls = referenceUrlsText
        .split('\n')
        .map((url) => url.trim())
        .filter(Boolean)
      const sanitizedDefaults: ImageDefaults = {
        ...imageDefaults,
        batchCount: Math.max(1, Math.min(4, Number(imageDefaults.batchCount || 2))),
      }
      const sanitizedLock: ConsistencyLock = {
        ...consistencyLock,
        referenceUrls,
      }
      await Promise.all([
        saveImageDefaults({ data: { projectId, defaults: sanitizedDefaults } }),
        saveConsistencyLock({ data: { projectId, lock: sanitizedLock } }),
      ])
      await router.invalidate()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save image settings')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <SlidersHorizontal size={12} />
          Image settings
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader className="text-left">
          <AlertDialogTitle>Global image settings</AlertDialogTitle>
          <AlertDialogDescription>
            Configure fast defaults and global consistency for scene image generation.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-muted-foreground space-y-1">
              <span className="block">Model</span>
              <input
                value={imageDefaults.model}
                onChange={(e) => setImageDefaults((prev) => ({ ...prev, model: e.target.value }))}
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
              />
            </label>
            <label className="text-xs text-muted-foreground space-y-1">
              <span className="block">Aspect ratio</span>
              <select
                value={imageDefaults.aspectRatio}
                onChange={(e) =>
                  setImageDefaults((prev) => ({
                    ...prev,
                    aspectRatio: e.target.value as ImageDefaults['aspectRatio'],
                  }))
                }
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
                <option value="4:5">4:5</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground space-y-1">
              <span className="block">Quality</span>
              <select
                value={imageDefaults.qualityPreset}
                onChange={(e) =>
                  setImageDefaults((prev) => ({
                    ...prev,
                    qualityPreset: e.target.value as ImageDefaults['qualityPreset'],
                  }))
                }
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
              >
                <option value="fast">Fast</option>
                <option value="balanced">Balanced</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="text-xs text-muted-foreground space-y-1">
              <span className="block">Candidates per run</span>
              <input
                type="number"
                min={1}
                max={4}
                value={imageDefaults.batchCount}
                onChange={(e) =>
                  setImageDefaults((prev) => ({
                    ...prev,
                    batchCount: Number(e.target.value),
                  }))
                }
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
              />
            </label>
          </div>

          <div className="rounded-lg border border-border p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={consistencyLock.enabled}
                onChange={(e) =>
                  setConsistencyLock((prev) => ({ ...prev, enabled: e.target.checked }))
                }
              />
              Enable global consistency lock
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-muted-foreground space-y-1">
                <span className="block">Strength</span>
                <select
                  value={consistencyLock.strength}
                  onChange={(e) =>
                    setConsistencyLock((prev) => ({
                      ...prev,
                      strength: e.target.value as ConsistencyLock['strength'],
                    }))
                  }
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground"
                  disabled={!consistencyLock.enabled}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="text-xs text-muted-foreground space-y-1">
                <span className="block">Reference URLs (one per line)</span>
                <textarea
                  value={referenceUrlsText}
                  onChange={(e) => setReferenceUrlsText(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                  placeholder="https://.../character-reference.png"
                  disabled={!consistencyLock.enabled}
                />
              </label>
            </div>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <div className="mt-2 flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save image settings'}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
