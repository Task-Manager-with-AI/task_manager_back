import { prisma } from "../../prisma/client";
import { MeetingStatus, MeetingType } from "@prisma/client";

const userSelect = { id: true, name: true, email: true };

const meetingInclude = {
  createdBy: { select: userSelect },
  participants: { include: { user: { select: userSelect } } },
  project: { select: { id: true, name: true } },
  minute: { select: { id: true, summary: true } },
  dailyAnalysis: { select: { id: true, sprintHealth: true } },
};

export async function findMeetingsByProject(projectId: string) {
  return prisma.meeting.findMany({
    where: { projectId },
    include: meetingInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function findMeetingById(meetingId: string) {
  return prisma.meeting.findUnique({
    where: { id: meetingId },
    include: meetingInclude,
  });
}

export async function findMeetingWithMembership(
  meetingId: string,
  userId: string
) {
  return prisma.meeting.findFirst({
    where: {
      id: meetingId,
      project: { members: { some: { userId, isActive: true } } },
    },
    include: meetingInclude,
  });
}

export async function createMeeting(data: {
  title: string;
  description?: string;
  projectId: string;
  createdById: string;
  scheduledAt?: Date;
  participantIds: string[];
}) {
  return prisma.meeting.create({
    data: {
      title: data.title,
      description: data.description,
      projectId: data.projectId,
      createdById: data.createdById,
      scheduledAt: data.scheduledAt,
      participants: {
        create: data.participantIds.map((userId) => ({ userId })),
      },
    },
    include: meetingInclude,
  });
}

export async function updateMeetingStatus(
  meetingId: string,
  data: {
    status?: MeetingStatus;
    meetingType?: MeetingType;
    startedAt?: Date;
    endedAt?: Date;
    audioUrl?: string;
    errorMessage?: string | null;
  }
) {
  return prisma.meeting.update({
    where: { id: meetingId },
    data,
    include: meetingInclude,
  });
}

export async function findAllMeetingsForUser(userId: string) {
  return prisma.meeting.findMany({
    where: {
      project: {
        members: { some: { userId, isActive: true } },
      },
    },
    include: meetingInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function findDailyAnalysisByMeeting(meetingId: string) {
  return prisma.dailyAnalysis.findUnique({
    where: { meetingId },
    include: { entries: true },
  });
}

export async function recordParticipantJoin(
  meetingId: string,
  userId: string
) {
  return prisma.meetingParticipant.upsert({
    where: { meetingId_userId: { meetingId, userId } },
    create: { meetingId, userId, joinedAt: new Date() },
    update: { joinedAt: new Date(), leftAt: null },
  });
}

export async function recordParticipantLeave(
  meetingId: string,
  userId: string
) {
  return prisma.meetingParticipant.update({
    where: { meetingId_userId: { meetingId, userId } },
    data: { leftAt: new Date() },
  }).catch(() => null);
}
