import { useState } from 'react'
import { Loader2, Wand2, Film } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Scene, Shot } from '@/db/schema'
import type { ImageDefaults } from '../../project-types'
import { ShotContextSection } from './shot-context-section'
import { PromptEditor } from './prompt-editor'
import { InlineSettingsRow } from './inline-settings-row'

export function ShotStudioLeftPanel({
  shot,
  parentScene,
  promptMode,
  onPromptModeChange,
  prompt,
  onPromptChange,
  onGeneratePrompt,
  isGeneratingPrompt,
  settingsOverrides,
  onSettingsChange,
  isGenerating,
  onGenerate,
  onDescriptionSaved,
  hasSelectedImage,
}: {
  shot: Shot
  parentScene: Scene
  promptMode: 'start' | 'end'
  onPromptModeChange?: (mode: 'start' | 'end') => void
  prompt: string
  onPromptChange: (value: string) => void
  onGeneratePrompt: () => void
  isGeneratingPrompt: boolean
  settingsOverrides: ImageDefaults
  onSettingsChange: (settings: ImageDefaults) => void
  isGenerating: boolean
  onGenerate: () => void
  onDescriptionSaved?: (newDescription: string) => void
  hasSelectedImage: boolean
}) {
  const [mediaTab, setMediaTab] = useState<'image' | 'video'>('image')

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
          {/* Media type tabs */}
          <div className="flex gap-1 border-b pb-3">
            <button
              type="button"
              onClick={() => setMediaTab('image')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mediaTab === 'image'
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              Image
            </button>
            <button
              type="button"
              onClick={() => setMediaTab('video')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mediaTab === 'video'
                  ? 'bg-primary/15 text-primary ring-1 ring-primary/30'
                  : 'bg-muted/50 text-muted-foreground hover:text-foreground'
              }`}
            >
              Video
            </button>
          </div>

          {mediaTab === 'image' && (
            <>
              {/* Opening / Closing frame toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Frame</span>
                <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                  <button
                    type="button"
                    onClick={() => onPromptModeChange?.('start')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      promptMode === 'start'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Opening
                  </button>
                  <button
                    type="button"
                    onClick={() => onPromptModeChange?.('end')}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
                      promptMode === 'end'
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Closing
                  </button>
                </div>
              </div>

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
            </>
          )}

          {mediaTab === 'video' && (
            <div className="space-y-3">
              {!hasSelectedImage ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Select an image first to generate video. Choose a generated image from the gallery on the right.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <label className="text-xs font-medium text-muted-foreground">Video Prompt</label>
                    <textarea
                      rows={4}
                      placeholder="Describe the motion and action for this shot..."
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <Button disabled className="w-full gap-2" size="sm">
                    <Film size={14} />
                    Generate Video (coming soon)
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky generate button — image tab only */}
      {mediaTab === 'image' && (
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
      )}
    </div>
  )
}
