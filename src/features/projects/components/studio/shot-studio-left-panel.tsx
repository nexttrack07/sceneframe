import { Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Scene, Shot } from '@/db/schema'
import type { ImageDefaults } from '../../project-types'
import { ShotContextSection } from './shot-context-section'
import { PromptEditor } from './prompt-editor'
import { InlineSettingsRow } from './inline-settings-row'

export function ShotStudioLeftPanel({
  shot,
  parentScene,
  prompt,
  onPromptChange,
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
  prompt: string
  onPromptChange: (value: string) => void
  onGeneratePrompt: () => void
  isGeneratingPrompt: boolean
  settingsOverrides: ImageDefaults
  onSettingsChange: (settings: ImageDefaults) => void
  isGenerating: boolean
  onGenerate: () => void
  onDescriptionSaved?: (newDescription: string) => void
}) {
  return (
    <div className="flex flex-col h-full bg-card">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <ShotContextSection
          shot={shot}
          parentScene={parentScene}
          onDescriptionSaved={onDescriptionSaved}
        />

        <div className="border-t pt-4 space-y-4">
          <PromptEditor
            prompt={prompt}
            onPromptChange={onPromptChange}
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
        <Button onClick={onGenerate} disabled={isGenerating} className="w-full gap-2" size="lg">
          {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
          {isGenerating ? 'Generating...' : 'Generate images'}
        </Button>
      </div>
    </div>
  )
}
