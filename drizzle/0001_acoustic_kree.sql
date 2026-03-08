CREATE TABLE "shots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"order" double precision NOT NULL,
	"description" text NOT NULL,
	"shot_type" text NOT NULL,
	"duration_sec" integer DEFAULT 5 NOT NULL,
	"timestamp_start" double precision,
	"timestamp_end" double precision,
	"image_prompt" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shots_shot_type_check" CHECK ("shots"."shot_type" IN ('talking', 'visual')),
	CONSTRAINT "shots_duration_check" CHECK ("shots"."duration_sec" BETWEEN 1 AND 10),
	CONSTRAINT "shots_description_check" CHECK (trim("shots"."description") != '')
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "shot_id" uuid;--> statement-breakpoint
ALTER TABLE "shots" ADD CONSTRAINT "shots_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_shots_scene_id" ON "shots" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "idx_shots_deleted" ON "shots" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_shots_scene_order" ON "shots" USING btree ("scene_id","order");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_shot_id_shots_id_fk" FOREIGN KEY ("shot_id") REFERENCES "public"."shots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assets_shot_id" ON "assets" USING btree ("shot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_assets_shot_selected" ON "assets" USING btree ("shot_id","type") WHERE "assets"."is_selected" = true AND "assets"."shot_id" IS NOT NULL;