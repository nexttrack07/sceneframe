import { useId, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { AlertCircle, Loader2, Sparkles, Image as ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Scene } from '@/db/schema'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { SceneAssetSummary, ScenePlanEntry, SceneVersionEntry } from '../project-actions'
import {
  generateSceneImages,
  regenerateSceneDescription,
  restoreSceneVersion,
  saveSceneAssetDecisionReasons,
  selectAsset,
  updateScene,
} from '../project-actions'

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
  const availableReasons = ['off-style', 'wrong subject', 'bad composition', 'not clickable']
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

  return (
    <div className="w-1/2 border-l bg-card flex flex-col shrink-0">
      <div className="px-5 py-4 border-b flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Scene Details</h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          ✕
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
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
              <p className="text-xs text-primary font-medium">What should change?</p>
              <Textarea
                value={refineInstructions}
                onChange={(e) => setRefineInstructions(e.target.value)}
                placeholder="e.g. Make the lighting warmer, add a sunset in the background..."
                rows={2}
                disabled={isRegenerating}
                className="resize-none text-sm bg-card"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleRegenerate()
                  }
                }}
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsRefineOpen(false)
                    setRefineInstructions('')
                  }}
                  disabled={isRegenerating}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={!refineInstructions.trim() || isRegenerating}
                  className="bg-primary hover:bg-primary/90 text-xs"
                >
                  {isRegenerating ? (
                    <Loader2 size={12} className="animate-spin mr-1.5" />
                  ) : (
                    <Sparkles size={12} className="mr-1.5" />
                  )}
                  {isRegenerating ? 'Refining…' : 'Refine'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Linkage + timing */}
        {(plan?.beat || plan?.durationSec || plan?.hookRole) && (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Scene mapping
            </p>
            {plan?.beat ? <p className="text-sm text-foreground">Beat: {plan.beat}</p> : null}
            {plan?.hookRole ? <p className="text-sm text-foreground">Role: {plan.hookRole}</p> : null}
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
        {sceneVersions.length > 0 && (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Version history
            </p>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {sceneVersions
                .slice()
                .reverse()
                .map((version, idx) => (
                  <div key={`${version.createdAt}-${idx}`} className="rounded border bg-card p-2 space-y-1">
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(version.createdAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-foreground line-clamp-3">{version.description}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isRestoring}
                      onClick={() => handleRestoreVersion(version)}
                    >
                      Restore this version
                    </Button>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Asset decision reasons */}
        {showDecisionReasons ? (
          <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Asset decision reasons
            </p>
            <div className="flex flex-wrap gap-2">
              {availableReasons.map((reason) => {
                const selected = selectedReasons.includes(reason)
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() =>
                      setSelectedReasons((prev) =>
                        selected ? prev.filter((r) => r !== reason) : [...prev, reason],
                      )
                    }
                    className={`px-2 py-1 rounded border text-xs transition-colors ${
                      selected
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {reason}
                  </button>
                )
              })}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveReasons}
              disabled={isSavingReasons}
            >
              {isSavingReasons ? <Loader2 size={12} className="animate-spin mr-1.5" /> : null}
              Save reason tags
            </Button>
          </div>
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
            assets={startAssets}
            selectingAssetId={isSelectingAssetId}
            onSelectAsset={handleSelectAsset}
          />

          <ImageLaneCard
            title="End frames"
            prompt={endPrompt}
            onPromptChange={setEndPrompt}
            isGenerating={isGeneratingEnd}
            onGenerate={() => handleGenerateLane('end')}
            assets={endAssets}
            selectingAssetId={isSelectingAssetId}
            onSelectAsset={handleSelectAsset}
          />
        </div>
      </div>
    </div>
  )
}

function getPracticalityWarnings(text: string): string[] {
  const lower = text.toLowerCase()
  const warnings: string[] = []
  if (lower.includes('crowd') || lower.includes('thousands')) {
    warnings.push('Large crowd setup may be expensive or hard to generate consistently.')
  }
  if (lower.includes('explosion') || lower.includes('helicopter')) {
    warnings.push('High-complexity cinematic elements may require simplification.')
  }
  if (!lower.includes('lighting') && !lower.includes('camera')) {
    warnings.push('Add lighting/camera direction for stronger and more consistent outputs.')
  }
  if (lower.includes('multiple locations') || lower.includes('many locations')) {
    warnings.push('Many locations can fragment pacing; consider narrowing locations per scene.')
  }
  return warnings
}

function ImageLaneCard({
  title,
  prompt,
  onPromptChange,
  isGenerating,
  onGenerate,
  assets,
  selectingAssetId,
  onSelectAsset,
}: {
  title: string
  prompt: string
  onPromptChange: (value: string) => void
  isGenerating: boolean
  onGenerate: () => void
  assets: SceneAssetSummary[]
  selectingAssetId: string | null
  onSelectAsset: (assetId: string) => void
}) {
  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ImageIcon size={14} className="text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">{title}</span>
        </div>
        <Button size="sm" onClick={onGenerate} disabled={isGenerating}>
          {isGenerating ? <Loader2 size={12} className="animate-spin mr-1.5" /> : null}
          {isGenerating ? 'Generating…' : 'Generate'}
        </Button>
      </div>
      <Textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        rows={3}
        className="text-sm bg-background"
        placeholder="Optional prompt override"
      />
      {assets.length === 0 ? (
        <p className="text-xs text-muted-foreground">No candidates yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {assets.map((asset) => (
            <button
              key={asset.id}
              type="button"
              onClick={() => {
                if (asset.status !== 'done' || asset.isSelected || selectingAssetId === asset.id) return
                onSelectAsset(asset.id)
              }}
              aria-pressed={asset.isSelected}
              disabled={asset.status !== 'done' || selectingAssetId === asset.id}
              className={`relative rounded overflow-hidden bg-muted transition disabled:opacity-100 ${
                asset.status === 'done' ? 'cursor-pointer' : 'cursor-default'
              } ${asset.isSelected ? 'ring-2 ring-primary ring-offset-1' : 'hover:ring-1 hover:ring-primary/40'}`}
            >
              {/* Image or placeholder */}
              {asset.url ? (
                <img
                  src={asset.url}
                  alt={title}
                  className="w-full aspect-video object-cover block"
                />
              ) : (
                <div
                  className={`w-full aspect-video ${
                    asset.status === 'error'
                      ? 'bg-destructive/10'
                      : 'bg-muted animate-pulse'
                  }`}
                />
              )}

              {/* Overlay badge — status or selection */}
              <div className="absolute top-1 right-1">
                {asset.isSelected ? (
                  <span className="bg-primary text-primary-foreground text-[10px] font-medium px-1.5 py-0.5 rounded">
                    ✓
                  </span>
                ) : asset.status === 'generating' ? (
                  <Loader2 size={12} className="text-white drop-shadow animate-spin" />
                ) : asset.status === 'error' ? (
                  <span className="bg-destructive text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                    Error
                  </span>
                ) : null}
              </div>

              {/* Error message */}
              {asset.status === 'error' && asset.errorMessage ? (
                <div className="absolute inset-0 flex items-center justify-center p-1.5">
                  <p className="text-[10px] leading-tight text-destructive text-center line-clamp-4 bg-background/80 rounded p-1">
                    {asset.errorMessage}
                  </p>
                </div>
              ) : null}

              {/* Selecting spinner */}
              {selectingAssetId === asset.id ? (
                <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                  <Loader2 size={16} className="animate-spin text-primary" />
                </div>
              ) : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
