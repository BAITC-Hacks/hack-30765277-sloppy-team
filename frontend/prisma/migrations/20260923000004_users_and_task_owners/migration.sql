CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- Existing tasks remain intact and unowned; ownership is never guessed.
ALTER TABLE "Task" ADD COLUMN "ownerId" TEXT;
CREATE INDEX "Task_ownerId_idx" ON "Task"("ownerId");
ALTER TABLE "Task" ADD CONSTRAINT "Task_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
