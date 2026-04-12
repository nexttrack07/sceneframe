ALTER TABLE "projects" ADD COLUMN "workshop_busy_until" timestamp with time zone;

ALTER TABLE "messages" ADD COLUMN "client_message_id" uuid;

CREATE UNIQUE INDEX "uq_messages_project_client_msg"
  ON "messages" ("project_id", "client_message_id")
  WHERE "client_message_id" IS NOT NULL;
