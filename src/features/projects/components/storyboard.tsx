import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useNavigate } from '@tanstack/react-router'
import {
  AlertCircle,
  Download,
  Timer,
  CheckCircle2,
  Plus,
  Info,
  Play,
} from 'lucide-react'
import type { Scene, Shot } from '@/db/schema'
import type { ImageDefaults, ProjectSettings, SceneAssetSummary, ScenePlanEntry, TransitionVideoSummary } from '../project-types'
import { exportProjectHandoff } from '../project-queries'
import { resetWorkshop } from '../project-mutations'
import { reorderScene, addScene, deleteScene, addShot, deleteShot, generateShotImages, generateShotImagePrompt, enhanceShotImagePrompt, selectShotAsset, deleteAsset, generateTransitionVideo, generateTransitionVideoPrompt, enhanceTransitionVideoPrompt, pollTransitionVideo, selectTransitionVideo, deleteTransitionVideo } from '../scene-actions'
import { normalizeImageDefaults } from '../project-normalize'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { SceneImageStudio } from './scene-image-studio'
import { ResetDialog } from './reset-dialog'
import { StoryboardCard } from './storyboard-card'
import { ShotCard } from './shot-card'
import { SceneHeader } from './scene-header'
import { ShotStudioLeftPanel } from './studio/shot-studio-left-panel'
import { StudioGallery } from './studio/studio-gallery'
import { VideoControlsPanel, type VideoModel } from './studio/video-controls-panel'
import { VideoGrid } from './studio/video-grid'

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
  transitionVideos: allTransitionVideos,
  initialShotId,
  initialFromShotId,
  initialToShotId,
}: {
  projectId: string
  scenes: Scene[]
  shots: Shot[]
  assets: SceneAssetSummary[]
  projectSettings: ProjectSettings | null
  scenePlan: ScenePlanEntry[]
  transitionVideos: TransitionVideoSummary[]
  initialShotId?: string
  initialFromShotId?: string
  initialToShotId?: string
}) {
  const router = useRouter()
  const navigate = useNavigate({ from: '/projects/$projectId' })
  const { toast } = useToast()
  const [isResetting, setIsResetting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null)
  const [selectedShotId, setSelectedShotIdState] = useState<string | null>(initialShotId ?? null)
  const [selectedTransitionPair, setSelectedTransitionPairState] = useState<{ fromShotId: string; toShotId: string } | null>(
    initialFromShotId && initialToShotId ? { fromShotId: initialFromShotId, toShotId: initialToShotId } : null,
  )

  function selectShot(id: string | null) {
    setSelectedShotIdState(id)
    setSelectedTransitionPairState(null)
    setUseRefImage(false)
    if (id) {
      void navigate({ search: (prev) => ({ ...prev, shot: id, from: undefined, to: undefined }) })
    } else {
      void navigate({ search: (prev) => ({ ...prev, shot: undefined, from: undefined, to: undefined }) })
    }
  }

  function selectTransition(pair: { fromShotId: string; toShotId: string } | null) {
    setSelectedTransitionPairState(pair)
    setSelectedShotIdState(null)
    if (pair) {
      void navigate({ search: (prev) => ({ ...prev, from: pair.fromShotId, to: pair.toShotId, shot: undefined }) })
    } else {
      void navigate({ search: (prev) => ({ ...prev, from: undefined, to: undefined, shot: undefined }) })
    }
  }

  // Drag-to-reorder state
  const [draggedSceneId, setDraggedSceneId] = useState<string | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  // Add scene form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSceneDescription, setNewSceneDescription] = useState('')
  const [isAddingScene, setIsAddingScene] = useState(false)

  // Image studio state (for selected shot)
  const [prompt, setPrompt] = useState('')
  const [settingsOverrides, setSettingsOverrides] = useState<ImageDefaults>(normalizeImageDefaults(null))
  const [isGenerating, setIsGenerating] = useState(false)
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false)
  const [isEnhancingVideoPrompt, setIsEnhancingVideoPrompt] = useState(false)
  const [useRefImage, setUseRefImage] = useState(false)
  const [isSelectingAssetId, setIsSelectingAssetId] = useState<string | null>(null)
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null)
  const [expandedImageId, setExpandedImageId] = useState<string | null>(null)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)

  // Video studio state (for selected transition)
  const [videoPrompt, setVideoPrompt] = useState('')
  const [videoModel, setVideoModel] = useState<VideoModel>('v3-omni')
  const [videoMode, setVideoMode] = useState<'standard' | 'pro'>('pro')
  const [generateAudio, setGenerateAudio] = useState(false)
  const [negativePrompt, setNegativePrompt] = useState('')
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false)
  const [isGeneratingVideoPrompt, setIsGeneratingVideoPrompt] = useState(false)
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null)
  const cancelVideoRef = useRef(false)

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
    if (selectedSceneId !== null || selectedShotId !== null || selectedTransitionPair !== null) return
    const interval = setInterval(() => {
      void router.invalidate()
    }, 2500)
    return () => clearInterval(interval)
  }, [hasGeneratingAssets, selectedSceneId, selectedShotId, selectedTransitionPair, router])

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

  // Reset video studio state when selected transition pair changes
  useEffect(() => {
    if (!selectedTransitionPair) return
    setVideoPrompt('')
    setIsGeneratingVideo(false)
    setIsGeneratingVideoPrompt(false)
    setDeletingVideoId(null)
    cancelVideoRef.current = false
  }, [selectedTransitionPair?.fromShotId, selectedTransitionPair?.toShotId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-resume polling for any stuck generating transition when transition pair is selected
  useEffect(() => {
    if (!selectedTransitionPair) return
    const generatingTv = allTransitionVideos.find(
      (tv) =>
        tv.fromShotId === selectedTransitionPair.fromShotId &&
        tv.toShotId === selectedTransitionPair.toShotId &&
        tv.status === 'generating',
    )
    if (!generatingTv || isGeneratingVideo) return

    const transitionVideoId = generatingTv.id
    cancelVideoRef.current = false
    setIsGeneratingVideo(true)

    const POLL_TIMEOUT_MS = 12 * 60 * 1000
    const deadline = Date.now() + POLL_TIMEOUT_MS
    let consecutiveErrors = 0

    const interval = setInterval(async () => {
      if (cancelVideoRef.current || Date.now() > deadline) {
        clearInterval(interval)
        setIsGeneratingVideo(false)
        return
      }
      try {
        const result = await pollTransitionVideo({ data: { transitionVideoId } })
        consecutiveErrors = 0
        if (result.status === 'done') {
          const isSelected = allTransitionVideos.find(
            (tv) =>
              tv.fromShotId === selectedTransitionPair.fromShotId &&
              tv.toShotId === selectedTransitionPair.toShotId &&
              tv.isSelected &&
              tv.status === 'done',
          )
          if (!isSelected) {
            await selectTransitionVideo({ data: { transitionVideoId } })
          }
          clearInterval(interval)
          setIsGeneratingVideo(false)
          await router.invalidate()
          toast('Transition video ready', 'success')
        } else if (result.status === 'error') {
          clearInterval(interval)
          setIsGeneratingVideo(false)
          await deleteTransitionVideo({ data: { transitionVideoId } })
          await router.invalidate()
          toast(result.errorMessage ?? 'Video generation failed', 'error')
        }
      } catch (err) {
        consecutiveErrors++
        if (consecutiveErrors >= 3) {
          clearInterval(interval)
          setIsGeneratingVideo(false)
          const msg = err instanceof Error ? err.message : 'Polling failed'
          toast(msg, 'error')
        }
      }
    }, 5000)

    return () => {
      clearInterval(interval)
      cancelVideoRef.current = true
    }
  }, [selectedTransitionPair?.fromShotId, selectedTransitionPair?.toShotId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcut: Escape closes studio
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return
      if (isLightboxOpen) return
      if (e.key === 'Escape') {
        selectShot(null)
        setSelectedSceneId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isLightboxOpen])

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
        selectShot(null)
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
        selectShot(null)
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

  // Image generation handlers
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
      await router.invalidate()
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
        data: { shotId: selectedShotId, lane: 'start' },
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

  async function handleEnhancePrompt() {
    if (!selectedShotId || !prompt.trim()) return
    setIsEnhancingPrompt(true)
    setError(null)
    try {
      const result = await enhanceShotImagePrompt({ data: { shotId: selectedShotId, userPrompt: prompt } })
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

  async function handleEnhanceVideoPrompt() {
    if (!selectedTransitionPair || !videoPrompt.trim()) return
    setIsEnhancingVideoPrompt(true)
    setError(null)
    try {
      const result = await enhanceTransitionVideoPrompt({
        data: { fromShotId: selectedTransitionPair.fromShotId, toShotId: selectedTransitionPair.toShotId, userPrompt: videoPrompt },
      })
      setVideoPrompt(result.prompt)
      toast('Video prompt enhanced', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to enhance prompt'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setIsEnhancingVideoPrompt(false)
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

  // Video generation handlers
  async function handleGenerateVideoPrompt() {
    if (!selectedTransitionPair) return
    setIsGeneratingVideoPrompt(true)
    setError(null)
    try {
      const result = await generateTransitionVideoPrompt({
        data: { fromShotId: selectedTransitionPair.fromShotId, toShotId: selectedTransitionPair.toShotId },
      })
      setVideoPrompt(result.prompt)
      toast('Prompt generated', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate prompt'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setIsGeneratingVideoPrompt(false)
    }
  }

  async function handleGenerateVideo() {
    if (!selectedTransitionPair || !videoPrompt.trim()) return
    setIsGeneratingVideo(true)
    cancelVideoRef.current = false
    setError(null)
    try {
      const { transitionVideoId } = await generateTransitionVideo({
        data: {
          fromShotId: selectedTransitionPair.fromShotId,
          toShotId: selectedTransitionPair.toShotId,
          prompt: videoPrompt.trim(),
          videoModel,
          mode: videoMode,
          generateAudio,
          negativePrompt,
        },
      })

      const POLL_TIMEOUT_MS = 12 * 60 * 1000
      const deadline = Date.now() + POLL_TIMEOUT_MS

      await new Promise<void>((resolve, reject) => {
        let settled = false
        const interval = setInterval(async () => {
          if (settled) return
          if (Date.now() > deadline || cancelVideoRef.current) {
            settled = true
            clearInterval(interval)
            reject(new Error(cancelVideoRef.current ? 'Cancelled' : 'Video generation timed out'))
            return
          }
          try {
            const result = await pollTransitionVideo({ data: { transitionVideoId } })
            if (result.status === 'done') {
              // Auto-select if nothing is selected yet
              const hasSelected = allTransitionVideos.some(
                (tv) =>
                  tv.fromShotId === selectedTransitionPair.fromShotId &&
                  tv.toShotId === selectedTransitionPair.toShotId &&
                  tv.isSelected &&
                  tv.status === 'done',
              )
              if (!hasSelected) {
                await selectTransitionVideo({ data: { transitionVideoId } })
              }
              settled = true
              clearInterval(interval)
              resolve()
            } else if (result.status === 'error') {
              settled = true
              clearInterval(interval)
              await deleteTransitionVideo({ data: { transitionVideoId } }).catch(() => {})
              reject(new Error(result.errorMessage ?? 'Video generation failed'))
            }
          } catch {
            // transient error — keep polling
          }
        }, 5000)
      })

      await router.invalidate()
      toast('Transition video generated', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate video'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setIsGeneratingVideo(false)
      cancelVideoRef.current = false
    }
  }

  async function handleSelectTransitionVideo(transitionVideoId: string) {
    setError(null)
    try {
      await selectTransitionVideo({ data: { transitionVideoId } })
      await router.invalidate()
      toast('Video selected', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to select video'
      setError(msg)
      toast(msg, 'error')
    }
  }

  async function handleDeleteTransitionVideo(transitionVideoId: string) {
    setDeletingVideoId(transitionVideoId)
    setError(null)
    try {
      await deleteTransitionVideo({ data: { transitionVideoId } })
      await router.invalidate()
      toast('Video deleted', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete video'
      setError(msg)
      toast(msg, 'error')
    } finally {
      setDeletingVideoId(null)
    }
  }

  // Determine studio mode
  const studioMode: 'image' | 'video' = selectedTransitionPair ? 'video' : 'image'
  const selectedShot = selectedShotId ? storyShots.find((s) => s.id === selectedShotId) ?? null : null
  const fromShot = selectedTransitionPair ? storyShots.find((s) => s.id === selectedTransitionPair.fromShotId) ?? null : null
  const toShot = selectedTransitionPair ? storyShots.find((s) => s.id === selectedTransitionPair.toShotId) ?? null : null
  const shotParentScene = selectedShot ? storyScenes.find((s) => s.id === selectedShot.sceneId) ?? null : null

  // Previous shot globally (across scenes) — for reference image
  const prevShot = useMemo(() => {
    if (!selectedShot) return null
    const idx = storyShots.findIndex((s) => s.id === selectedShot.id)
    return idx > 0 ? storyShots[idx - 1] : null
  }, [selectedShot, storyShots])
  const prevShotSelectedImageUrl = prevShot
    ? (assetsByShotId.get(prevShot.id) ?? []).find((a) => a.isSelected && a.status === 'done')?.url ?? null
    : null

  // 3-column layout when shot or transition is selected
  if (selectedShotId || selectedTransitionPair) {
    return (
      <div className="flex h-full min-h-0 overflow-hidden">
        {/* Col 1: Storyboard sidebar */}
        <div className="w-[240px] border-r flex-shrink-0 overflow-y-auto bg-card">
          <div className="p-3 space-y-2">
            {/* Back button */}
            <button
              type="button"
              onClick={() => { selectShot(null) }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-3"
            >
              ← Back to storyboard
            </button>

            {/* Scenes + shots */}
            {filteredScenes.map((scene, sceneIdx) => {
              const sceneShots = shotsBySceneId.get(scene.id) ?? []
              const nextScene = filteredScenes[sceneIdx + 1] ?? null
              const nextSceneFirstShot = nextScene ? (shotsBySceneId.get(nextScene.id) ?? [])[0] ?? null : null
              return (
                <div key={scene.id}>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide px-1 py-1">
                    {scene.title || `Scene ${storyScenes.indexOf(scene) + 1}`}
                  </p>
                  {sceneShots.map((shot, shotIdx) => {
                    const isLastInScene = shotIdx === sceneShots.length - 1
                    const nextShot = sceneShots[shotIdx + 1] ?? (isLastInScene ? nextSceneFirstShot : null)
                    const isSelectedShot = selectedShotId === shot.id
                    const isInTransition =
                      selectedTransitionPair?.fromShotId === shot.id ||
                      selectedTransitionPair?.toShotId === shot.id
                    const shotAssetsList = assetsByShotId.get(shot.id) ?? []
                    const hasSelectedImage = shotAssetsList.some((a) => a.isSelected && a.status === 'done')
                    const nextHasSelectedImage = nextShot
                      ? (assetsByShotId.get(nextShot.id) ?? []).some((a) => a.isSelected && a.status === 'done')
                      : false
                    const selectedImageUrl = shotAssetsList.find((a) => a.isSelected && a.status === 'done')?.url ?? null

                    return (
                      <div key={shot.id}>
                        {/* Shot card */}
                        <button
                          type="button"
                          onClick={() => { selectShot(shot.id) }}
                          className={`w-full rounded-lg border p-2 text-left transition-colors mb-1 ${
                            isSelectedShot || isInTransition
                              ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                              : 'border-border hover:border-border/80 hover:bg-muted/30'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            {selectedImageUrl ? (
                              <img src={selectedImageUrl} alt="" className="w-12 h-8 object-cover rounded flex-shrink-0" />
                            ) : (
                              <div className="w-12 h-8 bg-muted rounded flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[10px] font-medium text-muted-foreground">Shot {globalShotIndex.get(shot.id)}</p>
                              <p className="text-xs text-foreground line-clamp-2 leading-tight">{shot.description}</p>
                            </div>
                          </div>
                        </button>

                        {/* Video connector pill between shots */}
                        {nextShot && hasSelectedImage && nextHasSelectedImage && (
                          <button
                            type="button"
                            onClick={() => {
                              selectTransition({ fromShotId: shot.id, toShotId: nextShot.id })
                            }}
                            className="w-full relative flex items-center py-1.5 px-2 mb-1 group"
                          >
                            {/* Line */}
                            <div className={`absolute left-2 right-2 top-1/2 -translate-y-1/2 h-px transition-colors ${
                              selectedTransitionPair?.fromShotId === shot.id && selectedTransitionPair?.toShotId === nextShot.id
                                ? 'bg-primary/40'
                                : 'bg-border/50 group-hover:bg-border'
                            }`} />
                            {/* Centered pill */}
                            <div className={`relative z-10 mx-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border transition-all ${
                              selectedTransitionPair?.fromShotId === shot.id && selectedTransitionPair?.toShotId === nextShot.id
                                ? 'bg-card border-primary/40 text-primary shadow-sm'
                                : 'bg-card border-border/60 text-muted-foreground group-hover:border-border group-hover:text-foreground'
                            }`}>
                              <Play size={8} className="fill-current" />
                              Video
                            </div>
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        {/* Col 2: Controls panel */}
        <div className="w-[360px] border-r flex-shrink-0 flex flex-col bg-card overflow-hidden">
          {studioMode === 'image' && selectedShot && shotParentScene ? (
            <ShotStudioLeftPanel
              shot={selectedShot}
              parentScene={shotParentScene}
              prompt={prompt}
              onPromptChange={setPrompt}
              onGeneratePrompt={handleGeneratePrompt}
              onEnhancePrompt={handleEnhancePrompt}
              isEnhancingPrompt={isEnhancingPrompt}
              refImageUrl={prevShotSelectedImageUrl}
              useRefImage={useRefImage}
              onUseRefImageChange={setUseRefImage}
              isGeneratingPrompt={isGeneratingPrompt}
              settingsOverrides={settingsOverrides}
              onSettingsChange={setSettingsOverrides}
              isGenerating={isGenerating}
              onGenerate={handleGenerate}
            />
          ) : studioMode === 'video' && fromShot && toShot ? (
            <VideoControlsPanel
              fromShot={fromShot}
              toShot={toShot}
              videoPrompt={videoPrompt}
              onVideoPromptChange={setVideoPrompt}
              onGeneratePrompt={handleGenerateVideoPrompt}
              isGeneratingPrompt={isGeneratingVideoPrompt}
              onEnhancePrompt={handleEnhanceVideoPrompt}
              isEnhancingPrompt={isEnhancingVideoPrompt}
              videoModel={videoModel}
              onVideoModelChange={setVideoModel}
              videoMode={videoMode}
              onVideoModeChange={setVideoMode}
              generateAudio={generateAudio}
              onGenerateAudioChange={setGenerateAudio}
              negativePrompt={negativePrompt}
              onNegativePromptChange={setNegativePrompt}
              isGenerating={isGeneratingVideo}
              onGenerate={handleGenerateVideo}
            />
          ) : null}
        </div>

        {/* Col 3: Gallery / Video grid */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {studioMode === 'image' && selectedShot ? (
            <StudioGallery
              sceneAssets={assetsByShotId.get(selectedShot.id) ?? []}
              selectingAssetId={isSelectingAssetId}
              deletingAssetId={deletingAssetId}
              onSelectAsset={handleSelectAsset}
              onDeleteAsset={handleDeleteAsset}
              onRegenerate={handleGenerate}
              expandedImageId={expandedImageId}
              onExpandImage={setExpandedImageId}
              pendingCount={isGenerating ? settingsOverrides.batchCount : 0}
              onLightboxChange={setIsLightboxOpen}
            />
          ) : studioMode === 'video' && selectedTransitionPair ? (
            <VideoGrid
              transitionVideos={allTransitionVideos.filter(
                (tv) =>
                  tv.fromShotId === selectedTransitionPair.fromShotId &&
                  tv.toShotId === selectedTransitionPair.toShotId,
              )}
              deletingVideoId={deletingVideoId}
              onDelete={handleDeleteTransitionVideo}
              onSelect={handleSelectTransitionVideo}
              isGenerating={isGeneratingVideo}
            />
          ) : null}
        </div>
      </div>
    )
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
                      {sceneShots.map((shot) => {
                        return (
                          <div key={shot.id}>
                            <ShotCard
                              shot={shot}
                              globalIndex={globalShotIndex.get(shot.id) ?? 0}
                              assets={assetsByShotId.get(shot.id) ?? []}
                              isSelected={selectedShotId === shot.id}
                              onSelect={() => {
                                selectShot(shot.id)
                                setSelectedSceneId(null)
                              }}
                              onDelete={() => handleDeleteShot(shot.id)}
                            />
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
            selectShot(null)
          }}
        />
      )}
    </div>
  )
}
