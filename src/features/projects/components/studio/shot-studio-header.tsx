import { ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Scene, Shot } from '@/db/schema'
import { ShotFilmstrip } from './shot-filmstrip'
import type { SceneAssetSummary } from '../../project-types'

export function ShotStudioHeader({
  shot,
  shotIndex,
  parentScene,
  allShots,
  allAssets,
  onShotChange,
  onClose,
}: {
  shot: Shot
  shotIndex: number
  parentScene: Scene
  allShots: Shot[]
  allAssets: SceneAssetSummary[]
  onShotChange: (shotId: string) => void
  onClose: () => void
}) {
  return (
    <div className="border-b bg-card px-4 py-3 flex items-center gap-3 shrink-0">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="hover:text-foreground transition-colors cursor-pointer"
        >
          Storyboard
        </button>
        <ChevronRight size={12} />
        <span className="text-muted-foreground">
          {parentScene.title || `Scene ${parentScene.order}`}
        </span>
        <ChevronRight size={12} />
        <span className="text-foreground font-medium">
          Shot {shotIndex + 1}
        </span>
      </div>

      {/* Filmstrip */}
      <div className="flex-1 min-w-0 mx-4">
        <ShotFilmstrip
          shots={allShots}
          allAssets={allAssets}
          currentShotId={shot.id}
          onShotChange={onShotChange}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>
    </div>
  )
}
