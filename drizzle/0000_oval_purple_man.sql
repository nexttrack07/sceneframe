CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"type" text NOT NULL,
	"stage" text NOT NULL,
	"prompt" text,
	"model" text,
	"model_settings" jsonb,
	"url" text,
	"storage_key" text,
	"thumbnail_url" text,
	"thumbnail_storage_key" text,
	"width" integer,
	"height" integer,
	"duration_ms" integer,
	"file_size_bytes" bigint,
	"status" text DEFAULT 'generating' NOT NULL,
	"is_selected" boolean DEFAULT false NOT NULL,
	"batch_id" uuid,
	"error_message" text,
	"generation_id" text,
	"job_id" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_type_check" CHECK ("assets"."type" IN ('start_image', 'end_image', 'video', 'voiceover', 'background_music')),
	CONSTRAINT "assets_status_check" CHECK ("assets"."status" IN ('generating', 'done', 'error')),
	CONSTRAINT "assets_type_stage_check" CHECK (("assets"."type" IN ('start_image', 'end_image') AND "assets"."stage" = 'images')
       OR ("assets"."type" = 'video' AND "assets"."stage" = 'video')
       OR ("assets"."type" IN ('voiceover', 'background_music') AND "assets"."stage" = 'audio'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_role_check" CHECK ("messages"."role" IN ('system', 'user', 'assistant'))
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"director_prompt" text DEFAULT '' NOT NULL,
	"script_raw" text,
	"script_status" text DEFAULT 'idle' NOT NULL,
	"script_job_id" text,
	"settings" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_script_status_check" CHECK ("projects"."script_status" IN ('idle', 'generating', 'done', 'error'))
);
--> statement-breakpoint
CREATE TABLE "reference_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"url" text NOT NULL,
	"storage_key" text,
	"label" text,
	"type" text DEFAULT 'reference' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_images_type_check" CHECK ("reference_images"."type" IN ('reference', 'character'))
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"order" double precision NOT NULL,
	"title" text,
	"description" text NOT NULL,
	"start_frame_prompt" text,
	"end_frame_prompt" text,
	"stage" text DEFAULT 'script' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idx_scenes_project_order" UNIQUE("project_id","order"),
	CONSTRAINT "scenes_stage_check" CHECK ("scenes"."stage" IN ('script', 'images', 'video', 'audio')),
	CONSTRAINT "scenes_description_check" CHECK (trim("scenes"."description") != '')
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_key_enc" text,
	"provider_key_dek" text,
	"onboarding_complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_images" ADD CONSTRAINT "reference_images_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_assets_scene_id" ON "assets" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "idx_assets_scene_stage" ON "assets" USING btree ("scene_id","stage");--> statement-breakpoint
CREATE INDEX "idx_assets_batch_id" ON "assets" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_assets_deleted" ON "assets" USING btree ("deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_assets_selected" ON "assets" USING btree ("scene_id","type") WHERE "assets"."is_selected" = true;--> statement-breakpoint
CREATE INDEX "idx_messages_project_id" ON "messages" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_projects_user_id" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_projects_deleted" ON "projects" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_reference_images_project_id" ON "reference_images" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_reference_images_deleted" ON "reference_images" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_scenes_project_id" ON "scenes" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_scenes_project_stage" ON "scenes" USING btree ("project_id","stage");--> statement-breakpoint
CREATE INDEX "idx_scenes_deleted" ON "scenes" USING btree ("deleted_at");