import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DECISION_REASONS } from '../project-constants'

interface AssetDecisionReasonsProps {
  selectedReasons: string[]
  onToggleReason: (reason: string) => void
  isSaving: boolean
  onSave: () => void
}

export function AssetDecisionReasons({
  selectedReasons,
  onToggleReason,
  isSaving,
  onSave,
}: AssetDecisionReasonsProps) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Asset decision reasons
      </p>
      <div className="flex flex-wrap gap-2">
        {DECISION_REASONS.map((reason) => {
          const selected = selectedReasons.includes(reason)
          return (
            <button
              key={reason}
              type="button"
              onClick={() => onToggleReason(reason)}
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
      <Button size="sm" variant="outline" onClick={onSave} disabled={isSaving}>
        {isSaving ? <Loader2 size={12} className="animate-spin mr-1.5" /> : null}
        Save reason tags
      </Button>
    </div>
  )
}
