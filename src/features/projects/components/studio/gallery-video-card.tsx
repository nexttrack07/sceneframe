import { Loader2, Maximize2, Trash2 } from 'lucide-react'
import type { SceneAssetSummary } from '../../project-types'

export function GalleryVideoCard({
  asset,
  deletingAssetId,
  onExpand,
  onDelete,
}: {
  asset: SceneAssetSummary
  deletingAssetId: string | null
  onExpand: () => void
  onDelete: () => void
}) {
  const isDeleting = deletingAssetId === asset.id

  return (
    <div
      className={`relative rounded-lg overflow-hidden bg-muted group aspect-video ${
        asset.status === 'done' && asset.url ? 'cursor-pointer' : 'cursor-default'
      }`}
      onClick={asset.status === 'done' && asset.url ? onExpand : undefined}
    >
      {/* Video thumbnail — browser renders first frame via preload=metadata */}
      {asset.url ? (
        <video
          src={asset.url}
          preload="metadata"
          className="w-full h-full object-cover block pointer-events-none"
        />
      ) : (
        <div className={`w-full h-full ${asset.status === 'error' ? 'bg-destructive/10' : 'bg-muted animate-pulse'}`} />
      )}

      {/* Hover overlay */}
      {asset.status === 'done' && asset.url && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onExpand() }}
            className="bg-white/90 text-black p-1.5 rounded-md hover:bg-white transition-colors"
          >
            <Maximize2 size={14} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            disabled={isDeleting}
            className="bg-white/90 text-red-600 p-1.5 rounded-md hover:bg-white transition-colors disabled:opacity-50"
          >
            {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      )}

      {/* Status badges */}
      <div className="absolute top-2 right-2">
        {asset.status === 'generating' ? (
          <Loader2 size={14} className="text-white drop-shadow animate-spin" />
        ) : asset.status === 'error' ? (
          <span className="bg-destructive text-white text-xs font-medium px-2 py-0.5 rounded-md">Error</span>
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
    </div>
  )
}
