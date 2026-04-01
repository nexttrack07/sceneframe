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

ALTER TABLE "motion_graphics"
	ADD CONSTRAINT "motion_graphics_scene_id_scenes_id_fk"
	FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id")
	ON DELETE no action ON UPDATE no action;

ALTER TABLE "motion_graphics"
	ADD CONSTRAINT "motion_graphics_shot_id_shots_id_fk"
	FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id")
	ON DELETE no action ON UPDATE no action;

CREATE INDEX "idx_motion_graphics_scene_id" ON "motion_graphics" USING btree ("scene_id");
CREATE INDEX "idx_motion_graphics_shot_id" ON "motion_graphics" USING btree ("shot_id");
CREATE INDEX "idx_motion_graphics_deleted" ON "motion_graphics" USING btree ("deleted_at");
