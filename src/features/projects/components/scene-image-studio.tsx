import { useEffect, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { Scene } from '@/db/schema'
import type { ImageDefaults, ProjectSettings, SceneAssetSummary, ScenePlanEntry } from '../project-types'
import { DEFAULT_IMAGE_DEFAULTS } from '../project-constants'
import { deleteAsset, generateImagePrompt, generateSceneImages, selectAsset } from '../scene-actions'
import { useToast } from '@/components/ui/toast'
import { StudioHeader } from './studio/studio-header'
import { StudioLeftPanel } from './studio/studio-left-panel'
import { StudioGallery } from './studio/studio-gallery'

function makeDefaultPrompt(description: string, lane: 'start' | 'end'): string {
  if (lane === 'start') {
    return `Start frame: ${description}\nFocus on the opening moment of this scene.`
  }
  return `End frame: ${description}\nFocus on the closing moment of this scene.`
}

export function SceneImageStudio({
  scene,
  sceneIndex,
  allScenes,
  allAssets,
  scenePlan,
  projectId,
  projectSettings,
  sceneVersions,
  sceneAssets,
  onSceneChange,
  onClose,
}: {
  scene: Scene
  sceneIndex: number
  allScenes: Scene[]
  allAssets: SceneAssetSummary[]
  scenePlan: Map<string, ScenePlanEntry | undefined>
  projectId: string
  projectSettings: ProjectSettings | null
  sceneVersions: import('../project-types').SceneVersionEntry[]
  sceneAssets: SceneAssetSummary[]
  onSceneChange: (sceneId: string) => void
  onClose: () => void
}) {
  const router = useRouter()
  const { toast } = useToast()

  // Lane state
  const [activeLane, setActiveLane] = useState<'start' | 'end'>('start')
  const [startPrompt, setStartPrompt] = useState(makeDefaultPrompt(scene.description, 'start'))
  const [endPrompt, setEndPrompt] = useState(makeDefaultPrompt(scene.description, 'end'))
  const [settingsOverrides, setSettingsOverrides] = useState<ImageDefaults>(
    projectSettings?.imageDefaults ?? DEFAULT_IMAGE_DEFAULTS,
  )
  const [expandedImageId, setExpandedImageId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const [isSelectingAssetId, setIsSelectingAssetId] = useState<string | null>(null)
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  const prompt = activeLane === 'start' ? startPrompt : endPrompt
  const setPrompt = activeLane === 'start' ? setStartPrompt : setEndPrompt

  // Fix #7: clear expanded image when switching lanes
  function handleLaneChange(lane: 'start' | 'end') {
    setActiveLane(lane)
    setExpandedImageId(null)
  }

  // Fix #6: sync prompts when description changes (e.g. after save in SceneContextSection)
  function handleDescriptionSaved(newDescription: string) {
    setStartPrompt(makeDefaultPrompt(newDescription, 'start'))
    setEndPrompt(makeDefaultPrompt(newDescription, 'end'))
  }

  // Fix #4: keyboard shortcuts — guard for lightbox, contentEditable, and inputs
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      // Don't intercept keys when lightbox is open — lightbox has its own handlers
      if (isLightboxOpen) return

      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        const idx = allScenes.findIndex((s) => s.id === scene.id)
        if (idx > 0) onSceneChange(allScenes[idx - 1].id)
      } else if (e.key === 'ArrowRight') {
        const idx = allScenes.findIndex((s) => s.id === scene.id)
        if (idx < allScenes.length - 1) onSceneChange(allScenes[idx + 1].id)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [scene.id, allScenes, onSceneChange, onClose, isLightboxOpen])

  async function handleGenerate() {
    const promptOverride = (activeLane === 'start' ? startPrompt : endPrompt).trim()
    setIsGenerating(true)
    setError(null)
    try {
      const result = await generateSceneImages({
        data: {
          sceneId: scene.id,
          lane: activeLane,
          promptOverride: promptOverride || undefined,
          settingsOverrides,
        },
      })
      await router.invalidate()
      toast(`Generated ${result.completedCount} image${result.completedCount !== 1 ? 's' : ''}${result.failedCount > 0 ? ` (${result.failedCount} failed)` : ''}`, result.failedCount > 0 ? 'error' : 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate images'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleGeneratePrompt() {
    setIsGeneratingPrompt(true)
    setError(null)
    try {
      const result = await generateImagePrompt({
        data: {
          sceneId: scene.id,
          lane: activeLane,
          currentPrompt: prompt.trim() || undefined,
        },
      })
      setPrompt(result.prompt)
      toast('Prompt generated', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate prompt'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setIsGeneratingPrompt(false)
    }
  }

  async function handleDeleteAsset(assetId: string) {
    setDeletingAssetId(assetId)
    setError(null)
    try {
      await deleteAsset({ data: { assetId } })
      if (expandedImageId === assetId) setExpandedImageId(null)
      await router.invalidate()
      toast('Image deleted', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete image'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setDeletingAssetId(null)
    }
  }

  async function handleSelectAsset(assetId: string) {
    setIsSelectingAssetId(assetId)
    setError(null)
    try {
      await selectAsset({ data: { assetId } })
      await router.invalidate()
      toast('Image selected', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to select image'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setIsSelectingAssetId(null)
    }
  }

  // No polling needed here — generateSceneImages blocks until all images complete,
  // so router.invalidate() after handleGenerate resolves is sufficient.

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
      <StudioHeader
        scene={scene}
        sceneIndex={sceneIndex}
        allScenes={allScenes}
        allAssets={allAssets}
        projectId={projectId}
        projectSettings={projectSettings}
        onSceneChange={onSceneChange}
        onClose={onClose}
      />

      {/* Error bar */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-destructive/50 hover:text-destructive text-xs"
          >
            dismiss
          </button>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <StudioLeftPanel
          scene={scene}
          plan={scenePlan.get(scene.id)}
          sceneVersions={sceneVersions}
          sceneAssets={sceneAssets}
          projectSettings={projectSettings}
          activeLane={activeLane}
          onLaneChange={handleLaneChange}
          prompt={prompt}
          onPromptChange={setPrompt}
          onGeneratePrompt={handleGeneratePrompt}
          isGeneratingPrompt={isGeneratingPrompt}
          settingsOverrides={settingsOverrides}
          onSettingsChange={setSettingsOverrides}
          isGenerating={isGenerating}
          onGenerate={handleGenerate}
          onDescriptionSaved={handleDescriptionSaved}
        />

        <StudioGallery
          sceneAssets={sceneAssets}
          activeLane={activeLane}
          selectingAssetId={isSelectingAssetId}
          deletingAssetId={deletingAssetId}
          onSelectAsset={handleSelectAsset}
          onDeleteAsset={handleDeleteAsset}
          onRegenerate={handleGenerate}
          expandedImageId={expandedImageId}
          onExpandImage={setExpandedImageId}
          onLightboxChange={setIsLightboxOpen}
        />
      </div>
    </div>
  )
}
