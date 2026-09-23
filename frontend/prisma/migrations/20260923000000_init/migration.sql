CREATE TYPE "TaskStatus" AS ENUM ('WORKING', 'READY', 'PRIORITY');
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "constraints" TEXT NOT NULL,
    "criteria" TEXT NOT NULL,
    "contacts" TEXT NOT NULL,
    "links" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "status" "TaskStatus" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "teamName" TEXT NOT NULL,
    "idea" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "prototype" TEXT NOT NULL DEFAULT '',
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Application_taskId_createdAt_idx" ON "Application"("taskId", "createdAt");

ALTER TABLE "Application" ADD CONSTRAINT "Application_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
