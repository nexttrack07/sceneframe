import { Button } from '@/components/ui/button'
import type { SceneVersionEntry } from '../project-types'

interface SceneVersionHistoryProps {
  sceneVersions: SceneVersionEntry[]
  isRestoring: boolean
  onRestoreVersion: (version: SceneVersionEntry) => void
}

export function SceneVersionHistory({
  sceneVersions,
  isRestoring,
  onRestoreVersion,
}: SceneVersionHistoryProps) {
  if (sceneVersions.length === 0) return null

  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Version history
      </p>
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {sceneVersions
          .slice()
          .reverse()
          .map((version, idx) => (
            <div
              key={`${version.createdAt}-${idx}`}
              className="rounded border bg-card p-2 space-y-1"
            >
              <p className="text-[11px] text-muted-foreground">
                {new Date(version.createdAt).toLocaleString()}
              </p>
              <p className="text-xs text-foreground line-clamp-3">{version.description}</p>
              <Button
                size="sm"
                variant="outline"
                disabled={isRestoring}
                onClick={() => onRestoreVersion(version)}
              >
                Restore this version
              </Button>
            </div>
          ))}
      </div>
    </div>
  )
}
