ALTER TABLE "shots"
ADD COLUMN "shot_size" text DEFAULT 'medium' NOT NULL;

ALTER TABLE "shots"
ADD CONSTRAINT "shots_shot_size_check"
CHECK ("shots"."shot_size" IN ('extreme-wide', 'wide', 'medium', 'close-up', 'extreme-close-up', 'insert'));
