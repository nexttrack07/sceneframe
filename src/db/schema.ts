import {
  pgTable,
  text,
  boolean,
  uuid,
  doublePrecision,
  integer,
  bigint,
  jsonb,
  timestamp,
  unique,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: text('id').primaryKey(), // Clerk user ID
  providerKeyEnc: text('provider_key_enc'),
  providerKeyDek: text('provider_key_dek'),
  onboardingComplete: boolean('onboarding_complete').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
})

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    directorPrompt: text('director_prompt').notNull().default(''),
    scriptRaw: text('script_raw'),
    scriptStatus: text('script_status').notNull().default('idle'),
    scriptJobId: text('script_job_id'),
    settings: jsonb('settings'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (table) => [
    index('idx_projects_user_id').on(table.userId),
    index('idx_projects_deleted').on(table.deletedAt),
    check('projects_script_status_check', sql`${table.scriptStatus} IN ('idle', 'generating', 'done', 'error')`),
  ],
)

// ---------------------------------------------------------------------------
// scenes
// ---------------------------------------------------------------------------

export const scenes = pgTable(
  'scenes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    order: doublePrecision('order').notNull(),
    title: text('title'),
    description: text('description').notNull(),
    stage: text('stage').notNull().default('script'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (table) => [
    index('idx_scenes_project_id').on(table.projectId),
    index('idx_scenes_project_stage').on(table.projectId, table.stage),
    unique('idx_scenes_project_order').on(table.projectId, table.order),
    index('idx_scenes_deleted').on(table.deletedAt),
    check('scenes_stage_check', sql`${table.stage} IN ('script', 'images', 'video', 'audio')`),
    check('scenes_description_check', sql`trim(${table.description}) != ''`),
  ],
)

// ---------------------------------------------------------------------------
// assets
// ---------------------------------------------------------------------------

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => scenes.id),
    type: text('type').notNull(),
    stage: text('stage').notNull(),
    prompt: text('prompt'),
    model: text('model'),
    modelSettings: jsonb('model_settings'),
    url: text('url'),
    storageKey: text('storage_key'),
    thumbnailUrl: text('thumbnail_url'),
    thumbnailStorageKey: text('thumbnail_storage_key'),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),
    fileSizeBytes: bigint('file_size_bytes', { mode: 'number' }),
    status: text('status').notNull().default('generating'),
    isSelected: boolean('is_selected').notNull().default(false),
    batchId: uuid('batch_id'),
    errorMessage: text('error_message'),
    generationId: text('generation_id'),
    jobId: text('job_id'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdateFn(() => new Date()),
  },
  (table) => [
    index('idx_assets_scene_id').on(table.sceneId),
    index('idx_assets_scene_stage').on(table.sceneId, table.stage),
    index('idx_assets_batch_id').on(table.batchId),
    index('idx_assets_deleted').on(table.deletedAt),
    // One selected asset per (scene, type) — partial unique index enforced at DB level
    uniqueIndex('idx_assets_selected')
      .on(table.sceneId, table.type)
      .where(sql`${table.isSelected} = true`),
    check('assets_type_check', sql`${table.type} IN ('start_image', 'end_image', 'video', 'voiceover', 'background_music')`),
    check('assets_status_check', sql`${table.status} IN ('generating', 'done', 'error')`),
    check(
      'assets_type_stage_check',
      sql`(${table.type} IN ('start_image', 'end_image') AND ${table.stage} = 'images')
       OR (${table.type} = 'video' AND ${table.stage} = 'video')
       OR (${table.type} IN ('voiceover', 'background_music') AND ${table.stage} = 'audio')`,
    ),
  ],
)

// ---------------------------------------------------------------------------
// messages (Script Workshop chat history)
// ---------------------------------------------------------------------------

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    role: text('role').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_messages_project_id').on(table.projectId),
    check('messages_role_check', sql`${table.role} IN ('system', 'user', 'assistant')`),
  ],
)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert

export type Scene = typeof scenes.$inferSelect
export type NewScene = typeof scenes.$inferInsert

export type Asset = typeof assets.$inferSelect
export type NewAsset = typeof assets.$inferInsert

export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
