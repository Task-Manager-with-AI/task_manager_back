import { prisma } from "../../prisma/client";

const userSelect = { id: true, name: true, email: true };

const minuteInclude = {
  agreements: { orderBy: { order: "asc" as const } },
  meeting: {
    select: {
      id: true,
      title: true,
      projectId: true,
      startedAt: true,
      endedAt: true,
    },
  },
  taskSuggestions: {
    include: {
      suggestedFor: { select: userSelect },
      task: {
        select: {
          id: true,
          title: true,
          column: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
};

export async function findMinuteById(minuteId: string) {
  return prisma.minute.findUnique({
    where: { id: minuteId },
    include: minuteInclude,
  });
}

export async function findMinuteByMeeting(meetingId: string) {
  return prisma.minute.findUnique({
    where: { meetingId },
    include: minuteInclude,
  });
}

export async function findMinuteWithMembership(minuteId: string, userId: string) {
  return prisma.minute.findFirst({
    where: {
      id: minuteId,
      meeting: { project: { members: { some: { userId, isActive: true } } } },
    },
    include: minuteInclude,
  });
}

export async function findMinuteByMeetingWithMembership(
  meetingId: string,
  userId: string
) {
  return prisma.minute.findFirst({
    where: {
      meetingId,
      meeting: { project: { members: { some: { userId, isActive: true } } } },
    },
    include: minuteInclude,
  });
}
