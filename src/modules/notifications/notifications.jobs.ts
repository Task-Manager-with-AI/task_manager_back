import { env } from "../../config/env";
import { prisma } from "../../prisma/client";
import { notify } from "./notifications.service";

// In-memory dedupe so a job tick doesn't re-notify the same entity repeatedly.
// Resets on restart (acceptable) and is pruned daily.
const remindedMeetings = new Set<string>();
const notifiedDueSoon = new Set<string>();
const notifiedOverdue = new Set<string>();
let lastPruneDay = new Date().getUTCDate();

function pruneDailySets() {
  const day = new Date().getUTCDate();
  if (day !== lastPruneDay) {
    remindedMeetings.clear();
    notifiedDueSoon.clear();
    notifiedOverdue.clear();
    lastPruneDay = day;
  }
}

/** Meetings starting within the reminder window get a one-time reminder. */
async function runMeetingReminders() {
  const now = new Date();
  const until = new Date(now.getTime() + env.NOTIF_MEETING_REMINDER_MIN * 60_000);

  const meetings = await prisma.meeting.findMany({
    where: { status: "SCHEDULED", scheduledAt: { gte: now, lte: until } },
    select: {
      id: true,
      title: true,
      projectId: true,
      participants: { select: { userId: true } },
    },
  });

  for (const m of meetings) {
    if (remindedMeetings.has(m.id)) continue;
    remindedMeetings.add(m.id);
    try {
      await notify({
        type: "MEETING_REMINDER",
        recipientIds: m.participants.map((p) => p.userId),
        data: { meetingId: m.id, meetingTitle: m.title, projectId: m.projectId },
      });
    } catch (err) {
      console.error("[notifications] MEETING_REMINDER failed:", err);
    }
  }
}

/** Tasks due within 24h (due-soon) or already overdue, with a responsible. */
async function runTaskDeadlines() {
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 60 * 60_000);

  const dueSoon = await prisma.task.findMany({
    where: {
      completedAt: null,
      responsibleId: { not: null },
      dueDate: { gte: now, lte: in24h },
    },
    select: { id: true, title: true, projectId: true, responsibleId: true },
  });
  for (const t of dueSoon) {
    if (notifiedDueSoon.has(t.id)) continue;
    notifiedDueSoon.add(t.id);
    try {
      await notify({
        type: "TASK_DUE_SOON",
        recipientIds: [t.responsibleId as string],
        data: { taskId: t.id, taskTitle: t.title, projectId: t.projectId },
      });
    } catch (err) {
      console.error("[notifications] TASK_DUE_SOON failed:", err);
    }
  }

  const overdue = await prisma.task.findMany({
    where: {
      completedAt: null,
      responsibleId: { not: null },
      dueDate: { lt: now },
    },
    select: { id: true, title: true, projectId: true, responsibleId: true },
  });
  for (const t of overdue) {
    if (notifiedOverdue.has(t.id)) continue;
    notifiedOverdue.add(t.id);
    try {
      await notify({
        type: "TASK_OVERDUE",
        recipientIds: [t.responsibleId as string],
        data: { taskId: t.id, taskTitle: t.title, projectId: t.projectId },
      });
    } catch (err) {
      console.error("[notifications] TASK_OVERDUE failed:", err);
    }
  }
}

let timer: NodeJS.Timeout | null = null;

export function startNotificationJobs(): void {
  if (!env.NOTIF_JOBS_ENABLED) {
    console.log("[notifications] jobs disabled (NOTIF_JOBS_ENABLED=false)");
    return;
  }
  if (timer) return;
  const tick = async () => {
    pruneDailySets();
    try {
      await runMeetingReminders();
      await runTaskDeadlines();
    } catch (err) {
      console.error("[notifications] job tick error:", err);
    }
  };
  // Run every minute (reminders need minute granularity).
  timer = setInterval(() => void tick(), 60_000);
  timer.unref?.();
  void tick();
  console.log("[notifications] background jobs started (reminders + deadlines)");
}

export function stopNotificationJobs(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
