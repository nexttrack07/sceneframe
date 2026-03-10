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
  onEnhancePrompt,
  isEnhancingPrompt,
  settingsOverrides,
  refImageUrl,
  useRefImage,
  onUseRefImageChange,
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
  onEnhancePrompt?: () => void
  isEnhancingPrompt?: boolean
  settingsOverrides: ImageDefaults
  refImageUrl?: string | null
  useRefImage?: boolean
  onUseRefImageChange?: (v: boolean) => void
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
            onEnhancePrompt={onEnhancePrompt}
            isEnhancingPrompt={isEnhancingPrompt}
          />

          <InlineSettingsRow
            settings={settingsOverrides}
            onSettingsChange={onSettingsChange}
          />

          {/* Reference image from previous shot */}
          {refImageUrl && onUseRefImageChange && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useRefImage ?? false}
                  onChange={(e) => onUseRefImageChange(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-primary"
                />
                <span className="text-xs font-medium text-muted-foreground">Use previous shot as reference</span>
              </label>
              {useRefImage && (
                <img
                  src={refImageUrl}
                  alt="Reference image"
                  className="w-full rounded-lg border border-border object-cover aspect-video opacity-80"
                />
              )}
            </div>
          )}
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
