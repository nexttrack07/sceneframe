import type { ImageDefaults } from '../../project-types'

export function InlineSettingsRow({
  settings,
  onSettingsChange,
}: {
  settings: ImageDefaults
  onSettingsChange: (settings: ImageDefaults) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="text-[10px] text-muted-foreground space-y-1">
        <span className="block">Model</span>
        <input
          value={settings.model}
          onChange={(e) => onSettingsChange({ ...settings, model: e.target.value })}
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
        />
      </label>
      <label className="text-[10px] text-muted-foreground space-y-1">
        <span className="block">Ratio</span>
        <select
          value={settings.aspectRatio}
          onChange={(e) =>
            onSettingsChange({
              ...settings,
              aspectRatio: e.target.value as ImageDefaults['aspectRatio'],
            })
          }
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
        >
          <option value="16:9">16:9</option>
          <option value="9:16">9:16</option>
          <option value="1:1">1:1</option>
          <option value="4:5">4:5</option>
        </select>
      </label>
      <label className="text-[10px] text-muted-foreground space-y-1">
        <span className="block">Quality</span>
        <select
          value={settings.qualityPreset}
          onChange={(e) =>
            onSettingsChange({
              ...settings,
              qualityPreset: e.target.value as ImageDefaults['qualityPreset'],
            })
          }
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
        >
          <option value="fast">Fast</option>
          <option value="balanced">Balanced</option>
          <option value="high">High</option>
        </select>
      </label>
      <label className="text-[10px] text-muted-foreground space-y-1">
        <span className="block">Batch</span>
        <input
          type="number"
          min={1}
          max={4}
          value={settings.batchCount}
          onChange={(e) =>
            onSettingsChange({
              ...settings,
              batchCount: Math.max(1, Math.min(4, Number(e.target.value) || 2)),
            })
          }
          className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground"
        />
      </label>
    </div>
  )
}
