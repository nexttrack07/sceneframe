ALTER TABLE "reference_images" ADD COLUMN "character_id" text;--> statement-breakpoint
CREATE INDEX "idx_reference_images_character_id" ON "reference_images" USING btree ("character_id");