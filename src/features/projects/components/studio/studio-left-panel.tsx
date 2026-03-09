import { Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Scene } from '@/db/schema'
import type { ImageDefaults, ScenePlanEntry } from '../../project-types'
import { SceneContextSection } from './scene-context-section'
import { PromptEditor } from './prompt-editor'
import { InlineSettingsRow } from './inline-settings-row'

export function StudioLeftPanel({
  scene,
  plan,
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
  scene: Scene
  plan?: ScenePlanEntry
  promptMode?: 'start' | 'end'
  onPromptModeChange?: (mode: 'start' | 'end') => void
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
        <SceneContextSection
          scene={scene}
          plan={plan}
          onDescriptionSaved={onDescriptionSaved}
        />

        <div className="border-t pt-4 space-y-4">
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
