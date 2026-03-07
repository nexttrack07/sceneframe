import type { SceneAssetSummary } from '../../project-types'

export function FrameTabBar({
  activeLane,
  onLaneChange,
  sceneAssets,
}: {
  activeLane: 'start' | 'end'
  onLaneChange: (lane: 'start' | 'end') => void
  sceneAssets: SceneAssetSummary[]
}) {
  const startCount = sceneAssets.filter(
    (a) => a.type === 'start_image' && a.status === 'done',
  ).length
  const endCount = sceneAssets.filter(
    (a) => a.type === 'end_image' && a.status === 'done',
  ).length

  const tabs = [
    { key: 'start' as const, label: 'Start Frame', count: startCount },
    { key: 'end' as const, label: 'End Frame', count: endCount },
  ]

  return (
    <div className="flex border-b">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onLaneChange(tab.key)}
          className={`flex-1 py-2 text-xs font-medium text-center transition-colors relative ${
            activeLane === tab.key
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.label}
          {tab.count > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center bg-muted text-muted-foreground text-[10px] rounded-full px-1.5 min-w-[18px] h-4">
              {tab.count}
            </span>
          )}
          {activeLane === tab.key && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
          )}
        </button>
      ))}
    </div>
  )
}
