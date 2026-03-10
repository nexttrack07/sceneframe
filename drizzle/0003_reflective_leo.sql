CREATE TABLE "transition_videos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"from_shot_id" uuid NOT NULL,
	"to_shot_id" uuid NOT NULL,
	"from_image_id" uuid,
	"to_image_id" uuid,
	"prompt" text,
	"model" text DEFAULT 'kwaivgi/kling-v3-omni-video' NOT NULL,
	"model_settings" jsonb,
	"generation_id" text,
	"url" text,
	"storage_key" text,
	"status" text DEFAULT 'generating' NOT NULL,
	"error_message" text,
	"is_selected" boolean DEFAULT false NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transition_videos_status_check" CHECK ("transition_videos"."status" IN ('generating', 'done', 'error'))
);
--> statement-breakpoint
ALTER TABLE "transition_videos" ADD CONSTRAINT "transition_videos_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transition_videos" ADD CONSTRAINT "transition_videos_from_shot_id_shots_id_fk" FOREIGN KEY ("from_shot_id") REFERENCES "public"."shots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transition_videos" ADD CONSTRAINT "transition_videos_to_shot_id_shots_id_fk" FOREIGN KEY ("to_shot_id") REFERENCES "public"."shots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transition_videos" ADD CONSTRAINT "transition_videos_from_image_id_assets_id_fk" FOREIGN KEY ("from_image_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transition_videos" ADD CONSTRAINT "transition_videos_to_image_id_assets_id_fk" FOREIGN KEY ("to_image_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_transition_videos_scene_id" ON "transition_videos" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "idx_transition_videos_from_shot" ON "transition_videos" USING btree ("from_shot_id");--> statement-breakpoint
CREATE INDEX "idx_transition_videos_to_shot" ON "transition_videos" USING btree ("to_shot_id");--> statement-breakpoint
CREATE INDEX "idx_transition_videos_deleted" ON "transition_videos" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_transition_videos_generation_id" ON "transition_videos" USING btree ("generation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_transition_videos_selected" ON "transition_videos" USING btree ("from_shot_id","to_shot_id") WHERE "transition_videos"."is_selected" = true AND "transition_videos"."deleted_at" IS NULL;