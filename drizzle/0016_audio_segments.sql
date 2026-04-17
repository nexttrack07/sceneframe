CREATE TABLE "audio_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"order" double precision NOT NULL,
	"start_shot_id" uuid NOT NULL,
	"end_shot_id" uuid NOT NULL,
	"script" text,
	"voice_id" text,
	"target_duration_sec" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"voiceover_asset_id" uuid,
	"error_message" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audio_segments_status_check" CHECK ("audio_segments"."status" IN ('draft', 'generating', 'done', 'error'))
);

ALTER TABLE "audio_segments"
	ADD CONSTRAINT "audio_segments_project_id_projects_id_fk"
	FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
	ON DELETE no action ON UPDATE no action;

ALTER TABLE "audio_segments"
	ADD CONSTRAINT "audio_segments_start_shot_id_shots_id_fk"
	FOREIGN KEY ("start_shot_id") REFERENCES "public"."shots"("id")
	ON DELETE no action ON UPDATE no action;

ALTER TABLE "audio_segments"
	ADD CONSTRAINT "audio_segments_end_shot_id_shots_id_fk"
	FOREIGN KEY ("end_shot_id") REFERENCES "public"."shots"("id")
	ON DELETE no action ON UPDATE no action;

ALTER TABLE "audio_segments"
	ADD CONSTRAINT "audio_segments_voiceover_asset_id_assets_id_fk"
	FOREIGN KEY ("voiceover_asset_id") REFERENCES "public"."assets"("id")
	ON DELETE no action ON UPDATE no action;

CREATE INDEX "idx_audio_segments_project_id" ON "audio_segments" USING btree ("project_id");
CREATE INDEX "idx_audio_segments_start_shot" ON "audio_segments" USING btree ("start_shot_id");
CREATE INDEX "idx_audio_segments_end_shot" ON "audio_segments" USING btree ("end_shot_id");
CREATE INDEX "idx_audio_segments_deleted" ON "audio_segments" USING btree ("deleted_at");
CREATE INDEX "idx_audio_segments_project_order" ON "audio_segments" USING btree ("project_id", "order");
