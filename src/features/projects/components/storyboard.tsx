import { useEffect, useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  AlertCircle,
  Download,
  Timer,
  CheckCircle2,
  Plus,
} from 'lucide-react'
import type { Scene } from '@/db/schema'
import type { ProjectSettings, SceneAssetSummary, ScenePlanEntry } from '../project-types'
import { exportProjectHandoff } from '../project-queries'
import { resetWorkshop } from '../project-mutations'
import { reorderScene, addScene, deleteScene } from '../scene-actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SceneImageStudio } from './scene-image-studio'
import { ResetDialog } from './reset-dialog'
import { StoryboardCard } from './storyboard-card'

export function Storyboard({
  projectId,
  scenes: storyScenes,
  assets: sceneAssets,
  projectSettings,
  scenePlan,
}: {
  projectId: string
  scenes: Scene[]
  assets: SceneAssetSummary[]
  projectSettings: ProjectSettings | null
  scenePlan: ScenePlanEntry[]
}) {
  const router = useRouter()
  const [isResetting, setIsResetting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [reasonFilter, setReasonFilter] = useState<string>('all')

  // Drag-to-reorder state
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Add scene form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSceneDescription, setNewSceneDescription] = useState('')
  const [isAddingScene, setIsAddingScene] = useState(false)

  const selectedScene = storyScenes.find((s) => s.id === selectedSceneId) ?? null
  const reasonMap = projectSettings?.assetDecisionReasons ?? {}
  const uniqueReasons = Array.from(new Set(Object.values(reasonMap).flat()))
  const planBySceneId = useMemo(
    () => new Map(storyScenes.map((scene, i) => [scene.id, scenePlan[i]])),
    [storyScenes, scenePlan],
  )
  const assetsBySceneId = useMemo(() => {
    const grouped = new Map<string, SceneAssetSummary[]>()
    for (const asset of sceneAssets) {
      const existing = grouped.get(asset.sceneId) ?? []
      existing.push(asset)
      grouped.set(asset.sceneId, existing)
    }
    return grouped
  }, [sceneAssets])
  const hasGeneratingAssets = sceneAssets.some((asset) => asset.status === 'generating')

  // Suppress polling while studio is open — studio manages its own invalidation
  useEffect(() => {
    if (!hasGeneratingAssets) return
    if (selectedSceneId !== null) return
    const interval = setInterval(() => {
      void router.invalidate()
    }, 2500)
    return () => clearInterval(interval)
  }, [hasGeneratingAssets, selectedSceneId, router])

  const filteredScenes =
    reasonFilter === 'all'
      ? storyScenes
      : storyScenes.filter((s) => (reasonMap[s.id] ?? []).includes(reasonFilter))

  const totalDuration = scenePlan.reduce((sum, scene) => sum + (scene.durationSec ?? 0), 0)

  const { readyCount, allReady } = useMemo(() => {
    const count = storyScenes.filter((scene) => {
      const sceneAssetList = assetsBySceneId.get(scene.id) ?? []
      const hasStart = sceneAssetList.some((a) => a.type === 'start_image' && a.isSelected)
      const hasEnd = sceneAssetList.some((a) => a.type === 'end_image' && a.isSelected)
      return hasStart && hasEnd
    }).length
    return { readyCount: count, allReady: count === storyScenes.length && storyScenes.length > 0 }
  }, [storyScenes, assetsBySceneId])

  async function handleReset() {
    setIsResetting(true)
    setError(null)
    try {
      await resetWorkshop({ data: projectId })
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart brief and chat')
    } finally {
      setIsResetting(false)
    }
  }

  async function handleExport(format: 'json' | 'markdown') {
    setIsExporting(true)
    setError(null)
    try {
      const result = await exportProjectHandoff({ data: { projectId, format } })
      const blob = new Blob([result.content], { type: result.mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export handoff')
    } finally {
      setIsExporting(false)
    }
  }

  async function handleDeleteScene(sceneId: string) {
    setError(null)
    try {
      await deleteScene({ data: { sceneId } })
      if (selectedSceneId === sceneId) setSelectedSceneId(null)
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete scene')
    }
  }

  async function handleAddScene() {
    if (!newSceneDescription.trim()) return
    setIsAddingScene(true)
    setError(null)
    try {
      const afterOrder =
        filteredScenes.length > 0
          ? filteredScenes[filteredScenes.length - 1].order
          : 0
      await addScene({
        data: {
          projectId,
          description: newSceneDescription.trim(),
          afterOrder,
        },
      })
      setNewSceneDescription('')
      setShowAddForm(false)
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add scene')
    } finally {
      setIsAddingScene(false)
    }
  }

  function handleDragStart(e: React.DragEvent, sceneId: string) {
    setDraggedSceneId(sceneId)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', sceneId)
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (draggedSceneId) {
      setDragOverIndex(index)
    }
  }

  async function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault()
    setDragOverIndex(null)

    const sceneId = draggedSceneId
    setDraggedSceneId(null)
    if (!sceneId) return

    const draggedIndex = filteredScenes.findIndex((s) => s.id === sceneId)
    if (draggedIndex === -1 || draggedIndex === dropIndex) return

    let newOrder: number
    if (dropIndex === 0) {
      newOrder = filteredScenes[0].order - 1
    } else if (dropIndex >= filteredScenes.length) {
      newOrder = filteredScenes[filteredScenes.length - 1].order + 1
    } else {
      // Dropped between dropIndex-1 and dropIndex
      const prev = filteredScenes[dropIndex - 1]
      const next = filteredScenes[dropIndex]
      newOrder = (prev.order + next.order) / 2
    }

    setError(null)
    try {
      await reorderScene({ data: { sceneId, newOrder } })
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder scene')
    }
  }

  function handleDragEnd() {
    setDraggedSceneId(null)
    setDragOverIndex(null)
  }

  return (
    <div className="flex-1 flex min-h-0">
      {/* Scene list */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Storyboard
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {projectSettings?.intake?.audience && (
                <Badge variant="outline">Audience: {projectSettings.intake.audience}</Badge>
              )}
              {projectSettings?.intake?.viewerAction && (
                <Badge variant="outline">Goal: {projectSettings.intake.viewerAction}</Badge>
              )}
              {totalDuration > 0 && (
                <Badge variant="outline" className="gap-1">
                  <Timer size={11} /> {totalDuration}s total
                </Badge>
              )}
              {storyScenes.length > 0 && (
                <Badge variant="outline" className={`gap-1 ${allReady ? 'text-emerald-600 border-emerald-600/30' : ''}`}>
                  <CheckCircle2 size={11} />
                  {readyCount} / {storyScenes.length} scenes ready
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={isExporting}
              onClick={() => handleExport('markdown')}
              className="gap-1.5"
            >
              <Download size={12} />
              Export .md
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isExporting}
              onClick={() => handleExport('json')}
              className="gap-1.5"
            >
              <Download size={12} />
              Export .json
            </Button>
            <ResetDialog isResetting={isResetting} onConfirm={handleReset} />
          </div>
        </div>

        {uniqueReasons.length > 0 && (
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filter by asset reason:</span>
            <select
              value={reasonFilter}
              onChange={(e) => setReasonFilter(e.target.value)}
              className="h-8 rounded-md border border-border bg-card px-2 text-xs"
            >
              <option value="all">All</option>
              {uniqueReasons.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 mb-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="ml-auto text-destructive/50 hover:text-destructive"
            >
              ✕
            </button>
          </div>
        )}

        <div className="grid gap-3">
          {filteredScenes.map((scene, i) => (
            <div key={scene.id}>
              {/* Drop indicator before this card */}
              {dragOverIndex === i && draggedSceneId !== scene.id && (
                <div className="h-0.5 bg-primary rounded-full mb-2 mx-2 transition-all" />
              )}
              <StoryboardCard
                scene={scene}
                index={i}
                plan={planBySceneId.get(scene.id)}
                reasons={reasonMap[scene.id] ?? []}
                imageAssets={assetsBySceneId.get(scene.id) ?? []}
                isSelected={scene.id === selectedSceneId}
                isDragging={draggedSceneId === scene.id}
                onSelect={() =>
                  setSelectedSceneId(scene.id === selectedSceneId ? null : scene.id)
                }
                onDelete={() => handleDeleteScene(scene.id)}
                onDragStart={(e) => handleDragStart(e, scene.id)}
                onDragOver={(e) => handleDragOver(e, i)}
                onDrop={(e) => handleDrop(e, i)}
                onDragEnd={handleDragEnd}
              />
            </div>
          ))}
          {/* Drop indicator at the end */}
          {dragOverIndex !== null && dragOverIndex >= filteredScenes.length && (
            <div className="h-0.5 bg-primary rounded-full mx-2 transition-all" />
          )}
          {/* Drop zone at the end of the list */}
          {draggedSceneId && (
            <div
              className="h-12"
              onDragOver={(e) => {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setDragOverIndex(filteredScenes.length)
              }}
              onDrop={(e) => handleDrop(e, filteredScenes.length)}
            />
          )}
        </div>

        {/* Add Scene */}
        <div className="mt-4">
          {showAddForm ? (
            <div className="bg-card rounded-xl border-2 border-dashed border-border p-4 space-y-3">
              <textarea
                value={newSceneDescription}
                onChange={(e) => setNewSceneDescription(e.target.value)}
                placeholder="Describe the new scene..."
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={isAddingScene || !newSceneDescription.trim()}
                  onClick={handleAddScene}
                  className="gap-1.5"
                >
                  <Plus size={12} />
                  {isAddingScene ? 'Adding...' : 'Add'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isAddingScene}
                  onClick={() => {
                    setShowAddForm(false)
                    setNewSceneDescription('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full border-dashed gap-1.5"
              onClick={() => setShowAddForm(true)}
            >
              <Plus size={14} />
              Add Scene
            </Button>
          )}
        </div>
      </div>

      {/* Full-screen studio — key forces remount on scene change */}
      {selectedScene && (
        <SceneImageStudio
          key={selectedScene.id}
          scene={selectedScene}
          sceneIndex={storyScenes.indexOf(selectedScene)}
          allScenes={storyScenes}
          allAssets={sceneAssets}
          scenePlan={planBySceneId}
          projectId={projectId}
          projectSettings={projectSettings}
          sceneVersions={projectSettings?.sceneVersions?.[selectedScene.id] ?? []}
          sceneAssets={assetsBySceneId.get(selectedScene.id) ?? []}
          onSceneChange={setSelectedSceneId}
          onClose={() => setSelectedSceneId(null)}
        />
      )}
    </div>
  )
}

