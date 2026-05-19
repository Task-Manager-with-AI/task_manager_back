import { prisma } from "../../prisma/client";

const userSelect = { id: true, name: true, email: true };

const suggestionInclude = {
  suggestedFor: { select: userSelect },
  task: { select: { id: true, title: true, status: true } },
  minute: {
    select: {
      id: true,
      meetingId: true,
      meeting: { select: { id: true, title: true, projectId: true } },
    },
  },
};

export async function findSuggestionsByMinute(minuteId: string) {
  return prisma.taskSuggestion.findMany({
    where: { minuteId },
    include: suggestionInclude,
    orderBy: { createdAt: "asc" },
  });
}

export async function findSuggestionWithMembership(
  suggestionId: string,
  userId: string
) {
  return prisma.taskSuggestion.findFirst({
    where: {
      id: suggestionId,
      minute: {
        meeting: {
          project: { members: { some: { userId, isActive: true } } },
        },
      },
    },
    include: suggestionInclude,
  });
}

export async function findMinuteWithMembership(minuteId: string, userId: string) {
  return prisma.minute.findFirst({
    where: {
      id: minuteId,
      meeting: { project: { members: { some: { userId, isActive: true } } } },
    },
    select: { id: true },
  });
}
