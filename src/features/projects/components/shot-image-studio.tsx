import { useEffect, useMemo, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import type { Scene, Shot } from '@/db/schema'
import type { ImageDefaults, SceneAssetSummary } from '../project-types'
import { normalizeImageDefaults } from '../project-normalize'
import { deleteAsset, generateShotImages, generateShotImagePrompt, generateShotVideo, generateShotVideoPrompt, pollVideoAsset, selectShotAsset } from '../scene-actions'
import { useToast } from '@/components/ui/toast'
import { ShotStudioHeader } from './studio/shot-studio-header'
import { ShotStudioLeftPanel } from './studio/shot-studio-left-panel'
import { StudioGallery } from './studio/studio-gallery'

export function ShotImageStudio({
  shot,
  shotIndex,
  parentScene,
  allShots,
  shotAssets,
  allAssets,
  onShotChange,
  onClose,
}: {
  shot: Shot
  shotIndex: number
  parentScene: Scene
  allShots: Shot[]
  shotAssets: SceneAssetSummary[]
  allAssets: SceneAssetSummary[]
  onShotChange: (shotId: string) => void
  onClose: () => void
}) {
  const router = useRouter()
  const { toast } = useToast()

  // Single prompt state
  const [prompt, setPrompt] = useState(shot.imagePrompt ?? '')

  // Prompt context mode (affects Generate Prompt only)
  const [promptMode, setPromptMode] = useState<'start' | 'end'>('start')

  // Default settings from most recent asset's modelSettings, fallback to app defaults
  const lastAssetSettings = useMemo(() => {
    const sorted = [...shotAssets]
      .filter((a) => a.status === 'done' && a.modelSettings)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return sorted[0]?.modelSettings ?? null
  }, [shotAssets])

  const [settingsOverrides, setSettingsOverrides] = useState<ImageDefaults>(
    normalizeImageDefaults(lastAssetSettings),
  )
  const [expandedImageId, setExpandedImageId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const [isSelectingAssetId, setIsSelectingAssetId] = useState<string | null>(null)
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  const selectedAsset = shotAssets.find((a) => a.isSelected && a.status === 'done')
  const selectedImageUrl = selectedAsset?.url ?? null

  const [videoPrompt, setVideoPrompt] = useState('')
  const [isGeneratingVideoPrompt, setIsGeneratingVideoPrompt] = useState(false)
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)
  const [videoMode, setVideoMode] = useState<'standard' | 'pro'>('pro')
  const [generateAudio, setGenerateAudio] = useState(false)

  // Reset local state when shot changes (state-based navigation, no key remount)
  useEffect(() => {
    setPrompt(shot.imagePrompt ?? '')
    setPromptMode('start')
    setSettingsOverrides(normalizeImageDefaults(lastAssetSettings))
    setExpandedImageId(null)
    setIsGenerating(false)
    setIsGeneratingPrompt(false)
    setIsSelectingAssetId(null)
    setDeletingAssetId(null)
    setError(null)
    setVideoPrompt('')
    setIsGeneratingVideoPrompt(false)
    setIsGeneratingVideo(false)
  }, [shot.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function handlePromptModeChange(mode: 'start' | 'end') {
    setPromptMode(mode)
    setPrompt('')
  }

  // Keyboard shortcuts — guard for lightbox, contentEditable, and inputs
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      if (isLightboxOpen) return

      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        const idx = allShots.findIndex((s) => s.id === shot.id)
        if (idx > 0) onShotChange(allShots[idx - 1].id)
      } else if (e.key === 'ArrowRight') {
        const idx = allShots.findIndex((s) => s.id === shot.id)
        if (idx < allShots.length - 1) onShotChange(allShots[idx + 1].id)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shot.id, allShots, onShotChange, onClose, isLightboxOpen])

  async function handleGenerate() {
    const promptOverride = prompt.trim()
    setIsGenerating(true)
    setError(null)
    try {
      const result = await generateShotImages({
        data: {
          shotId: shot.id,
          lane: promptMode,
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
      const result = await generateShotImagePrompt({
        data: {
          shotId: shot.id,
          lane: promptMode,
        },
      })
      setPrompt(result.prompt)
      await router.invalidate()
      toast('Prompt generated', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate prompt'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setIsGeneratingPrompt(false)
    }
  }

  async function handleGenerateVideoPrompt() {
    setIsGeneratingVideoPrompt(true)
    setError(null)
    try {
      const result = await generateShotVideoPrompt({ data: { shotId: shot.id } })
      setVideoPrompt(result.prompt)
      toast('Video prompt generated', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate video prompt'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setIsGeneratingVideoPrompt(false)
    }
  }

  async function handleGenerateVideo() {
    const trimmedPrompt = videoPrompt.trim()
    if (!trimmedPrompt) return
    setIsGeneratingVideo(true)
    setError(null)
    try {
      const { assetId } = await generateShotVideo({ data: { shotId: shot.id, prompt: trimmedPrompt, mode: videoMode, generateAudio } })
      // Poll until Replicate finishes — avoids serverless timeout and keeps studio open
      await new Promise<void>((resolve, reject) => {
        const interval = setInterval(async () => {
          try {
            const result = await pollVideoAsset({ data: { assetId } })
            if (result.status === 'done') {
              clearInterval(interval)
              resolve()
            } else if (result.status === 'error') {
              clearInterval(interval)
              reject(new Error(result.errorMessage ?? 'Video generation failed'))
            }
          } catch (pollErr) {
            clearInterval(interval)
            reject(pollErr)
          }
        }, 5000)
      })
      await router.invalidate()
      toast('Video generated', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate video'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setIsGeneratingVideo(false)
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
      await selectShotAsset({ data: { assetId } })
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

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
      <ShotStudioHeader
        shot={shot}
        shotIndex={shotIndex}
        parentScene={parentScene}
        allShots={allShots}
        allAssets={allAssets}
        onShotChange={onShotChange}
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
        <ShotStudioLeftPanel
          shot={shot}
          parentScene={parentScene}
          promptMode={promptMode}
          onPromptModeChange={handlePromptModeChange}
          prompt={prompt}
          onPromptChange={setPrompt}
          onGeneratePrompt={handleGeneratePrompt}
          isGeneratingPrompt={isGeneratingPrompt}
          settingsOverrides={settingsOverrides}
          onSettingsChange={setSettingsOverrides}
          isGenerating={isGenerating}
          onGenerate={handleGenerate}
          selectedImageUrl={selectedImageUrl}
          videoPrompt={videoPrompt}
          onVideoPromptChange={setVideoPrompt}
          onGenerateVideoPrompt={handleGenerateVideoPrompt}
          isGeneratingVideoPrompt={isGeneratingVideoPrompt}
          isGeneratingVideo={isGeneratingVideo}
          onGenerateVideo={handleGenerateVideo}
          videoMode={videoMode}
          onVideoModeChange={setVideoMode}
          generateAudio={generateAudio}
          onGenerateAudioChange={setGenerateAudio}
        />

        <StudioGallery
          sceneAssets={shotAssets}
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
