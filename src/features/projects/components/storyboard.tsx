import { useEffect, useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  AlertCircle,
  Download,
  Timer,
  CheckCircle2,
  Plus,
  Info,
} from 'lucide-react'
import type { Scene, Shot } from '@/db/schema'
import type { ProjectSettings, SceneAssetSummary, ScenePlanEntry, TransitionVideoSummary } from '../project-types'
import { exportProjectHandoff } from '../project-queries'
import { resetWorkshop } from '../project-mutations'
import { reorderScene, addScene, deleteScene, addShot, deleteShot } from '../scene-actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SceneImageStudio } from './scene-image-studio'
import { ShotImageStudio } from './shot-image-studio'
import { ResetDialog } from './reset-dialog'
import { StoryboardCard } from './storyboard-card'
import { ShotCard } from './shot-card'
import { SceneHeader } from './scene-header'
import { TransitionConnector } from './transition-connector'

function formatTimestamp(seconds: number | null): string {
  if (seconds == null) return '--:--'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

export function Storyboard({
  projectId,
  scenes: storyScenes,
  shots: storyShots,
  assets: sceneAssets,
  projectSettings,
  scenePlan,
  transitionVideos,
}: {
  projectId: string
  scenes: Scene[]
  shots: Shot[]
  assets: SceneAssetSummary[]
  projectSettings: ProjectSettings | null
  scenePlan: ScenePlanEntry[]
  transitionVideos: TransitionVideoSummary[]
}) {
  const router = useRouter()
  const [isResetting, setIsResetting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  // Drag-to-reorder state
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Add scene form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSceneDescription, setNewSceneDescription] = useState('')
  const [isAddingScene, setIsAddingScene] = useState(false)

  const hasShotsMode = storyShots.length > 0

  // Collapse state: scenes with >10 shots start collapsed
  const [collapseState, setCollapseState] = useState<Map<string, boolean>>(() => {
    const initial = new Map<string, boolean>()
    if (hasShotsMode) {
      const shotsByScene = new Map<string, number>()
      for (const shot of storyShots) {
        shotsByScene.set(shot.sceneId, (shotsByScene.get(shot.sceneId) ?? 0) + 1)
      }
      for (const scene of storyScenes) {
        const count = shotsByScene.get(scene.id) ?? 0
        if (count > 10) initial.set(scene.id, true)
      }
    }
    return initial
  })

  const selectedScene = storyScenes.find((s) => s.id === selectedSceneId) ?? null
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

  const shotsBySceneId = useMemo(() => {
    const grouped = new Map<string, Shot[]>()
    for (const shot of storyShots) {
      const existing = grouped.get(shot.sceneId) ?? []
      existing.push(shot)
      grouped.set(shot.sceneId, existing)
    }
    return grouped
  }, [storyShots])

  const assetsByShotId = useMemo(() => {
    const grouped = new Map<string, SceneAssetSummary[]>()
    for (const asset of sceneAssets) {
      if (asset.shotId) {
        const existing = grouped.get(asset.shotId) ?? []
        existing.push(asset)
        grouped.set(asset.shotId, existing)
      }
    }
    return grouped
  }, [sceneAssets])

  const hasGeneratingAssets = sceneAssets.some((asset) => asset.status === 'generating')

  // Suppress polling while studio is open — studio manages its own invalidation
  useEffect(() => {
    if (!hasGeneratingAssets) return
    if (selectedSceneId !== null || selectedShotId !== null) return
    const interval = setInterval(() => {
      void router.invalidate()
    }, 2500)
    return () => clearInterval(interval)
  }, [hasGeneratingAssets, selectedSceneId, selectedShotId, router])

  const filteredScenes = storyScenes

  const totalDuration = hasShotsMode
    ? storyShots.reduce((sum, shot) => sum + shot.durationSec, 0)
    : scenePlan.reduce((sum, scene) => sum + (scene.durationSec ?? 0), 0)

  // Progress: shot-based or scene-based
  const { readyCount, totalCount, allReady } = useMemo(() => {
    if (hasShotsMode) {
      const count = storyShots.filter((shot) => {
        const shotAssets = assetsByShotId.get(shot.id) ?? []
        return shotAssets.some((a) => a.isSelected)
      }).length
      return {
        readyCount: count,
        totalCount: storyShots.length,
        allReady: count === storyShots.length && storyShots.length > 0,
      }
    }
    const count = storyScenes.filter((scene) => {
      const sceneAssetList = assetsBySceneId.get(scene.id) ?? []
      return sceneAssetList.some((a) => a.isSelected)
    }).length
    return {
      readyCount: count,
      totalCount: storyScenes.length,
      allReady: count === storyScenes.length && storyScenes.length > 0,
    }
  }, [hasShotsMode, storyShots, storyScenes, assetsByShotId, assetsBySceneId])

  // Build global shot index map
  const globalShotIndex = useMemo(() => {
    const indexMap = new Map<string, number>()
    let counter = 1
    for (const scene of storyScenes) {
      const shots = shotsBySceneId.get(scene.id) ?? []
      for (const shot of shots) {
        indexMap.set(shot.id, counter++)
      }
    }
    return indexMap
  }, [storyScenes, shotsBySceneId])

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
      if (selectedSceneId === sceneId) {
        setSelectedSceneId(null)
        setSelectedShotId(null)
      }
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete scene')
    }
  }

  async function handleDeleteShot(shotId: string) {
    setError(null)
    try {
      await deleteShot({ data: { shotId } })
      if (selectedShotId === shotId) {
        setSelectedShotId(null)
        setSelectedSceneId(null)
      }
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete shot')
    }
  }

  async function handleAddShot(sceneId: string) {
    setError(null)
    try {
      const sceneShots = shotsBySceneId.get(sceneId) ?? []
      const afterOrder = sceneShots.length > 0 ? sceneShots[sceneShots.length - 1].order : 0
      await addShot({
        data: {
          sceneId,
          description: 'New shot',
          shotType: 'visual',
          afterOrder,
        },
      })
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add shot')
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

  function handleShotSelect(shot: Shot) {
    setSelectedShotId(shot.id)
    setSelectedSceneId(null)
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

  function toggleCollapse(sceneId: string) {
    setCollapseState((prev) => {
      const next = new Map(prev)
      next.set(sceneId, !prev.get(sceneId))
      return next
    })
  }

  function getSceneTimeRange(sceneId: string): string {
    const shots = shotsBySceneId.get(sceneId) ?? []
    if (shots.length === 0) return ''
    const first = shots[0]
    const last = shots[shots.length - 1]
    return `${formatTimestamp(first.timestampStart)}-${formatTimestamp(last.timestampEnd)}`
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
              {totalCount > 0 && (
                <Badge variant="outline" className={`gap-1 ${allReady ? 'text-emerald-600 border-emerald-600/30' : ''}`}>
                  <CheckCircle2 size={11} />
                  {hasShotsMode
                    ? `${readyCount} / ${totalCount} shots have selected images`
                    : `${readyCount} / ${totalCount} scenes ready`}
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

        {/* Legacy banner when no shots exist */}
        {!hasShotsMode && storyScenes.length > 0 && (
          <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-muted/50 border border-border text-sm text-muted-foreground">
            <Info size={14} className="shrink-0" />
            <span>
              This project uses the legacy scene layout. Re-approve the script to generate shots.
            </span>
          </div>
        )}

        {hasShotsMode ? (
          /* ---- Shot-based layout: shots grouped under collapsible scenes ---- */
          <div className="space-y-4">
            {filteredScenes.map((scene, i) => {
              const sceneShots = shotsBySceneId.get(scene.id) ?? []
              const isCollapsed = collapseState.get(scene.id) ?? false

              return (
                <div key={scene.id}>
                  {/* Drop indicator before this scene */}
                  {dragOverIndex === i && draggedSceneId !== scene.id && (
                    <div className="h-0.5 bg-primary rounded-full mb-2 mx-2 transition-all" />
                  )}

                  <SceneHeader
                    scene={scene}
                    sceneIndex={i}
                    shotCount={sceneShots.length}
                    timeRange={getSceneTimeRange(scene.id)}
                    isCollapsed={isCollapsed}
                    onToggleCollapse={() => toggleCollapse(scene.id)}
                    onDelete={() => handleDeleteScene(scene.id)}
                    onDragStart={(e) => handleDragStart(e, scene.id)}
                    onDragOver={(e) => handleDragOver(e, i)}
                    onDrop={(e) => handleDrop(e, i)}
                    onDragEnd={handleDragEnd}
                  />

                  {!isCollapsed && (
                    <div className="ml-6 mt-2 space-y-2">
                      {sceneShots.map((shot, shotIdx) => {
                        const nextShot = sceneShots[shotIdx + 1] ?? null
                        return (
                          <div key={shot.id}>
                            <ShotCard
                              shot={shot}
                              globalIndex={globalShotIndex.get(shot.id) ?? 0}
                              assets={assetsByShotId.get(shot.id) ?? []}
                              isSelected={selectedShotId === shot.id}
                              onSelect={() => handleShotSelect(shot)}
                              onDelete={() => handleDeleteShot(shot.id)}
                            />
                            {nextShot && (
                              <TransitionConnector
                                fromShot={shot}
                                toShot={nextShot}
                                fromShotAssets={assetsByShotId.get(shot.id) ?? []}
                                toShotAssets={assetsByShotId.get(nextShot.id) ?? []}
                                transitionVideos={transitionVideos.filter(
                                  (tv) => tv.sceneId === scene.id,
                                )}
                              />
                            )}
                          </div>
                        )
                      })}

                      {/* Add Shot button */}
                      <button
                        type="button"
                        onClick={() => handleAddShot(scene.id)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md hover:border-border/80 transition-colors"
                      >
                        <Plus size={12} />
                        Add Shot
                      </button>
                    </div>
                  )}
                </div>
              )
            })}

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
        ) : (
          /* ---- Legacy scene-card layout ---- */
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
        )}

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

      {/* Full-screen shot studio */}
      {selectedShotId && (() => {
        const selectedShot = storyShots.find((s) => s.id === selectedShotId)
        if (!selectedShot) return null
        const shotParentScene = storyScenes.find((s) => s.id === selectedShot.sceneId)
        if (!shotParentScene) return null
        const shotIdx = storyShots.indexOf(selectedShot)
        return (
          <ShotImageStudio
            shot={selectedShot}
            shotIndex={shotIdx}
            parentScene={shotParentScene}
            allShots={storyShots}
            shotAssets={assetsByShotId.get(selectedShot.id) ?? []}
            allAssets={sceneAssets}
            onShotChange={(id) => setSelectedShotId(id)}
            onClose={() => {
              setSelectedShotId(null)
              setSelectedSceneId(null)
            }}
          />
        )
      })()}

      {/* Full-screen scene studio (legacy — no shots) */}
      {selectedScene && !selectedShotId && (
        <SceneImageStudio
          key={selectedScene.id}
          scene={selectedScene}
          sceneIndex={storyScenes.indexOf(selectedScene)}
          allScenes={storyScenes}
          allAssets={sceneAssets}
          scenePlan={planBySceneId}
          sceneAssets={assetsBySceneId.get(selectedScene.id) ?? []}
          onSceneChange={setSelectedSceneId}
          onClose={() => {
            setSelectedSceneId(null)
            setSelectedShotId(null)
          }}
        />
      )}
    </div>
  )
}
