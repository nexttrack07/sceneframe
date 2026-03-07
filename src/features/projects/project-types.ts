export interface IntakeAnswers {
  channelPreset: string
  purpose: string
  length: string
  style: string[]
  mood: string[]
  setting: string[]
  audience: string
  viewerAction: string
  workingTitle?: string
  thumbnailPromise?: string
  concept: string
}

export interface ScenePlanEntry {
  title: string
  description: string
  durationSec?: number
  beat?: string
  hookRole?: 'hook' | 'body' | 'cta'
}

export interface SceneVersionEntry {
  description: string
  createdAt: string
}

export interface ImageDefaults {
  model: string
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:5'
  qualityPreset: 'fast' | 'balanced' | 'high'
  batchCount: number
}

export interface ConsistencyLock {
  enabled: boolean
  strength: 'low' | 'medium' | 'high'
  referenceUrls: string[]
}

export interface ProjectSettings {
  intake?: IntakeAnswers
  hookConfirmed?: boolean
  sceneVersions?: Record<string, SceneVersionEntry[]>
  assetDecisionReasons?: Record<string, string[]>
  imageDefaults?: ImageDefaults
  consistencyLock?: ConsistencyLock
}

export interface SceneAssetSummary {
  id: string
  sceneId: string
  type: 'start_image' | 'end_image'
  status: 'generating' | 'done' | 'error'
  url: string | null
  errorMessage: string | null
  prompt: string | null
  model: string | null
  isSelected: boolean
  batchId: string | null
  createdAt: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modelSettings: Record<string, any> | null
}
