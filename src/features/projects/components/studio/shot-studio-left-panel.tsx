import { Loader2, PlusCircle, MinusCircle, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Scene, Shot } from '@/db/schema'
import type { ImageDefaults, SceneAssetSummary } from '../../project-types'
import { ShotContextSection } from './shot-context-section'
import { FrameTabBar } from './frame-tab-bar'
import { PromptEditor } from './prompt-editor'
import { InlineSettingsRow } from './inline-settings-row'

export function ShotStudioLeftPanel({
  shot,
  parentScene,
  shotAssets,
  activeLane,
  onLaneChange,
  showEndFrame,
  onToggleEndFrame,
  prompt,
  onPromptChange,
  onPromptBlur,
  onGeneratePrompt,
  isGeneratingPrompt,
  settingsOverrides,
  onSettingsChange,
  isGenerating,
  onGenerate,
  onDescriptionSaved,
}: {
  shot: Shot
  parentScene: Scene
  shotAssets: SceneAssetSummary[]
  activeLane: 'start' | 'end'
  onLaneChange: (lane: 'start' | 'end') => void
  showEndFrame: boolean
  onToggleEndFrame: () => void
  prompt: string
  onPromptChange: (value: string) => void
  onPromptBlur?: () => void
  onGeneratePrompt: () => void
  isGeneratingPrompt: boolean
  settingsOverrides: ImageDefaults
  onSettingsChange: (settings: ImageDefaults) => void
  isGenerating: boolean
  onGenerate: () => void
  onDescriptionSaved?: (newDescription: string) => void
}) {
  return (
    <div className="w-[380px] border-r flex flex-col shrink-0 bg-card">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <ShotContextSection
          shot={shot}
          parentScene={parentScene}
          onDescriptionSaved={onDescriptionSaved}
        />

        <div className="border-t pt-4 space-y-4">
          {/* End frame toggle */}
          <button
            type="button"
            onClick={onToggleEndFrame}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showEndFrame ? <MinusCircle size={13} /> : <PlusCircle size={13} />}
            {showEndFrame ? 'Remove end frame' : 'Add end frame'}
          </button>

          {/* Frame tab bar — only visible when end frame is enabled */}
          {showEndFrame && (
            <FrameTabBar
              activeLane={activeLane}
              onLaneChange={onLaneChange}
              sceneAssets={shotAssets}
            />
          )}

          <PromptEditor
            prompt={prompt}
            onPromptChange={onPromptChange}
            onPromptBlur={onPromptBlur}
            onGeneratePrompt={onGeneratePrompt}
            isGeneratingPrompt={isGeneratingPrompt}
          />

          <InlineSettingsRow
            settings={settingsOverrides}
            onSettingsChange={onSettingsChange}
          />
        </div>
      </div>

      {/* Sticky generate button */}
      <div className="p-4 border-t bg-card">
        <Button
          onClick={onGenerate}
          disabled={isGenerating}
          className="w-full gap-2"
          size="lg"
        >
          {isGenerating ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Wand2 size={16} />
          )}
          {isGenerating ? 'Generating...' : 'Generate images'}
        </Button>
      </div>
    </div>
  )
}
