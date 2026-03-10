import { useState } from 'react'
import { Loader2, Play, Trash2, AlertTriangle, Check, Clock, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TransitionVideoSummary } from '../../project-types'
import { GeneratingTimer } from './generating-timer'

export function VideoGrid({
  transitionVideos,
  deletingVideoId,
  onDelete,
  onSelect,
  isGenerating = false,
}: {
  transitionVideos: TransitionVideoSummary[]
  deletingVideoId: string | null
  onDelete: (id: string) => void
  onSelect: (id: string) => void
  isGenerating?: boolean
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filter out error records — errors surface as toasts, not grid items
  const sorted = [...transitionVideos.filter((tv) => tv.status !== 'error')].reverse()
  const expandedVideo = expandedId ? sorted.find((tv) => tv.id === expandedId) ?? null : null

  if (sorted.length === 0 && !isGenerating) {
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
    <div className="p-4 relative">
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-3">Videos</p>
      <div className="grid grid-cols-3 gap-2">
        {/* Optimistic skeleton — only shown before the DB record appears */}
        {isGenerating && !sorted.some((tv) => tv.status === 'generating') && (
          <div className="relative rounded-lg overflow-hidden border border-border bg-card aspect-video">
            <div className="absolute inset-0 bg-gradient-to-r from-card via-muted-foreground/15 to-card animate-pulse" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/40 border-t-foreground/60 animate-spin" />
              <GeneratingTimer />
            </div>
          </div>
        )}

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
                    onClick={() => setExpandedId(tv.id)}
                    className="bg-white/90 text-black text-[10px] font-medium px-2 py-0.5 rounded hover:bg-white transition-colors"
                  >
                    Info
                  </button>
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
                  <GeneratingTimer createdAt={tv.createdAt} />
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {/* Metadata side drawer */}
      {expandedVideo && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setExpandedId(null)} />
          <div className="fixed top-0 right-0 bottom-0 z-50 w-[340px] border-l bg-card flex flex-col overflow-y-auto shadow-xl animate-in slide-in-from-right duration-200">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h4 className="text-sm font-semibold">Video Details</h4>
              <Button size="sm" variant="ghost" onClick={() => setExpandedId(null)} className="h-7 w-7 p-0">
                <X size={14} />
              </Button>
            </div>
            <div className="p-4 space-y-4">
              {expandedVideo.url && (
                <video src={expandedVideo.url} controls className="w-full rounded-lg border border-border" />
              )}
              <div className="flex items-center gap-2">
                {!expandedVideo.isSelected && expandedVideo.status === 'done' && (
                  <Button size="sm" onClick={() => { onSelect(expandedVideo.id); setExpandedId(null) }} className="gap-1.5 flex-1">
                    <Check size={12} /> Select
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { onDelete(expandedVideo.id); setExpandedId(null) }}
                  disabled={deletingVideoId === expandedVideo.id}
                  className="gap-1.5 text-red-600 hover:text-red-600 flex-1">
                  <Trash2 size={12} /> Delete
                </Button>
              </div>
              <div className="space-y-3 text-xs">
                <MetaRow icon={<Clock size={12} />} label="Generated" value={new Date(expandedVideo.createdAt).toLocaleString()} />
                {expandedVideo.model && <MetaRow label="Model" value={expandedVideo.model.split('/').pop() ?? expandedVideo.model} />}
                {expandedVideo.modelSettings?.duration && <MetaRow label="Duration" value={`${expandedVideo.modelSettings.duration}s`} />}
                {expandedVideo.modelSettings?.mode && <MetaRow label="Resolution" value={expandedVideo.modelSettings.mode === 'pro' ? '1080p' : '720p'} />}
                {expandedVideo.modelSettings?.negativePrompt && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Negative prompt</p>
                    <p className="text-foreground/80 leading-relaxed bg-muted/50 rounded-lg px-3 py-2">{expandedVideo.modelSettings.negativePrompt}</p>
                  </div>
                )}
                {expandedVideo.prompt && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Motion prompt</p>
                    <p className="text-foreground/80 leading-relaxed bg-muted/50 rounded-lg px-3 py-2">{expandedVideo.prompt}</p>
                  </div>
                )}
                {expandedVideo.isSelected && <MetaRow label="Status" value="Selected" />}
                {expandedVideo.stale && <MetaRow label="Warning" value="Stale — source images changed" />}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => setLightboxUrl(null)}
        >
          <button type="button" onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 text-white/70 hover:text-white z-10">✕</button>
          <div onClick={(e) => e.stopPropagation()} className="max-w-[90vw] max-h-[85vh]">
            <video src={lightboxUrl} controls autoPlay className="max-w-full max-h-[80vh] rounded-lg" />
          </div>
        </div>
      )}
    </div>
  )
}

function MetaRow({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
        {icon}{label}
      </span>
      <span className="text-foreground text-right max-w-[180px] break-words">{value}</span>
    </div>
  )
}
