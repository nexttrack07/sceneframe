import { Loader2, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Scene } from '@/db/schema'
import type { ImageDefaults, ProjectSettings, SceneAssetSummary, ScenePlanEntry, SceneVersionEntry } from '../../project-types'
import { SceneContextSection } from './scene-context-section'
import { FrameTabBar } from './frame-tab-bar'
import { PromptEditor } from './prompt-editor'
import { VisualRefsSection } from './visual-refs-section'
import { InlineSettingsRow } from './inline-settings-row'

export function StudioLeftPanel({
  scene,
  plan,
  sceneVersions,
  sceneAssets,
  projectSettings,
  activeLane,
  onLaneChange,
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
  scene: Scene
  plan?: ScenePlanEntry
  sceneVersions: SceneVersionEntry[]
  sceneAssets: SceneAssetSummary[]
  projectSettings: ProjectSettings | null
  activeLane: 'start' | 'end'
  onLaneChange: (lane: 'start' | 'end') => void
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
    <div className="w-[380px] border-r flex flex-col shrink-0 bg-card">
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <SceneContextSection
          scene={scene}
          plan={plan}
          sceneVersions={sceneVersions}
          onDescriptionSaved={onDescriptionSaved}
        />

        <div className="border-t pt-4 space-y-4">
          <FrameTabBar
            activeLane={activeLane}
            onLaneChange={onLaneChange}
            sceneAssets={sceneAssets}
          />

          <PromptEditor prompt={prompt} onPromptChange={onPromptChange} onGeneratePrompt={onGeneratePrompt} isGeneratingPrompt={isGeneratingPrompt} />

          <VisualRefsSection consistencyLock={projectSettings?.consistencyLock} />

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
