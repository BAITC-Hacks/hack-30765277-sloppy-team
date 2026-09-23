-- Enforce the invariant even for concurrent writers bypassing the application.
-- PENDING and REJECTED applications remain unlimited.
CREATE UNIQUE INDEX "Application_one_accepted_per_task"
    ON "Application"("taskId") WHERE "status" = 'ACCEPTED';
