-- CreateTable
CREATE TABLE "KanbanColumn" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KanbanColumn_pkey" PRIMARY KEY ("id")
);

-- Add columnId nullable first
ALTER TABLE "Task" ADD COLUMN "columnId" TEXT;

-- Seed default columns per project and map tasks from status
DO $$
DECLARE
  proj RECORD;
  col_pending TEXT;
  col_progress TEXT;
  col_done TEXT;
BEGIN
  FOR proj IN SELECT id FROM "Project" LOOP
    col_pending := gen_random_uuid()::text;
    col_progress := gen_random_uuid()::text;
    col_done := gen_random_uuid()::text;

    INSERT INTO "KanbanColumn" ("id", "projectId", "title", "position", "color", "createdAt", "updatedAt")
    VALUES
      (col_pending, proj.id, 'Pending', 0, 'amber', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      (col_progress, proj.id, 'In Progress', 1, 'violet', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      (col_done, proj.id, 'Done', 2, 'emerald', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

    UPDATE "Task" SET "columnId" = col_pending
    WHERE "projectId" = proj.id AND "status" = 'PENDING';

    UPDATE "Task" SET "columnId" = col_progress
    WHERE "projectId" = proj.id AND "status" = 'IN_PROGRESS';

    UPDATE "Task" SET "columnId" = col_done
    WHERE "projectId" = proj.id AND "status" = 'DONE';

    UPDATE "Task" SET "columnId" = col_pending
    WHERE "projectId" = proj.id AND "columnId" IS NULL;
  END LOOP;
END $$;

-- Drop status and enforce columnId
ALTER TABLE "Task" DROP COLUMN "status";
ALTER TABLE "Task" ALTER COLUMN "columnId" SET NOT NULL;

DROP TYPE "TaskStatus";

-- Indexes and FKs
CREATE INDEX "KanbanColumn_projectId_idx" ON "KanbanColumn"("projectId");
CREATE UNIQUE INDEX "KanbanColumn_projectId_position_key" ON "KanbanColumn"("projectId", "position");
CREATE INDEX "Task_columnId_idx" ON "Task"("columnId");

ALTER TABLE "KanbanColumn" ADD CONSTRAINT "KanbanColumn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "KanbanColumn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
