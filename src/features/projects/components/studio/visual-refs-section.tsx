import { Link2 } from 'lucide-react'
import type { ConsistencyLock } from '../../project-types'

export function VisualRefsSection({
  consistencyLock,
}: {
  consistencyLock?: ConsistencyLock
}) {
  if (!consistencyLock?.enabled || !consistencyLock.referenceUrls.length) {
    return null
  }

  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Link2 size={12} className="text-muted-foreground" />
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Consistency references
        </p>
        <span className="text-[10px] text-muted-foreground">
          ({consistencyLock.strength})
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {consistencyLock.referenceUrls.map((url) => (
          <div key={url} className="rounded overflow-hidden bg-muted aspect-square">
            <img
              src={url}
              alt="Reference"
              className="w-full h-full object-cover"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = 'none'
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
