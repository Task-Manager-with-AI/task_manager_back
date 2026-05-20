-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('REGULAR', 'DAILY', 'SPRINT_PLANNING');

-- CreateEnum
CREATE TYPE "SprintHealth" AS ENUM ('GREEN', 'YELLOW', 'RED');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "meetingType" "MeetingType" NOT NULL DEFAULT 'REGULAR';

-- CreateTable
CREATE TABLE "DailyAnalysis" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "sprintHealth" "SprintHealth" NOT NULL DEFAULT 'GREEN',
    "overallBlockers" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyEntry" (
    "id" TEXT NOT NULL,
    "dailyAnalysisId" TEXT NOT NULL,
    "participantName" TEXT NOT NULL,
    "yesterday" TEXT NOT NULL,
    "today" TEXT NOT NULL,
    "blockers" TEXT[],

    CONSTRAINT "DailyEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoKanbanUpdate" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "taskId" TEXT,
    "taskTitle" TEXT NOT NULL,
    "newStatus" TEXT NOT NULL,
    "mentionedBy" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "applied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoKanbanUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyAnalysis_meetingId_key" ON "DailyAnalysis"("meetingId");

-- CreateIndex
CREATE INDEX "DailyEntry_dailyAnalysisId_idx" ON "DailyEntry"("dailyAnalysisId");

-- CreateIndex
CREATE INDEX "AutoKanbanUpdate_meetingId_idx" ON "AutoKanbanUpdate"("meetingId");

-- AddForeignKey
ALTER TABLE "DailyAnalysis" ADD CONSTRAINT "DailyAnalysis_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyEntry" ADD CONSTRAINT "DailyEntry_dailyAnalysisId_fkey" FOREIGN KEY ("dailyAnalysisId") REFERENCES "DailyAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoKanbanUpdate" ADD CONSTRAINT "AutoKanbanUpdate_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
