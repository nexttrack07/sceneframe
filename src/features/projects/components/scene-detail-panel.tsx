import { useId, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { AlertCircle, Loader2, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Scene } from '@/db/schema'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SceneAssetSummary, ScenePlanEntry, SceneVersionEntry } from '../project-types'
import {
  generateSceneImages,
  regenerateSceneDescription,
  restoreSceneVersion,
  saveSceneAssetDecisionReasons,
  selectAsset,
  updateScene,
} from '../scene-actions'
import { getPracticalityWarnings } from '../lib/practicality-warnings'
import { SceneRefinePanel } from './scene-refine-panel'
import { SceneVersionHistory } from './scene-version-history'
import { AssetDecisionReasons } from './asset-decision-reasons'
import { ImageLaneCard } from './image-lane-card'

// ---------------------------------------------------------------------------
// SceneDetailPanel
// ---------------------------------------------------------------------------

export function SceneDetailPanel({
  scene,
  plan,
  sceneVersions,
  decisionReasons,
  sceneAssets,
  onClose,
}: {
  scene: Scene
  plan?: ScenePlanEntry
  sceneVersions: SceneVersionEntry[]
  decisionReasons: string[]
  sceneAssets: SceneAssetSummary[]
  onClose: () => void
}) {
  const router = useRouter()
  const id = useId()
  const titleId = `${id}-title`
  const descriptionId = `${id}-description`

  const [title, setTitle] = useState(scene.title ?? '')
  const [description, setDescription] = useState(scene.description)
  const [isSaving, setIsSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isRefineOpen, setIsRefineOpen] = useState(false)
  const [refineInstructions, setRefineInstructions] = useState('')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [isSavingReasons, setIsSavingReasons] = useState(false)
  const [selectedReasons, setSelectedReasons] = useState<string[]>(decisionReasons)
  const [startPrompt, setStartPrompt] = useState(
    `Start frame: ${scene.description}\nFocus on the opening moment of this scene.`,
  )
  const [endPrompt, setEndPrompt] = useState(
    `End frame: ${scene.description}\nFocus on the closing moment of this scene.`,
  )
  const [isGeneratingStart, setIsGeneratingStart] = useState(false)
  const [isGeneratingEnd, setIsGeneratingEnd] = useState(false)
  const [isSelectingAssetId, setIsSelectingAssetId] = useState<string | null>(null)

  const practicalityWarnings = getPracticalityWarnings(description)
  const showDecisionReasons = decisionReasons.length > 0 || scene.stage !== 'script'
  const startAssets = sceneAssets.filter((asset) => asset.type === 'start_image')
  const endAssets = sceneAssets.filter((asset) => asset.type === 'end_image')

  function handleTitleChange(val: string) {
    setTitle(val)
    setIsDirty(true)
  }

  function handleDescriptionChange(val: string) {
    setDescription(val)
    setIsDirty(true)
  }

  async function handleSave() {
    if (!isDirty) return
    const trimmedDesc = description.trim()
    if (!trimmedDesc) {
      setError('Description cannot be empty')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await updateScene({
        data: {
          sceneId: scene.id,
          title: title.trim() || null,
          description: trimmedDesc,
        },
      })
      setIsDirty(false)
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRegenerate() {
    if (!refineInstructions.trim() || isRegenerating) return
    setIsRegenerating(true)
    setError(null)
    try {
      const result = await regenerateSceneDescription({
        data: {
          sceneId: scene.id,
          instructions: refineInstructions,
          currentDescription: description,
        },
      })
      setDescription(result.description)
      setIsDirty(true)
      setRefineInstructions('')
      setIsRefineOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate description')
    } finally {
      setIsRegenerating(false)
    }
  }

  async function handleRestoreVersion(version: SceneVersionEntry) {
    setIsRestoring(true)
    setError(null)
    try {
      await restoreSceneVersion({
        data: { sceneId: scene.id, description: version.description },
      })
      setDescription(version.description)
      setIsDirty(false)
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore version')
    } finally {
      setIsRestoring(false)
    }
  }

  async function handleSaveReasons() {
    setIsSavingReasons(true)
    setError(null)
    try {
      await saveSceneAssetDecisionReasons({
        data: { sceneId: scene.id, reasons: selectedReasons },
      })
      router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save decision reasons')
    } finally {
      setIsSavingReasons(false)
    }
  }

  async function handleGenerateLane(lane: 'start' | 'end') {
    const promptOverride = lane === 'start' ? startPrompt.trim() : endPrompt.trim()
    if (lane === 'start') setIsGeneratingStart(true)
    if (lane === 'end') setIsGeneratingEnd(true)
    setError(null)
    try {
      await generateSceneImages({
        data: {
          sceneId: scene.id,
          lane,
          promptOverride: promptOverride || undefined,
        },
      })
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate images')
    } finally {
      if (lane === 'start') setIsGeneratingStart(false)
      if (lane === 'end') setIsGeneratingEnd(false)
    }
  }

  async function handleSelectAsset(assetId: string) {
    setIsSelectingAssetId(assetId)
    setError(null)
    try {
      await selectAsset({ data: { assetId } })
      await router.invalidate()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to select image')
    } finally {
      setIsSelectingAssetId(null)
    }
  }

  function handleToggleReason(reason: string) {
    setSelectedReasons((prev) =>
      prev.includes(reason) ? prev.filter((r) => r !== reason) : [...prev, reason],
    )
  }

  return (
    <div className="w-1/2 border-l bg-card flex flex-col shrink-0">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Scene Details</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          <X size={16} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Title */}
        <div className="space-y-1.5">
          <label
            htmlFor={titleId}
            className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
          >
            Title
          </label>
          <input
            id={titleId}
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            placeholder="Scene title"
          />
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor={descriptionId}
              className="text-xs font-medium text-muted-foreground uppercase tracking-wide"
            >
              Description
            </label>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setIsRefineOpen((prev) => !prev)}
                  className={`p-1.5 rounded-md transition-colors ${
                    isRefineOpen
                      ? 'bg-foreground text-background'
                      : 'bg-foreground text-background hover:bg-foreground/80'
                  }`}
                >
                  <Sparkles size={13} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Refine with AI</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <textarea
            id={descriptionId}
            value={description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            rows={6}
            disabled={isRegenerating}
            className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent leading-relaxed disabled:opacity-50"
            placeholder="Visual description for this scene..."
          />

          {/* AI refine panel */}
          {isRefineOpen && (
            <SceneRefinePanel
              refineInstructions={refineInstructions}
              setRefineInstructions={setRefineInstructions}
              isRegenerating={isRegenerating}
              onRegenerate={handleRegenerate}
              onClose={() => {
                setIsRefineOpen(false)
                setRefineInstructions('')
              }}
            />
          )}
        </div>

        {/* Linkage + timing */}
        {(plan?.beat || plan?.durationSec || plan?.hookRole) && (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Scene mapping
            </p>
            {plan?.beat ? <p className="text-sm text-foreground">Beat: {plan.beat}</p> : null}
            {plan?.hookRole ? (
              <p className="text-sm text-foreground">Role: {plan.hookRole}</p>
            ) : null}
            {plan?.durationSec ? (
              <p className="text-sm text-foreground">Estimated duration: {plan.durationSec}s</p>
            ) : null}
          </div>
        )}

        {/* Practicality checks */}
        {practicalityWarnings.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/15 p-3 space-y-2">
            <p className="text-xs font-medium text-warning uppercase tracking-wide">
              Production practicality checks
            </p>
            <ul className="space-y-1">
              {practicalityWarnings.map((warning) => (
                <li key={warning} className="text-xs text-warning">
                  • {warning}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Versioning */}
        <SceneVersionHistory
          sceneVersions={sceneVersions}
          isRestoring={isRestoring}
          onRestoreVersion={handleRestoreVersion}
        />

        {/* Asset decision reasons */}
        {showDecisionReasons ? (
          <AssetDecisionReasons
            selectedReasons={selectedReasons}
            onToggleReason={handleToggleReason}
            isSaving={isSavingReasons}
            onSave={handleSaveReasons}
          />
        ) : null}

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isDirty && (
          <Button size="sm" onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 size={13} className="animate-spin mr-1.5" /> : null}
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        )}

        {/* Images */}
        <div className="pt-4 border-t space-y-4">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Scene images
          </h4>

          <ImageLaneCard
            title="Start frames"
            prompt={startPrompt}
            onPromptChange={setStartPrompt}
            isGenerating={isGeneratingStart}
            onGenerate={() => handleGenerateLane('start')}
            allLaneAssets={startAssets}
            selectingAssetId={isSelectingAssetId}
            onSelectAsset={handleSelectAsset}
          />

          <ImageLaneCard
            title="End frames"
            prompt={endPrompt}
            onPromptChange={setEndPrompt}
            isGenerating={isGeneratingEnd}
            onGenerate={() => handleGenerateLane('end')}
            allLaneAssets={endAssets}
            selectingAssetId={isSelectingAssetId}
            onSelectAsset={handleSelectAsset}
          />
        </div>
      </div>
    </div>
  )
}
