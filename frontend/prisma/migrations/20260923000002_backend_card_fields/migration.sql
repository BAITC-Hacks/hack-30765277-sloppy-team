-- Extend existing tasks without dropping or replacing any data.
ALTER TYPE "TaskStatus" ADD VALUE 'DRAFT';
ALTER TABLE "Task"
    ADD COLUMN "expected_result" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "target_audience" TEXT NOT NULL DEFAULT '',
    ADD COLUMN "interaction_format" TEXT NOT NULL DEFAULT '';
