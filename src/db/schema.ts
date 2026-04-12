import { sql } from "drizzle-orm";
import {
	bigint,
	boolean,
	check,
	doublePrecision,
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import type {
	MotionGraphicPreset,
	MotionGraphicSpec,
	ProjectSettings,
	ScriptDraft,
	ShotSize,
} from "@/features/projects/project-types";

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
	id: text("id").primaryKey(), // Clerk user ID
	providerKeyEnc: text("provider_key_enc"),
	providerKeyDek: text("provider_key_dek"),
	elevenlabsKeyEnc: text("elevenlabs_key_enc"),
	elevenlabsKeyDek: text("elevenlabs_key_dek"),
	onboardingComplete: boolean("onboarding_complete").notNull().default(false),
	createdAt: timestamp("created_at", { withTimezone: true })
		.notNull()
		.defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true })
		.notNull()
		.defaultNow()
		.$onUpdateFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------

export const projects = pgTable(
	"projects",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id),
		name: text("name").notNull(),
		directorPrompt: text("director_prompt").notNull().default(""),
		scriptRaw: text("script_raw"),
		scriptStatus: text("script_status")
			.notNull()
			.default("idle")
			.$type<"idle" | "generating" | "done" | "error">(),
		scriptJobId: text("script_job_id"),
		settings: jsonb("settings").$type<ProjectSettings | null>(),
		scriptDraft: jsonb("script_draft").$type<ScriptDraft | null>(),
		// biome-ignore lint/suspicious/noExplicitAny: TanStack route serialization in this repo expects a permissive JSON object shape here
		editorState: jsonb("editor_state").$type<Record<string, any> | null>(),
		workshopBusyUntil: timestamp("workshop_busy_until", { withTimezone: true }),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdateFn(() => new Date()),
	},
	(table) => [
		index("idx_projects_user_id").on(table.userId),
		index("idx_projects_deleted").on(table.deletedAt),
		check(
			"projects_script_status_check",
			sql`${table.scriptStatus} IN ('idle', 'generating', 'done', 'error')`,
		),
	],
);

// ---------------------------------------------------------------------------
// shots
// ---------------------------------------------------------------------------

export const shots = pgTable(
	"shots",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id),
		order: doublePrecision("order").notNull(),
		description: text("description").notNull(),
		shotType: text("shot_type").notNull().$type<"talking" | "visual">(),
		shotSize: text("shot_size").notNull().default("medium").$type<ShotSize>(),
		durationSec: integer("duration_sec").notNull().default(5),
		timestampStart: doublePrecision("timestamp_start"),
		timestampEnd: doublePrecision("timestamp_end"),
		imagePrompt: text("image_prompt"),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdateFn(() => new Date()),
	},
	(table) => [
		index("idx_shots_project_id").on(table.projectId),
		index("idx_shots_deleted").on(table.deletedAt),
		index("idx_shots_project_order").on(table.projectId, table.order),
		check(
			"shots_shot_type_check",
			sql`${table.shotType} IN ('talking', 'visual')`,
		),
		check(
			"shots_shot_size_check",
			sql`${table.shotSize} IN ('extreme-wide', 'wide', 'medium', 'close-up', 'extreme-close-up', 'insert')`,
		),
		check("shots_duration_check", sql`${table.durationSec} BETWEEN 1 AND 10`),
		check("shots_description_check", sql`trim(${table.description}) != ''`),
	],
);

// ---------------------------------------------------------------------------
// assets
// ---------------------------------------------------------------------------

export const assets = pgTable(
	"assets",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id),
		shotId: uuid("shot_id").references(() => shots.id),
		type: text("type")
			.notNull()
			.$type<
				| "start_image"
				| "end_image"
				| "image"
				| "video"
				| "voiceover"
				| "background_music"
			>(),
		stage: text("stage").notNull().$type<"images" | "video" | "audio">(),
		prompt: text("prompt"),
		model: text("model"),
		modelSettings: jsonb("model_settings"),
		url: text("url"),
		storageKey: text("storage_key"),
		thumbnailUrl: text("thumbnail_url"),
		thumbnailStorageKey: text("thumbnail_storage_key"),
		width: integer("width"),
		height: integer("height"),
		durationMs: integer("duration_ms"),
		fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
		generationDurationMs: integer("generation_duration_ms"),
		status: text("status")
			.notNull()
			.default("generating")
			.$type<"queued" | "generating" | "finalizing" | "done" | "error">(),
		isSelected: boolean("is_selected").notNull().default(false),
		batchId: uuid("batch_id"),
		errorMessage: text("error_message"),
		generationId: text("generation_id"),
		jobId: text("job_id"),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdateFn(() => new Date()),
	},
	(table) => [
		index("idx_assets_project_id").on(table.projectId),
		index("idx_assets_project_stage").on(table.projectId, table.stage),
		index("idx_assets_batch_id").on(table.batchId),
		index("idx_assets_deleted").on(table.deletedAt),
		// One selected voiceover per project.
		uniqueIndex("idx_assets_project_voiceover_selected")
			.on(table.projectId)
			.where(
				sql`${table.isSelected} = true AND ${table.type} = 'voiceover' AND ${table.deletedAt} IS NULL`,
			),
		// One selected background-music track per project.
		uniqueIndex("idx_assets_project_background_music_selected")
			.on(table.projectId)
			.where(
				sql`${table.isSelected} = true AND ${table.type} = 'background_music' AND ${table.deletedAt} IS NULL`,
			),
		index("idx_assets_shot_id").on(table.shotId),
		// One selected shot-level image asset per shot.
		uniqueIndex("idx_assets_shot_image_selected")
			.on(table.shotId)
			.where(
				sql`${table.isSelected} = true AND ${table.shotId} IS NOT NULL AND ${table.stage} = 'images' AND ${table.deletedAt} IS NULL`,
			),
		// One selected shot-level video asset per shot.
		uniqueIndex("idx_assets_shot_video_selected")
			.on(table.shotId)
			.where(
				sql`${table.isSelected} = true AND ${table.shotId} IS NOT NULL AND ${table.stage} = 'video' AND ${table.deletedAt} IS NULL`,
			),
		check(
			"assets_type_check",
			sql`${table.type} IN ('start_image', 'end_image', 'image', 'video', 'voiceover', 'background_music')`,
		),
		check(
			"assets_status_check",
			sql`${table.status} IN ('queued', 'generating', 'finalizing', 'done', 'error')`,
		),
		check(
			"assets_type_stage_check",
			sql`(${table.type} IN ('start_image', 'end_image') AND ${table.stage} = 'images')
       OR (${table.type} = 'image' AND ${table.stage} = 'images')
       OR (${table.type} = 'video' AND ${table.stage} = 'video')
       OR (${table.type} IN ('voiceover', 'background_music') AND ${table.stage} = 'audio')`,
		),
	],
);

