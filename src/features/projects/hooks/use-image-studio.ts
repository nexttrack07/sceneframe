import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Shot } from '@/db/schema'
import type { ImageDefaults, SceneAssetSummary } from '../project-types'
import { generateShotImages, generateShotImagePrompt, enhanceShotImagePrompt, selectShotAsset, deleteAsset } from '../scene-actions'
import { normalizeImageDefaults } from '../project-normalize'
import { projectKeys } from '../query-keys'

type ToastFn = (message: string, variant: 'success' | 'error') => void

export function useImageStudio({
  projectId,
  selectedShotId,
  storyShots,
  assetsByShotId,
  toast,
  setError,
}: {
  projectId: string
  selectedShotId: string | null
  storyShots: Shot[]
  assetsByShotId: Map<string, SceneAssetSummary[]>
  toast: ToastFn
  setError: (msg: string | null) => void
}) {
  const queryClient = useQueryClient()
  const [prompt, setPrompt] = useState('')
  const [settingsOverrides, setSettingsOverrides] = useState<ImageDefaults>(normalizeImageDefaults(null))
  const [isGenerating, setIsGenerating] = useState(false)
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false)
  const [isSelectingAssetId, setIsSelectingAssetId] = useState<string | null>(null)
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)
  const [expandedImageId, setExpandedImageId] = useState<string | null>(null)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [useRefImage, setUseRefImage] = useState(false)
  const [useProjectContext, setUseProjectContext] = useState(true)
  const [usePrevShotContext, setUsePrevShotContext] = useState(true)

  // Expose reset for use when selecting a shot
  const resetForShot = (useRefImageReset = false) => {
    setUseRefImage(useRefImageReset)
    setUseProjectContext(true)
    setUsePrevShotContext(true)
  }

  // Reset image studio state when selected shot changes
  useEffect(() => {
    if (!selectedShotId) return
    const shot = storyShots.find((s) => s.id === selectedShotId)
    const shotAssets = assetsByShotId.get(selectedShotId) ?? []
    const lastAssetSettings =
      [...shotAssets]
        .filter((a) => a.status === 'done' && a.modelSettings)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
        ?.modelSettings ?? null
    setPrompt(shot?.imagePrompt ?? '')
    setSettingsOverrides(normalizeImageDefaults(lastAssetSettings))
    setExpandedImageId(null)
    setIsGenerating(false)
    setIsGeneratingPrompt(false)
    setIsSelectingAssetId(null)
    setDeletingAssetId(null)
  }, [selectedShotId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Previous shot for reference image
  const selectedShot = selectedShotId ? storyShots.find((s) => s.id === selectedShotId) ?? null : null
  const prevShot = selectedShot
    ? (() => {
        const idx = storyShots.findIndex((s) => s.id === selectedShot.id)
        return idx > 0 ? storyShots[idx - 1] : null
      })()
    : null
  const prevShotSelectedImageUrl = prevShot
    ? (assetsByShotId.get(prevShot.id) ?? []).find((a) => a.isSelected && a.status === 'done')?.url ?? null
    : null

  async function handleGenerate() {
    if (!selectedShotId) return
    const promptOverride = prompt.trim()
    setIsGenerating(true)
    setError(null)
    try {
      const result = await generateShotImages({
        data: {
          shotId: selectedShotId,
          lane: 'start',
          promptOverride: promptOverride || undefined,
          settingsOverrides,
          referenceImageUrls: useRefImage && prevShotSelectedImageUrl ? [prevShotSelectedImageUrl] : [],
        },
      })
      await queryClient.invalidateQueries({ queryKey: projectKeys.project(projectId) })
      toast(
        `Generated ${result.completedCount} image${result.completedCount !== 1 ? 's' : ''}${result.failedCount > 0 ? ` (${result.failedCount} failed)` : ''}`,
        result.failedCount > 0 ? 'error' : 'success',
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate images'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleGeneratePrompt() {
    if (!selectedShotId) return
    setIsGeneratingPrompt(true)
    setError(null)
    try {
      const result = await generateShotImagePrompt({
        data: { shotId: selectedShotId, useProjectContext, usePrevShotContext },
      })
      setPrompt(result.prompt)
      await queryClient.invalidateQueries({ queryKey: projectKeys.project(projectId) })
      toast('Prompt generated', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate prompt'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setIsGeneratingPrompt(false)
    }
  }

  async function handleEnhancePrompt() {
    if (!selectedShotId || !prompt.trim()) return
    setIsEnhancingPrompt(true)
    setError(null)
    try {
      const result = await enhanceShotImagePrompt({ data: { shotId: selectedShotId, userPrompt: prompt, useProjectContext, usePrevShotContext } })
      setPrompt(result.prompt)
      toast('Prompt enhanced', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to enhance prompt'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setIsEnhancingPrompt(false)
    }
  }

  async function handleSelectAsset(assetId: string) {
    setIsSelectingAssetId(assetId)
    setError(null)
    try {
      await selectShotAsset({ data: { assetId } })
      await queryClient.invalidateQueries({ queryKey: projectKeys.project(projectId) })
      toast('Image selected', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to select image'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setIsSelectingAssetId(null)
    }
  }

  async function handleDeleteAsset(assetId: string) {
    setDeletingAssetId(assetId)
    setError(null)
    try {
      await deleteAsset({ data: { assetId } })
      if (expandedImageId === assetId) setExpandedImageId(null)
      await queryClient.invalidateQueries({ queryKey: projectKeys.project(projectId) })
      toast('Image deleted', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete image'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setDeletingAssetId(null)
    }
  }

  return {
    prompt,
    setPrompt,
    settingsOverrides,
    setSettingsOverrides,
    isGenerating,
    isGeneratingPrompt,
    isEnhancingPrompt,
    isSelectingAssetId,
    deletingAssetId,
    expandedImageId,
    setExpandedImageId,
    isLightboxOpen,
    setIsLightboxOpen,
    useRefImage,
    setUseRefImage,
    useProjectContext,
    setUseProjectContext,
    usePrevShotContext,
    setUsePrevShotContext,
    prevShotSelectedImageUrl,
    resetForShot,
    handleGenerate,
    handleGeneratePrompt,
    handleEnhancePrompt,
    handleSelectAsset,
    handleDeleteAsset,
  }
}
