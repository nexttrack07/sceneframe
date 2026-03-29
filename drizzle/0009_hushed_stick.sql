DROP INDEX IF EXISTS "idx_assets_selected";
DROP INDEX IF EXISTS "idx_assets_shot_selected";

CREATE UNIQUE INDEX "idx_assets_scene_image_selected"
	ON "assets" ("scene_id")
	WHERE "is_selected" = true
		AND "shot_id" IS NULL
		AND "stage" = 'images'
		AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "idx_assets_scene_voiceover_selected"
	ON "assets" ("scene_id")
	WHERE "is_selected" = true
		AND "type" = 'voiceover'
		AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "idx_assets_scene_background_music_selected"
	ON "assets" ("scene_id")
	WHERE "is_selected" = true
		AND "type" = 'background_music'
		AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "idx_assets_shot_image_selected"
	ON "assets" ("shot_id")
	WHERE "is_selected" = true
		AND "shot_id" IS NOT NULL
		AND "stage" = 'images'
		AND "deleted_at" IS NULL;

CREATE UNIQUE INDEX "idx_assets_shot_video_selected"
	ON "assets" ("shot_id")
	WHERE "is_selected" = true
		AND "shot_id" IS NOT NULL
		AND "stage" = 'video'
		AND "deleted_at" IS NULL;
