import { Check, Clock, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { TransitionVideoSummary } from '../../project-types'

export function VideoDetailDrawer({
  video,
  deletingVideoId,
  onClose,
  onDelete,
  onSelect,
}: {
  video: TransitionVideoSummary | null
  deletingVideoId: string | null
  onClose: () => void
  onDelete: (id: string) => void
  onSelect: (id: string) => void
}) {
  if (!video) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div className="fixed top-0 right-0 bottom-0 z-50 w-[340px] border-l bg-card flex flex-col overflow-y-auto shadow-xl animate-in slide-in-from-right duration-200">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h4 className="text-sm font-semibold">Video Details</h4>
          <Button size="sm" variant="ghost" onClick={onClose} className="h-7 w-7 p-0">
            <X size={14} />
          </Button>
        </div>
        <div className="p-4 space-y-4">
          {video.url && (
            <video src={video.url} controls className="w-full rounded-lg border border-border" />
          )}
          <div className="flex items-center gap-2">
            {!video.isSelected && video.status === 'done' && (
              <Button size="sm" onClick={() => { onSelect(video.id) }} className="gap-1.5 flex-1">
                <Check size={12} /> Select
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => { onDelete(video.id) }}
              disabled={deletingVideoId === video.id}
              className="gap-1.5 text-red-600 hover:text-red-600 flex-1">
              <Trash2 size={12} /> Delete
            </Button>
          </div>
          <div className="space-y-3 text-xs">
            <MetaRow icon={<Clock size={12} />} label="Generated" value={new Date(video.createdAt).toLocaleString()} />
            {video.model && <MetaRow label="Model" value={video.model.split('/').pop() ?? video.model} />}
            {video.modelSettings?.duration && <MetaRow label="Duration" value={`${video.modelSettings.duration}s`} />}
            {video.modelSettings?.mode && <MetaRow label="Resolution" value={video.modelSettings.mode === 'pro' ? '1080p' : '720p'} />}
            {video.modelSettings?.negativePrompt && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Negative prompt</p>
                <p className="text-foreground/80 leading-relaxed bg-muted/50 rounded-lg px-3 py-2">{video.modelSettings.negativePrompt}</p>
              </div>
            )}
            {video.prompt && (
              <div className="space-y-1">
                <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Motion prompt</p>
                <p className="text-foreground/80 leading-relaxed bg-muted/50 rounded-lg px-3 py-2">{video.prompt}</p>
              </div>
            )}
            {video.isSelected && <MetaRow label="Status" value="Selected" />}
            {video.stale && <MetaRow label="Warning" value="Stale — source images changed" />}
          </div>
        </div>
      </div>
    </>
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
