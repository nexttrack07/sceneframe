import { Loader2, Maximize2, Trash2 } from 'lucide-react'
import type { SceneAssetSummary } from '../../project-types'
import { GeneratingTimer } from './generating-timer'

export function GalleryImageCard({
  asset,
  selectingAssetId,
  deletingAssetId,
  onSelect,
  onExpand,
  onLightbox,
  onDelete,
}: {
  asset: SceneAssetSummary
  selectingAssetId: string | null
  deletingAssetId: string | null
  onSelect: () => void
  onExpand: () => void
  onLightbox: () => void
  onDelete: () => void
}) {
  const isDeleting = deletingAssetId === asset.id
  return (
    <div
      className={`relative rounded-lg overflow-hidden bg-muted group ${
        asset.status === 'done' && asset.url ? 'cursor-pointer' : 'cursor-default'
      } ${asset.isSelected ? 'ring-2 ring-primary ring-offset-2' : ''}`}
      onClick={asset.status === 'done' && asset.url ? onExpand : undefined}
    >
      {/* Image or placeholder */}
      {asset.url ? (
        <img
          src={asset.url}
          alt="Generated image"
          className="w-full aspect-video object-cover block"
        />
      ) : asset.status === 'error' ? (
        <div className="w-full aspect-video bg-destructive/10" />
      ) : (
        <div className="w-full aspect-video relative overflow-hidden rounded-md border border-border bg-card">
          <div className="absolute inset-0 bg-gradient-to-r from-card via-muted-foreground/15 to-card animate-pulse" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/40 border-t-foreground/60 animate-spin" />
            <GeneratingTimer createdAt={asset.createdAt} />
          </div>
        </div>
      )}

      {/* Hover overlay */}
      {asset.status === 'done' && asset.url && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          {!asset.isSelected && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSelect()
              }}
              disabled={selectingAssetId === asset.id}
              className="bg-white/90 text-black text-xs font-medium px-3 py-1.5 rounded-md hover:bg-white transition-colors"
            >
              Select
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onLightbox()
            }}
            className="bg-white/90 text-black p-1.5 rounded-md hover:bg-white transition-colors"
          >
            <Maximize2 size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            disabled={isDeleting}
            className="bg-white/90 text-red-600 p-1.5 rounded-md hover:bg-white transition-colors disabled:opacity-50"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      )}

      {/* Status badges */}
      <div className="absolute top-2 right-2">
        {asset.isSelected ? (
          <span className="bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5 rounded-md">
            Selected
          </span>
        ) : asset.status === 'error' ? (
          <span className="bg-destructive text-white text-xs font-medium px-2 py-0.5 rounded-md">
            Error
          </span>
        ) : null}
      </div>

      {/* Error message */}
      {asset.status === 'error' && asset.errorMessage && (
        <div className="absolute inset-0 flex items-center justify-center p-3">
          <p className="text-xs leading-tight text-destructive text-center line-clamp-4 bg-background/80 rounded p-2">
            {asset.errorMessage}
          </p>
        </div>
      )}

      {/* Selecting spinner */}
      {selectingAssetId === asset.id && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <Loader2 size={20} className="animate-spin text-primary" />
        </div>
      )}
    </div>
  )
}
