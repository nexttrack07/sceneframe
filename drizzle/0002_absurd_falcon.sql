ALTER TABLE "assets" DROP CONSTRAINT "assets_type_check";--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_type_stage_check";--> statement-breakpoint
DROP INDEX "idx_assets_selected";--> statement-breakpoint
DROP INDEX "idx_assets_shot_selected";--> statement-breakpoint
-- Deselect duplicate selected image assets per shot (keep most recent)
UPDATE assets
SET "isSelected" = false
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "shotId" ORDER BY "createdAt" DESC) AS rn
    FROM assets
    WHERE "isSelected" = true
      AND "shotId" IS NOT NULL
      AND "deletedAt" IS NULL
      AND type IN ('start_image', 'end_image', 'image')
  ) ranked
  WHERE rn > 1
);--> statement-breakpoint

-- Deselect duplicate selected image assets per scene (keep most recent)
UPDATE assets
SET "isSelected" = false
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "sceneId" ORDER BY "createdAt" DESC) AS rn
    FROM assets
    WHERE "isSelected" = true
      AND "shotId" IS NULL
      AND "deletedAt" IS NULL
      AND type IN ('start_image', 'end_image', 'image')
  ) ranked
  WHERE rn > 1
);--> statement-breakpoint

CREATE UNIQUE INDEX "idx_assets_selected" ON "assets" USING btree ("scene_id") WHERE "assets"."is_selected" = true AND "assets"."shot_id" IS NULL AND "assets"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_assets_shot_selected" ON "assets" USING btree ("shot_id") WHERE "assets"."is_selected" = true AND "assets"."shot_id" IS NOT NULL AND "assets"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_type_check" CHECK ("assets"."type" IN ('start_image', 'end_image', 'image', 'video', 'voiceover', 'background_music'));--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_type_stage_check" CHECK (("assets"."type" IN ('start_image', 'end_image') AND "assets"."stage" = 'images')
       OR ("assets"."type" = 'image' AND "assets"."stage" = 'images')
       OR ("assets"."type" = 'video' AND "assets"."stage" = 'video')
       OR ("assets"."type" IN ('voiceover', 'background_music') AND "assets"."stage" = 'audio'));