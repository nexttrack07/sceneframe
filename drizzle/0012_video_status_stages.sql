ALTER TABLE "assets" DROP CONSTRAINT IF EXISTS "assets_status_check";
ALTER TABLE "assets"
ADD CONSTRAINT "assets_status_check"
CHECK ("assets"."status" IN ('queued', 'generating', 'finalizing', 'done', 'error'));

ALTER TABLE "transition_videos" DROP CONSTRAINT IF EXISTS "transition_videos_status_check";
ALTER TABLE "transition_videos"
ADD CONSTRAINT "transition_videos_status_check"
CHECK ("transition_videos"."status" IN ('queued', 'generating', 'finalizing', 'done', 'error'));
