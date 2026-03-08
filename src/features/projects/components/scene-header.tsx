import { ChevronRight, ChevronDown, GripVertical, Trash2 } from 'lucide-react'
import type { Scene } from '@/db/schema'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

export function SceneHeader({
  scene,
  sceneIndex,
  shotCount,
  timeRange,
  isCollapsed,
  onToggleCollapse,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  scene: Scene
  sceneIndex: number
  shotCount: number
  timeRange: string
  isCollapsed: boolean
  onToggleCollapse: () => void
  onDelete: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
  onDragEnd: () => void
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className="group flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg border border-border/50"
    >
      {/* Drag handle */}
      <div
        className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GripVertical size={14} />
      </div>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="shrink-0 p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground"
      >
        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Scene title */}
      <button
        type="button"
        onClick={onToggleCollapse}
        className="flex items-center gap-2 flex-1 min-w-0 text-left"
      >
        <span className="text-sm font-semibold text-foreground truncate">
          {scene.title || `Scene ${sceneIndex + 1}`}
        </span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
          {shotCount} shot{shotCount !== 1 ? 's' : ''}
        </Badge>
        {timeRange && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
            {timeRange}
          </Badge>
        )}
      </button>

      {/* Delete scene button */}
      <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="p-1 rounded-md bg-card border border-border text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete scene?</AlertDialogTitle>
              <AlertDialogDescription>
                This will remove {scene.title ? `"${scene.title}"` : `Scene ${sceneIndex + 1}`} and
                all its shots and associated assets. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive hover:bg-destructive/90 focus:ring-destructive"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
