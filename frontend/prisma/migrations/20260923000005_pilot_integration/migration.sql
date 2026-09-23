ALTER TABLE "Application" ADD COLUMN "deadline" TEXT NOT NULL DEFAULT '';
DROP INDEX IF EXISTS "Application_one_accepted_per_task";
