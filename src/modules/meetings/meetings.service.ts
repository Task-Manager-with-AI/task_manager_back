import { prisma } from "../../prisma/client";
import { AppError } from "../../shared/errors/AppError";
import {
  findMeetingsByProject,
  findMeetingWithMembership,
  createMeeting,
  updateMeetingStatus,
  recordParticipantJoin,
  recordParticipantLeave,
} from "./meetings.repository";
import type { CreateMeetingDto } from "./meetings.schema";
import * as audioStorage from "../../services/audio-storage.service";
import * as aiClient from "../../services/ai-client.service";
import { TaskPriority } from "@prisma/client";
import { getSignalingServer } from "../../signaling/signaling.server";

export async function listProjectMeetings(projectId: string) {
  return findMeetingsByProject(projectId);
}

export async function getMeeting(meetingId: string, userId: string) {
  const meeting = await findMeetingWithMembership(meetingId, userId);
  if (!meeting) throw new AppError("Meeting not found or access denied", 404);
  return meeting;
}

export async function createNewMeeting(
  dto: CreateMeetingDto,
  projectId: string,
  createdById: string
) {
  if (dto.participantIds.length > 0) {
    const members = await prisma.projectMember.findMany({
      where: {
        projectId,
        isActive: true,
        userId: { in: dto.participantIds },
      },
      select: { userId: true },
    });
    const validIds = new Set(members.map((m) => m.userId));
    const invalid = dto.participantIds.filter((id) => !validIds.has(id));
    if (invalid.length > 0) {
      throw new AppError(
        "Some participants are not active members of this project",
        400
      );
    }
  }

  const participantIds = Array.from(
    new Set([createdById, ...dto.participantIds])
  );

  return createMeeting({
    title: dto.title,
    description: dto.description,
    projectId,
    createdById,
    scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
    participantIds,
  });
}

export async function startMeeting(meetingId: string, userId: string) {
  const meeting = await findMeetingWithMembership(meetingId, userId);
  if (!meeting) throw new AppError("Meeting not found or access denied", 404);
  if (meeting.status === "ENDED" || meeting.status === "PROCESSED") {
    throw new AppError("Meeting already ended", 400);
  }
  return updateMeetingStatus(meetingId, {
    status: "IN_PROGRESS",
    startedAt: meeting.startedAt ?? new Date(),
  });
}

export async function uploadMeetingAudio(
  meetingId: string,
  userId: string,
  audioBuffer: Buffer,
  mimeType: string
) {
  const meeting = await findMeetingWithMembership(meetingId, userId);
  if (!meeting) throw new AppError("Meeting not found or access denied", 404);

  const ext = audioStorage.inferExtensionFromMime(mimeType);
  const audioUrl = await audioStorage.storeAudio(meetingId, audioBuffer, ext);

  return updateMeetingStatus(meetingId, { audioUrl });
}

export async function endMeetingAndProcess(meetingId: string, userId: string) {
  const meeting = await findMeetingWithMembership(meetingId, userId);
  if (!meeting) throw new AppError("Meeting not found or access denied", 404);

  const updated = await updateMeetingStatus(meetingId, {
    status: "ENDED",
    endedAt: new Date(),
  });

  void processMeetingPipeline(meetingId).catch((err) => {
    console.error(`[meeting ${meetingId}] pipeline failed`, err);
  });

  return updated;
}

async function processMeetingPipeline(meetingId: string) {
  const io = getSignalingServer();
  io?.to(`meeting:${meetingId}`).emit("meeting:processing-started", {
    meetingId,
  });

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      participants: { include: { user: { select: { id: true, name: true } } } },
      project: {
        include: {
          members: {
            where: { isActive: true },
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });

  if (!meeting) {
    console.error(`[meeting ${meetingId}] not found during pipeline`);
    return;
  }

  if (!meeting.audioUrl) {
    await updateMeetingStatus(meetingId, {
      status: "FAILED",
      errorMessage: "No audio was uploaded for this meeting",
    });
    io?.to(`meeting:${meetingId}`).emit("meeting:processing-failed", {
      meetingId,
      message: "No audio uploaded",
    });
    return;
  }

  try {
    const audioBuffer = await audioStorage.readAudio(meeting.audioUrl);
    const mimeFromPath = meeting.audioUrl.endsWith(".mp3")
      ? "audio/mpeg"
      : meeting.audioUrl.endsWith(".m4a")
        ? "audio/mp4"
        : meeting.audioUrl.endsWith(".wav")
          ? "audio/wav"
          : "audio/webm";

    const transcription = await aiClient.transcribeAudio(
      audioBuffer,
      meeting.audioUrl.split("/").pop() ?? "audio.webm",
      mimeFromPath
    );

    const participantNames = meeting.participants
      .map((p) => p.user.name)
      .filter(Boolean);

    const minutes = await aiClient.generateMinutes({
      transcript: transcription.transcript,
      meeting_title: meeting.title,
      participants: participantNames,
    });

    const projectMembers = meeting.project.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
    }));

    const suggestionsResult = await aiClient.extractSuggestions({
      agreements: minutes.agreements.map((a) => a.text),
      project_members: projectMembers,
    });

    const minute = await prisma.$transaction(async (tx) => {
      const createdMinute = await tx.minute.create({
        data: {
          meetingId,
          transcript: transcription.transcript,
          summary: minutes.summary,
          keyPoints: minutes.key_points,
          language: transcription.language || "es",
          agreements: {
            create: minutes.agreements.map((a) => ({
              order: a.order,
              text: a.text,
            })),
          },
          taskSuggestions: {
            create: suggestionsResult.suggestions.map((s) => ({
              title: s.title,
              description: s.description ?? null,
              priority: (["LOW", "MEDIUM", "HIGH"].includes(s.priority)
                ? s.priority
                : "MEDIUM") as TaskPriority,
              suggestedForId: s.suggested_responsible_id ?? null,
            })),
          },
        },
      });

      await tx.meeting.update({
        where: { id: meetingId },
        data: { status: "PROCESSED", errorMessage: null },
      });

      return createdMinute;
    });

    io?.to(`meeting:${meetingId}`).emit("meeting:minutes-ready", {
      meetingId,
      minuteId: minute.id,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[meeting ${meetingId}] pipeline error`, err);
    await updateMeetingStatus(meetingId, {
      status: "FAILED",
      errorMessage: message,
    });
    io?.to(`meeting:${meetingId}`).emit("meeting:processing-failed", {
      meetingId,
      message,
    });
  }
}

export async function markParticipantJoined(meetingId: string, userId: string) {
  return recordParticipantJoin(meetingId, userId);
}

export async function markParticipantLeft(meetingId: string, userId: string) {
  return recordParticipantLeave(meetingId, userId);
}
