import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { AlertCircle, ChevronRight, Film, Image as ImageIcon, Video, Music } from 'lucide-react'
import type { Scene } from '@/db/schema'
import { resetWorkshop } from '../project-actions'
import { SceneDetailPanel } from './scene-detail-panel'
import { ResetDialog } from './reset-dialog'

const PIPELINE_STAGES = [
  { key: 'script', label: 'Script', icon: Film },
  { key: 'images', label: 'Images', icon: ImageIcon },
  { key: 'video', label: 'Video', icon: Video },
  { key: 'audio', label: 'Audio', icon: Music },
] as const

export function Storyboard({
  projectId,
  scenes: storyScenes,
}: {
  projectId: string
  scenes: Scene[]
}) {
  const router = useRouter()
  const [isResetting, setIsResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)

  const selectedScene = storyScenes.find((s) => s.id === selectedSceneId) ?? null

  async function handleReset() {
    setIsResetting(true)
    setError(null)
    try {
      await resetWorkshop({ data: projectId })
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset workshop')
    } finally {
      setIsResetting(false)
    }
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* Scene list */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Storyboard
          </h2>
          <ResetDialog isResetting={isResetting} onConfirm={handleReset} />
        </div>

        {error && (
          <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto text-destructive/50 hover:text-destructive"
            >
              ✕
            </button>
          </div>
        )}

        <div className="grid gap-3">
          {storyScenes.map((scene, i) => (
            <StoryboardCard
              key={scene.id}
              scene={scene}
              index={i}
              isSelected={scene.id === selectedSceneId}
              onSelect={() =>
                setSelectedSceneId(scene.id === selectedSceneId ? null : scene.id)
              }
            />
          ))}
        </div>
      </div>

      {/* Scene detail panel — key forces remount on scene change */}
      {selectedScene && (
        <SceneDetailPanel
          key={selectedScene.id}
          scene={selectedScene}
          onClose={() => setSelectedSceneId(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Storyboard card
// ---------------------------------------------------------------------------

function StoryboardCard({
  scene,
  index,
  isSelected,
  onSelect,
}: {
  scene: Scene
  index: number
  isSelected: boolean
  onSelect: () => void
}) {
  const currentStageIndex = PIPELINE_STAGES.findIndex((s) => s.key === scene.stage)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left bg-card rounded-xl border-2 p-4 transition-all hover:shadow-md ${
        isSelected ? 'border-primary shadow-md' : 'border-border hover:border-border/80'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Scene number */}
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-muted-foreground">{index + 1}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {scene.title && (
            <p className="font-semibold text-foreground text-sm mb-0.5">{scene.title}</p>
          )}
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {scene.description}
          </p>

          {/* Pipeline progress */}
          <div className="flex items-center gap-3 mt-3">
            {PIPELINE_STAGES.map((stage, i) => {
              const isDone = i <= currentStageIndex
              const Icon = stage.icon
              return (
                <div key={stage.key} className="flex items-center gap-1">
                  <Icon size={12} className={isDone ? 'text-primary' : 'text-muted-foreground/50'} />
                  <span
                    className={`text-xs ${isDone ? 'text-primary font-medium' : 'text-muted-foreground/70'}`}
                  >
                    {stage.label}
                  </span>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <ChevronRight size={10} className="text-muted-foreground/50 ml-1" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </button>
  )
}
