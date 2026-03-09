import { useMemo, useState } from 'react'
import { Check, Clock, ImageIcon, Maximize2, RefreshCw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SceneAssetSummary } from '../../project-types'
import { GalleryImageCard } from './gallery-image-card'
import { GalleryVideoCard } from './gallery-video-card'
import { ImageLightbox } from '../image-lightbox'
import { VideoLightbox } from '../video-lightbox'

export function StudioGallery({
  sceneAssets,
  selectingAssetId,
  deletingAssetId,
  onSelectAsset,
  onDeleteAsset,
  onRegenerate,
  expandedImageId,
  onExpandImage,
  onLightboxChange,
}: {
  sceneAssets: SceneAssetSummary[]
  selectingAssetId: string | null
  deletingAssetId: string | null
  onSelectAsset: (assetId: string) => void
  onDeleteAsset: (assetId: string) => void
  onRegenerate: () => void
  expandedImageId: string | null
  onExpandImage: (assetId: string | null) => void
  onLightboxChange?: (open: boolean) => void
}) {
  const [showLightbox, setShowLightbox] = useState(false)
  const [lightboxStartIndex, setLightboxStartIndex] = useState(0)

  const laneAssets = useMemo(
    () => sceneAssets.filter((a) => ['start_image', 'end_image', 'image'].includes(a.type)),
    [sceneAssets],
  )

  const videoAssets = useMemo(
    () => [...sceneAssets.filter((a) => a.type === 'video')].reverse(),
    [sceneAssets],
  )

  const [expandedVideoId, setExpandedVideoId] = useState<string | null>(null)
  const selectedVideo = expandedVideoId ? videoAssets.find((a) => a.id === expandedVideoId) ?? null : null
  // Most recent first
  const sortedAssets = useMemo(
    () => [...laneAssets].reverse(),
    [laneAssets],
  )

  const selectedAsset = expandedImageId
    ? laneAssets.find((a) => a.id === expandedImageId) ?? null
    : null

  const doneAssets = laneAssets.filter((a) => a.status === 'done' && a.url)

  function openLightboxForAsset(assetId: string) {
    const idx = doneAssets.findIndex((a) => a.id === assetId)
    if (idx === -1) return
    setLightboxStartIndex(idx)
    setShowLightbox(true)
    onLightboxChange?.(true)
  }

  function closeLightbox() {
    setShowLightbox(false)
    onLightboxChange?.(false)
  }

  if (sortedAssets.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <ImageIcon size={32} className="mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No images generated yet</p>
          <p className="text-xs text-muted-foreground/70">
            Write a prompt and hit Generate to get started
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* Image + Video sections */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Images section */}
        <div className="flex-1 overflow-y-auto p-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3">Images</p>
          <div className="grid grid-cols-3 gap-2">
            {sortedAssets.map((asset) => (
              <GalleryImageCard
                key={asset.id}
                asset={asset}
                selectingAssetId={selectingAssetId}
                deletingAssetId={deletingAssetId}
                onSelect={() => onSelectAsset(asset.id)}
                onDelete={() => onDeleteAsset(asset.id)}
                onExpand={() => onExpandImage(asset.id === expandedImageId ? null : asset.id)}
                onLightbox={() => openLightboxForAsset(asset.id)}
              />
            ))}
          </div>
        </div>

        {/* Videos section */}
        {videoAssets.length > 0 && (
          <div className="shrink-0 border-t p-4 bg-muted/20 space-y-3">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Videos</p>
            <div className="grid grid-cols-3 gap-2">
              {videoAssets.map((asset) => (
                <GalleryVideoCard
                  key={asset.id}
                  asset={asset}
                  deletingAssetId={deletingAssetId}
                  onExpand={() => setExpandedVideoId(asset.id === expandedVideoId ? null : asset.id)}
                  onDelete={() => onDeleteAsset(asset.id)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Side drawer — overlay */}
      {selectedAsset && (
        <>
        <div className="fixed inset-0 z-50 bg-black/30" onClick={() => onExpandImage(null)} />
        <div className="fixed top-0 right-0 bottom-0 z-50 w-[340px] border-l bg-card flex flex-col overflow-y-auto shadow-xl animate-in slide-in-from-right duration-200">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">Image Details</h4>
            <Button size="sm" variant="ghost" onClick={() => onExpandImage(null)} className="h-7 w-7 p-0">
              <X size={14} />
            </Button>
          </div>

          <div className="p-4 space-y-4">
            {/* Preview */}
            {selectedAsset.url && (
              <img
                src={selectedAsset.url}
                alt="Selected image"
                className="w-full rounded-lg object-contain cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => openLightboxForAsset(selectedAsset.id)}
              />
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              {!selectedAsset.isSelected && selectedAsset.status === 'done' && (
                <Button
                  size="sm"
                  onClick={() => onSelectAsset(selectedAsset.id)}
                  disabled={selectingAssetId === selectedAsset.id}
                  className="gap-1.5 flex-1"
                >
                  <Check size={12} />
                  Select
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={onRegenerate} className="gap-1.5 flex-1">
                <RefreshCw size={12} />
                Regenerate
              </Button>
              {selectedAsset.status === 'done' && selectedAsset.url && (
                <Button size="sm" variant="outline" onClick={() => openLightboxForAsset(selectedAsset.id)} className="gap-1.5">
                  <Maximize2 size={12} />
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => onDeleteAsset(selectedAsset.id)}
                disabled={deletingAssetId === selectedAsset.id}
                className="gap-1.5 text-red-600 hover:text-red-600"
              >
                <Trash2 size={12} />
              </Button>
            </div>

            {/* Metadata */}
            <div className="space-y-3">
              {/* Timestamp */}
              <MetadataRow icon={<Clock size={12} />} label="Generated" value={new Date(selectedAsset.createdAt).toLocaleString()} />

              {/* Prompt */}
              {selectedAsset.prompt && (
                <div className="space-y-1">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Prompt</p>
                  <p className="text-xs text-foreground/80 leading-relaxed bg-muted/50 rounded-lg px-3 py-2">
                    {selectedAsset.prompt}
                  </p>
                </div>
              )}

              {/* Model */}
              {selectedAsset.model && (
                <MetadataRow label="Model" value={selectedAsset.model} />
              )}

              {/* Model settings */}
              {selectedAsset.modelSettings && (
                <>
                  {selectedAsset.modelSettings.aspectRatio && (
                    <MetadataRow label="Aspect Ratio" value={String(selectedAsset.modelSettings.aspectRatio)} />
                  )}
                  {selectedAsset.modelSettings.qualityPreset && (
                    <MetadataRow label="Quality" value={String(selectedAsset.modelSettings.qualityPreset)} />
                  )}
                  {selectedAsset.modelSettings.outputFormat && (
                    <MetadataRow label="Format" value={String(selectedAsset.modelSettings.outputFormat)} />
                  )}
                  {selectedAsset.modelSettings.batchCount && (
                    <MetadataRow label="Batch Size" value={String(selectedAsset.modelSettings.batchCount)} />
                  )}
                </>
              )}

              {/* Status */}
              <MetadataRow label="Status" value={selectedAsset.status} />

              {/* Batch ID */}
              {selectedAsset.batchId && (
                <MetadataRow label="Batch ID" value={selectedAsset.batchId.slice(0, 8)} />
              )}

              {/* Selected status */}
              {selectedAsset.isSelected && (
                <MetadataRow label="Selection" value="Selected" />
              )}
            </div>
          </div>
        </div>
        </>
      )}

      {/* Video lightbox */}
      {selectedVideo && selectedVideo.url && (
        <VideoLightbox
          asset={selectedVideo}
          assets={videoAssets.filter((a) => a.status === 'done' && a.url)}
          onNavigate={setExpandedVideoId}
          onClose={() => setExpandedVideoId(null)}
        />
      )}

      {/* Lightbox */}
      {showLightbox && (
        <ImageLightbox
          assets={doneAssets}
          initialIndex={lightboxStartIndex}
          onClose={closeLightbox}
        />
      )}
    </div>
  )
}

function MetadataRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {icon}
        {label}
      </span>
      <span className="text-xs text-foreground text-right max-w-[180px] break-words">{value}</span>
    </div>
  )
}
