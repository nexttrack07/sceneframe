import { useId, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { AlertCircle, Loader2, Film, Image as ImageIcon, Video, Music } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { Scene } from '@/db/schema'
import { updateScene } from '../project-actions'

const ASSET_SECTIONS: {
  icon: typeof Film
  label: string
  status: 'pending' | 'locked'
  description: string
}[] = [
  {
    icon: ImageIcon,
    label: 'Images',
    status: 'pending',
    description: 'Generate start and end frame images from this scene description.',
  },
  {
    icon: Video,
    label: 'Video',
    status: 'locked',
    description: 'Generate video requires images first.',
  },
  {
    icon: Music,
    label: 'Audio',
    status: 'locked',
    description: 'Generate audio for this scene.',
  },
]

export function SceneDetailPanel({
  scene,
  onClose,
}: {
  scene: Scene
  onClose: () => void
}) {
  const router = useRouter()
  const id = useId()
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`

  const [title, setTitle] = useState(scene.title ?? '')
  const [description, setDescription] = useState(scene.description)
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleTitleChange(val: string) {
    setTitle(val)
    setIsDirty(true)
  }

  function handleDescriptionChange(val: string) {
    setDescription(val)
    setIsDirty(true)
  }

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
      await updateScene({
        data: {
          sceneId: scene.id,
          title: title.trim() || null,
          description: trimmedDesc,
        },
      })
      setIsDirty(false)
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="w-[400px] border-l bg-white flex flex-col shrink-0">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Scene Details</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          ✕
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Title */}
        <div className="space-y-1.5">
          <label
            htmlFor={titleId}
            className="text-xs font-medium text-gray-500 uppercase tracking-wide"
          >
            Title
          </label>
          <input
            id={titleId}
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            placeholder="Scene title"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label
            htmlFor={descriptionId}
            className="text-xs font-medium text-gray-500 uppercase tracking-wide"
          >
            Description
          </label>
          <textarea
            id={descriptionId}
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            rows={6}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent leading-relaxed"
            placeholder="Visual description for this scene..."
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isDirty && (
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 size={13} className="animate-spin mr-1.5" /> : null}
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        )}

        {/* Asset sections (placeholders for future epics) */}
        <div className="pt-4 border-t space-y-4">
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Assets</h4>

          {ASSET_SECTIONS.map((section) => (
            <AssetSection key={section.label} {...section} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Asset section placeholder
// ---------------------------------------------------------------------------

function AssetSection({
  icon: Icon,
  label,
  status,
  description,
}: {
  icon: typeof Film
  label: string
  status: 'pending' | 'generating' | 'done' | 'locked'
  description: string
}) {
  return (
    <div className={`rounded-lg border p-3 ${status === 'locked' ? 'opacity-50' : ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-gray-500" />
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <Badge variant="outline" className="ml-auto text-xs">
          {status === 'locked' ? 'Needs prior stage' : status === 'pending' ? 'Ready' : status}
        </Badge>
      </div>
      <p className="text-xs text-gray-400">{description}</p>
      {status === 'pending' && (
        <Button size="sm" variant="outline" className="mt-2 w-full" disabled>
          Generate {label} (coming soon)
        </Button>
      )}
    </div>
  )
}