// ---------------------------------------------------------------------------
// transition_videos
// ---------------------------------------------------------------------------

export const transitionVideos = pgTable(
	"transition_videos",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id),
		fromShotId: uuid("from_shot_id")
			.notNull()
			.references(() => shots.id),
		toShotId: uuid("to_shot_id")
			.notNull()
			.references(() => shots.id),
		fromImageId: uuid("from_image_id").references(() => assets.id),
		toImageId: uuid("to_image_id").references(() => assets.id),
		prompt: text("prompt"),
		model: text("model").notNull().default("kwaivgi/kling-v3-omni-video"),
		modelSettings: jsonb("model_settings"),
		generationId: text("generation_id"),
		jobId: text("job_id"),
		url: text("url"),
		storageKey: text("storage_key"),
		status: text("status")
			.notNull()
			.default("generating")
			.$type<"queued" | "generating" | "finalizing" | "done" | "error">(),
		errorMessage: text("error_message"),
		isSelected: boolean("is_selected").notNull().default(false),
		stale: boolean("stale").notNull().default(false),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdateFn(() => new Date()),
	},
	(table) => [
		index("idx_transition_videos_project_id").on(table.projectId),
		index("idx_transition_videos_from_shot").on(table.fromShotId),
		index("idx_transition_videos_to_shot").on(table.toShotId),
		index("idx_transition_videos_deleted").on(table.deletedAt),
		index("idx_transition_videos_generation_id").on(table.generationId),
		// One selected video per transition edge
		uniqueIndex("idx_transition_videos_selected")
			.on(table.fromShotId, table.toShotId)
			.where(sql`${table.isSelected} = true AND ${table.deletedAt} IS NULL`),
		check(
			"transition_videos_status_check",
			sql`${table.status} IN ('queued', 'generating', 'finalizing', 'done', 'error')`,
		),
	],
);

export type TransitionVideo = typeof transitionVideos.$inferSelect;
export type NewTransitionVideo = typeof transitionVideos.$inferInsert;

// ---------------------------------------------------------------------------
// motion_graphics
// ---------------------------------------------------------------------------

export const motionGraphics = pgTable(
	"motion_graphics",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id),
		shotId: uuid("shot_id")
			.notNull()
			.references(() => shots.id),
		preset: text("preset").notNull().$type<MotionGraphicPreset>(),
		title: text("title").notNull(),
		sourceText: text("source_text").notNull(),
		spec: jsonb("spec").notNull().$type<MotionGraphicSpec>(),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdateFn(() => new Date()),
	},
	(table) => [
		index("idx_motion_graphics_project_id").on(table.projectId),
		index("idx_motion_graphics_shot_id").on(table.shotId),
		index("idx_motion_graphics_deleted").on(table.deletedAt),
		check(
			"motion_graphics_preset_check",
			sql`${table.preset} IN ('lower_third', 'callout')`,
		),
	],
);

export type MotionGraphic = typeof motionGraphics.$inferSelect;
export type NewMotionGraphic = typeof motionGraphics.$inferInsert;

// ---------------------------------------------------------------------------
// messages (Script Workshop chat history)
// ---------------------------------------------------------------------------

export const messages = pgTable(
	"messages",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id),
		role: text("role").notNull().$type<"system" | "user" | "assistant">(),
		content: text("content").notNull(),
		clientMessageId: uuid("client_message_id"),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_messages_project_id").on(table.projectId),
		uniqueIndex("uq_messages_project_client_msg")
			.on(table.projectId, table.clientMessageId)
			.where(sql`${table.clientMessageId} IS NOT NULL`),
		check(
			"messages_role_check",
			sql`${table.role} IN ('system', 'user', 'assistant')`,
		),
	],
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type Shot = typeof shots.$inferSelect;
export type NewShot = typeof shots.$inferInsert;

export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

// ---------------------------------------------------------------------------
// reference_images
// ---------------------------------------------------------------------------

export const referenceImages = pgTable(
	"reference_images",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id),
		url: text("url").notNull(),
		storageKey: text("storage_key"),
		label: text("label"),
		type: text("type")
			.notNull()
			.default("reference")
			.$type<"reference" | "character">(),
		characterId: text("character_id"),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(table) => [
		index("idx_reference_images_project_id").on(table.projectId),
		index("idx_reference_images_deleted").on(table.deletedAt),
		index("idx_reference_images_character_id").on(table.characterId),
		check(
			"reference_images_type_check",
			sql`${table.type} IN ('reference', 'character')`,
		),
	],
);

export type ReferenceImage = typeof referenceImages.$inferSelect;
export type NewReferenceImage = typeof referenceImages.$inferInsert;
