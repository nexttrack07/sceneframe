import { Film, Image as ImageIcon, Video, Music } from 'lucide-react'
import type { ImageDefaults } from './project-types'

export const PIPELINE_STAGES = [
  { key: 'script', label: 'Script', icon: Film },
  { key: 'images', label: 'Images', icon: ImageIcon },
  { key: 'video', label: 'Video', icon: Video },
  { key: 'audio', label: 'Audio', icon: Music },
] as const

export const ASSET_STATUS = {
  GENERATING: 'generating',
  DONE: 'done',
  ERROR: 'error',
} as const

export type AssetStatus = (typeof ASSET_STATUS)[keyof typeof ASSET_STATUS]

export const ASSET_TYPE = {
  START_IMAGE: 'start_image',
  END_IMAGE: 'end_image',
} as const

export type AssetType = (typeof ASSET_TYPE)[keyof typeof ASSET_TYPE]

export const SCRIPT_STATUS = {
  IDLE: 'idle',
  GENERATING: 'generating',
  DONE: 'done',
  ERROR: 'error',
} as const

export type ScriptStatus = (typeof SCRIPT_STATUS)[keyof typeof SCRIPT_STATUS]

export const DEFAULT_IMAGE_DEFAULTS: ImageDefaults = {
  model: 'google/nano-banana-pro',
  aspectRatio: '16:9',
  qualityPreset: 'balanced',
  batchCount: 2,
}
