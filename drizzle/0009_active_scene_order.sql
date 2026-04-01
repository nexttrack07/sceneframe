ALTER TABLE "scenes" DROP CONSTRAINT IF EXISTS "idx_scenes_project_order";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_scenes_project_order";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_assets_selected";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_assets_shot_selected";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_assets_scene_image_selected" ON "assets" USING btree ("scene_id") WHERE "assets"."is_selected" = true AND "assets"."shot_id" IS NULL AND "assets"."stage" = 'images' AND "assets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_assets_scene_voiceover_selected" ON "assets" USING btree ("scene_id") WHERE "assets"."is_selected" = true AND "assets"."type" = 'voiceover' AND "assets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_assets_scene_background_music_selected" ON "assets" USING btree ("scene_id") WHERE "assets"."is_selected" = true AND "assets"."type" = 'background_music' AND "assets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_assets_shot_image_selected" ON "assets" USING btree ("shot_id") WHERE "assets"."is_selected" = true AND "assets"."shot_id" IS NOT NULL AND "assets"."stage" = 'images' AND "assets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_assets_shot_video_selected" ON "assets" USING btree ("shot_id") WHERE "assets"."is_selected" = true AND "assets"."shot_id" IS NOT NULL AND "assets"."stage" = 'video' AND "assets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_scenes_project_order" ON "scenes" USING btree ("project_id","order") WHERE "scenes"."deleted_at" IS NULL;
