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
  selectedImageUrl,
  videoPrompt,
  onVideoPromptChange,
  onGenerateVideoPrompt,
  isGeneratingVideoPrompt,
  isGeneratingVideo,
  onGenerateVideo,
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
  selectedImageUrl: string | null
  videoPrompt: string
  onVideoPromptChange: (value: string) => void
  onGenerateVideoPrompt: () => void
  isGeneratingVideoPrompt: boolean
  isGeneratingVideo: boolean
  onGenerateVideo: () => void
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
              {!selectedImageUrl ? (
                <div className="rounded-lg border border-dashed border-border p-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    Select a start frame image from the gallery first.
                  </p>
                </div>
              ) : (
                <>
                  {/* Start frame thumbnail */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Start frame</label>
                    <img
                      src={selectedImageUrl}
                      alt="Start frame"
                      className="w-full rounded-lg border border-border object-cover aspect-video"
                    />
                  </div>

                  {/* Motion prompt */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">Motion prompt</label>
                      <button
                        type="button"
                        onClick={onGenerateVideoPrompt}
                        disabled={isGeneratingVideoPrompt}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                      >
                        {isGeneratingVideoPrompt ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Wand2 size={11} />
                        )}
                        {isGeneratingVideoPrompt ? 'Generating...' : 'Generate'}
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      value={videoPrompt}
                      onChange={(e) => onVideoPromptChange(e.target.value)}
                      placeholder="Describe the motion — camera movement, subject action, speed..."
                      className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring leading-relaxed"
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky generate button */}
      {mediaTab === 'image' && (
        <div className="p-4 border-t bg-card">
          <Button onClick={onGenerate} disabled={isGenerating} className="w-full gap-2" size="lg">
            {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />}
            {isGenerating ? 'Generating...' : 'Generate images'}
          </Button>
        </div>
      )}
      {mediaTab === 'video' && selectedImageUrl && (
        <div className="p-4 border-t bg-card">
          <Button
            onClick={onGenerateVideo}
            disabled={isGeneratingVideo || !videoPrompt.trim()}
            className="w-full gap-2"
            size="lg"
          >
            {isGeneratingVideo ? <Loader2 size={16} className="animate-spin" /> : <Film size={16} />}
            {isGeneratingVideo ? 'Generating video...' : 'Generate video'}
          </Button>
        </div>
      )}
    </div>
  )
}
