import { useState } from 'react'
import { Loader2, Play, Trash2, AlertTriangle } from 'lucide-react'
import { GeneratingTimer } from './generating-timer'
import type { TransitionVideoSummary } from '../../project-types'

export function VideoGrid({
  transitionVideos,
  deletingVideoId,
  onDelete,
  onSelect,
}: {
  transitionVideos: TransitionVideoSummary[]
  deletingVideoId: string | null
  onDelete: (id: string) => void
  onSelect: (id: string) => void
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)

  const sorted = [...transitionVideos].reverse()

  if (sorted.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">No transition videos yet</p>
          <p className="text-xs text-muted-foreground/70">Generate a video from the controls on the left</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3">Videos</p>
      <div className="grid grid-cols-3 gap-2">
        {sorted.map((tv) => (
          <div key={tv.id} className="relative rounded-lg overflow-hidden bg-muted group aspect-video">
            {tv.status === 'done' && tv.url ? (
              <>
                <button
                  type="button"
                  onClick={() => setLightboxUrl(tv.url!)}
                  className="w-full h-full relative"
                >
                  <video src={tv.url} preload="metadata" className="w-full h-full object-cover pointer-events-none" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/50 transition-colors opacity-0 group-hover:opacity-100">
                    <Play size={20} className="text-white fill-white" />
                  </div>
                </button>
                {tv.isSelected && (
                  <span className="absolute top-1.5 left-1.5 bg-primary text-primary-foreground text-[10px] font-medium px-1.5 py-0.5 rounded">Selected</span>
                )}
                {tv.stale && (
                  <span className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-amber-500/90 text-white text-[10px] px-1.5 py-0.5 rounded">
                    <AlertTriangle size={9} />
                  </span>
                )}
                <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!tv.isSelected && (
                    <button
                      type="button"
                      onClick={() => onSelect(tv.id)}
                      className="bg-white/90 text-black text-[10px] font-medium px-2 py-0.5 rounded hover:bg-white transition-colors"
                    >
                      Select
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(tv.id)}
                    disabled={deletingVideoId === tv.id}
                    className="bg-white/90 text-red-600 p-1 rounded hover:bg-white transition-colors disabled:opacity-50"
                  >
                    {deletingVideoId === tv.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                  </button>
                </div>
              </>
            ) : tv.status === 'generating' ? (
              <div className="absolute inset-0 border border-border bg-card overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-card via-muted-foreground/15 to-card animate-pulse" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/40 border-t-foreground/60 animate-spin" />
                  <GeneratingTimer />
                </div>
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-2 gap-1">
                <span className="text-[10px] text-destructive text-center leading-relaxed">{tv.errorMessage ?? 'Failed'}</span>
                <button
                  type="button"
                  onClick={() => onDelete(tv.id)}
                  className="bg-white/90 text-red-600 p-1 rounded hover:bg-white transition-colors"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightboxUrl(null)}
        >
          <button type="button" onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 text-white/70 hover:text-white z-10">
            ✕
          </button>
          <div onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[85vh]">
            <video src={lightboxUrl} controls autoPlay className="max-w-full max-h-[80vh] rounded-lg" />
          </div>
        </div>
      )}
    </div>
  )
}
