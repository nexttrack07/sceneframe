import { Loader2, Sparkles, Wand2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function PromptEditor({
  prompt,
  onPromptChange,
  onPromptBlur,
  onGeneratePrompt,
  isGeneratingPrompt,
  onEnhancePrompt,
  isEnhancingPrompt,
}: {
  prompt: string
  onPromptChange: (value: string) => void
  onPromptBlur?: () => void
  onGeneratePrompt?: () => void
  isGeneratingPrompt?: boolean
  onEnhancePrompt?: () => void
  isEnhancingPrompt?: boolean
}) {
  const isBusy = isGeneratingPrompt || isEnhancingPrompt
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">Image Prompt</label>
        <div className="flex items-center gap-1">
          {onEnhancePrompt && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onEnhancePrompt}
                  disabled={isBusy || !prompt.trim()}
                  className="p-1.5 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors disabled:opacity-40"
                >
                  {isEnhancingPrompt ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Enhance your prompt</p>
              </TooltipContent>
            </Tooltip>
          )}
          {onGeneratePrompt && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onGeneratePrompt}
                  disabled={isBusy}
                  className="p-1.5 rounded-md bg-foreground text-background hover:bg-foreground/80 transition-colors disabled:opacity-50"
                >
                  {isGeneratingPrompt ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>Generate prompt with AI</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
      <textarea
        value={prompt}
        onChange={(e) => onPromptChange(e.target.value)}
        onBlur={onPromptBlur}
        rows={10}
        disabled={isBusy}
        className="w-full px-3 py-2 border border-border rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent bg-background disabled:opacity-50"
        placeholder="Describe the image to generate..."
      />
    </div>
  )
}
