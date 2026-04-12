CREATE TABLE "motion_graphics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"shot_id" uuid NOT NULL,
	"preset" text NOT NULL,
	"title" text NOT NULL,
	"source_text" text NOT NULL,
	"spec" jsonb NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "motion_graphics_preset_check" CHECK ("motion_graphics"."preset" IN ('lower_third', 'callout'))
);
--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_status_check";--> statement-breakpoint
ALTER TABLE "transition_videos" DROP CONSTRAINT "transition_videos_status_check";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "script_draft" jsonb;--> statement-breakpoint
ALTER TABLE "shots" ADD COLUMN "shot_size" text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE "motion_graphics" ADD CONSTRAINT "motion_graphics_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motion_graphics" ADD CONSTRAINT "motion_graphics_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_motion_graphics_scene_id" ON "motion_graphics" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "idx_motion_graphics_shot_id" ON "motion_graphics" USING btree ("shot_id");--> statement-breakpoint
CREATE INDEX "idx_motion_graphics_deleted" ON "motion_graphics" USING btree ("deleted_at");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_status_check" CHECK ("assets"."status" IN ('queued', 'generating', 'finalizing', 'done', 'error'));--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_shot_size_check" CHECK ("shots"."shot_size" IN ('extreme-wide', 'wide', 'medium', 'close-up', 'extreme-close-up', 'insert'));--> statement-breakpoint
ALTER TABLE "transition_videos" ADD CONSTRAINT "transition_videos_status_check" CHECK ("transition_videos"."status" IN ('queued', 'generating', 'finalizing', 'done', 'error'));