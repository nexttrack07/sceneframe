import { useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import {
  AlertCircle,
  ChevronRight,
  Film,
  Image as ImageIcon,
  Video,
  Music,
  Download,
  Timer,
} from 'lucide-react'
import type { Scene } from '@/db/schema'
import type { ProjectSettings, SceneAssetSummary, ScenePlanEntry } from '../project-actions'
import { exportProjectHandoff, resetWorkshop } from '../project-actions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SceneDetailPanel } from './scene-detail-panel'
import { ResetDialog } from './reset-dialog'

const PIPELINE_STAGES = [
  { key: 'script', label: 'Script', icon: Film },
  { key: 'images', label: 'Images', icon: ImageIcon },
  { key: 'video', label: 'Video', icon: Video },
  { key: 'audio', label: 'Audio', icon: Music },
] as const

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

  const selectedScene = storyScenes.find((s) => s.id === selectedSceneId) ?? null
  const reasonMap = projectSettings?.assetDecisionReasons ?? {}
  const uniqueReasons = Array.from(new Set(Object.values(reasonMap).flat()))
  const planBySceneId = new Map(storyScenes.map((scene, i) => [scene.id, scenePlan[i]]))
  const assetsBySceneId = useMemo(() => {
    const grouped = new Map<string, SceneAssetSummary[]>()
    for (const asset of sceneAssets) {
      const existing = grouped.get(asset.sceneId) ?? []
      existing.push(asset)
      grouped.set(asset.sceneId, existing)
    }
    return grouped
  }, [sceneAssets])

  const filteredScenes =
    reasonFilter === 'all'
      ? storyScenes
      : storyScenes.filter((s) => (reasonMap[s.id] ?? []).includes(reasonFilter))

  const totalDuration = scenePlan.reduce((sum, scene) => sum + (scene.durationSec ?? 0), 0)

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
            <StoryboardCard
              key={scene.id}
              scene={scene}
              index={i}
              plan={planBySceneId.get(scene.id)}
              reasons={reasonMap[scene.id] ?? []}
              imageAssets={assetsBySceneId.get(scene.id) ?? []}
              isSelected={scene.id === selectedSceneId}
              onSelect={() =>
                setSelectedSceneId(scene.id === selectedSceneId ? null : scene.id)
              }
            />
          ))}
        </div>
      </div>

      {/* Scene detail panel — key forces remount on scene change */}
      {selectedScene && (
        <SceneDetailPanel
          key={selectedScene.id}
          scene={selectedScene}
          plan={planBySceneId.get(selectedScene.id)}
          sceneVersions={projectSettings?.sceneVersions?.[selectedScene.id] ?? []}
          decisionReasons={reasonMap[selectedScene.id] ?? []}
          sceneAssets={assetsBySceneId.get(selectedScene.id) ?? []}
          onClose={() => setSelectedSceneId(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Storyboard card
// ---------------------------------------------------------------------------

function StoryboardCard({
  scene,
  index,
  plan,
  reasons,
  imageAssets,
  isSelected,
  onSelect,
}: {
  scene: Scene
  index: number
  plan?: ScenePlanEntry
  reasons: string[]
  imageAssets: SceneAssetSummary[]
  isSelected: boolean
  onSelect: () => void
}) {
  const currentStageIndex = PIPELINE_STAGES.findIndex((s) => s.key === scene.stage)
  const selectedStart = imageAssets.some((asset) => asset.type === 'start_image' && asset.isSelected)
  const selectedEnd = imageAssets.some((asset) => asset.type === 'end_image' && asset.isSelected)
  const imageStatusLabel = selectedStart && selectedEnd
    ? 'Ready for video'
    : imageAssets.length > 0
      ? 'Has candidates'
      : 'Needs images'
  const imageStatusTone = selectedStart && selectedEnd ? 'text-success' : 'text-muted-foreground'

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left bg-card rounded-xl border-2 p-4 transition-all hover:shadow-md ${
        isSelected ? 'border-primary shadow-md' : 'border-border hover:border-border/80'
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Scene number */}
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-muted-foreground">{index + 1}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {scene.title && (
            <p className="font-semibold text-foreground text-sm mb-0.5">{scene.title}</p>
          )}
          {plan?.beat && (
            <p className="text-[11px] text-primary font-medium mb-0.5">Beat: {plan.beat}</p>
          )}
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">
            {scene.description}
          </p>
          {plan?.durationSec ? (
            <p className="text-xs text-muted-foreground mt-1">Estimated: {plan.durationSec}s</p>
          ) : null}
          <p className={`text-xs mt-1 ${imageStatusTone}`}>
            Images: {imageStatusLabel}
          </p>
          {reasons.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {reasons.map((r) => (
                <Badge key={r} variant="outline" className="text-[10px]">
                  {r}
                </Badge>
              ))}
            </div>
          )}

          {/* Pipeline progress */}
          <div className="flex items-center gap-3 mt-3">
            {PIPELINE_STAGES.map((stage, i) => {
              const isDone = i <= currentStageIndex
              const Icon = stage.icon
              return (
                <div key={stage.key} className="flex items-center gap-1">
                  <Icon size={12} className={isDone ? 'text-primary' : 'text-muted-foreground/50'} />
                  <span
                    className={`text-xs ${isDone ? 'text-primary font-medium' : 'text-muted-foreground/70'}`}
                  >
                    {stage.label}
                  </span>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <ChevronRight size={10} className="text-muted-foreground/50 ml-1" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </button>
  )
}
