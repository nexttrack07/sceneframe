ALTER TABLE "scenes" DROP CONSTRAINT IF EXISTS "idx_scenes_project_order";
DROP INDEX IF EXISTS "idx_scenes_project_order";

CREATE UNIQUE INDEX "idx_scenes_project_order"
	ON "scenes" ("project_id", "order")
	WHERE "deleted_at" IS NULL;
