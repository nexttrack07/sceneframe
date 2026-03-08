import { useEffect, useId, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { AlertCircle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Scene, Shot } from '@/db/schema'
import type { ShotType } from '../../project-types'
import { updateShot } from '../../scene-actions'

export function ShotContextSection({
  shot,
  parentScene,
  onDescriptionSaved,
}: {
  shot: Shot
  parentScene: Scene
  onDescriptionSaved?: (newDescription: string) => void
}) {
  const router = useRouter()
  const id = useId()
  const [isOpen, setIsOpen] = useState(true)
  const [description, setDescription] = useState(shot.description)
  const [shotType, setShotType] = useState<ShotType>(shot.shotType as ShotType)
  const [durationSec, setDurationSec] = useState(shot.durationSec)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset local state when navigating between shots
  useEffect(() => {
    setDescription(shot.description)
    setShotType(shot.shotType as ShotType)
    setDurationSec(shot.durationSec)
    setIsDirty(false)
    setError(null)
  }, [shot.id, shot.description, shot.shotType, shot.durationSec])

  async function handleSave() {
    if (!isDirty) return
    const trimmedDesc = description.trim()
    if (!trimmedDesc) {
      setError('Description cannot be empty')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await updateShot({
        data: {
          shotId: shot.id,
          description: trimmedDesc,
          shotType,
          durationSec,
        },
      })
      setIsDirty(false)
      onDescriptionSaved?.(trimmedDesc)
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  function handleShotTypeChange(type: ShotType) {
    setShotType(type)
    setIsDirty(true)
  }

  function handleDurationChange(value: number) {
    const clamped = Math.max(1, Math.min(10, value))
    setDurationSec(clamped)
    setIsDirty(true)
  }

  return (
    <div className="space-y-3">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 w-full text-left"
      >
        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Shot context
        </span>
      </button>

      {isOpen && (
        <div className="space-y-3">
          {/* Breadcrumb */}
          <p className="text-xs text-muted-foreground">
            Scene: {parentScene.title || `Scene ${parentScene.order}`}
          </p>

          {/* Description */}
          <div className="space-y-1.5">
            <label
              htmlFor={`${id}-desc`}
              className="text-xs font-medium text-muted-foreground"
            >
              Description
            </label>
            <textarea
              id={`${id}-desc`}
              value={description}
              onChange={(e) => { setDescription(e.target.value); setIsDirty(true) }}
              rows={4}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent leading-relaxed"
              placeholder="Shot description..."
            />
          </div>

          {/* Duration editor */}
          <div className="space-y-1.5">
            <label
              htmlFor={`${id}-duration`}
              className="text-xs font-medium text-muted-foreground"
            >
              Duration
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id={`${id}-duration`}
                type="number"
                min={1}
                max={10}
                value={durationSec}
                onChange={(e) => handleDurationChange(Number(e.target.value) || 1)}
                className="w-20 h-8 px-2 border border-border rounded-md text-sm text-foreground bg-background focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
              <span className="text-xs text-muted-foreground">s</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Save button */}
          {isDirty && (
            <Button size="sm" onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving && <Loader2 size={13} className="animate-spin mr-1.5" />}
              {isSaving ? 'Saving...' : 'Save changes'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
