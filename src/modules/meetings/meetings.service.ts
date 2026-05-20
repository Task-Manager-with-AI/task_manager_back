import { prisma } from "../../prisma/client";
import { AppError } from "../../shared/errors/AppError";
import {
  findMeetingsByProject,
  findMeetingWithMembership,
  createMeeting,
  updateMeetingStatus,
  findAllMeetingsForUser,
  findDailyAnalysisByMeeting,
} from "./meetings.repository";
import type { CreateMeetingDto } from "./meetings.schema";
import * as audioStorage from "../../services/audio-storage.service";
import * as aiClient from "../../services/ai-client.service";
import { MeetingType, SprintHealth, TaskPriority } from "@prisma/client";
import { getSignalingServer } from "../../signaling/signaling.server";

export async function listProjectMeetings(projectId: string) {
  return findMeetingsByProject(projectId);
}

export async function listAllMeetings(userId: string) {
  return findAllMeetingsForUser(userId);
}

export async function getMeeting(meetingId: string, userId: string) {
  const meeting = await findMeetingWithMembership(meetingId, userId);
  if (!meeting) throw new AppError("Meeting not found or access denied", 404);
  return meeting;
}

export async function getDailyAnalysis(meetingId: string, userId: string) {
  const meeting = await findMeetingWithMembership(meetingId, userId);
  if (!meeting) throw new AppError("Meeting not found or access denied", 404);
  if (meeting.meetingType !== "DAILY") {
    throw new AppError("This meeting is not a Daily Scrum", 400);
  }
  const analysis = await findDailyAnalysisByMeeting(meetingId);
  if (!analysis) throw new AppError("Daily analysis not found", 404);
  return analysis;
}

export async function getKanbanUpdates(meetingId: string, userId: string) {
  const meeting = await findMeetingWithMembership(meetingId, userId);
  if (!meeting) throw new AppError("Meeting not found or access denied", 404);
  return prisma.autoKanbanUpdate.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
  });
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
          tasks: {
            include: { column: { select: { id: true, title: true } } },
          },
          kanbanColumns: { orderBy: { position: "asc" } },
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
    // ── Step 1: Transcribe audio ──────────────────────────────────────────
    const audioBuffer = await audioStorage.readAudio(meeting.audioUrl);
    const extToMime: Record<string, string> = {
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      wav: "audio/wav",
      ogg: "audio/ogg",
      flac: "audio/flac",
      aac: "audio/aac",
      mp4: "video/mp4",
      mov: "video/quicktime",
      avi: "video/x-msvideo",
      mkv: "video/x-matroska",
      webm: "video/webm",
    };
    const urlExt = (meeting.audioUrl.split(".").pop() ?? "webm").toLowerCase();
    const mimeFromPath = extToMime[urlExt] ?? "audio/webm";

    const transcription = await aiClient.transcribeAudio(
      audioBuffer,
      meeting.audioUrl.split("/").pop() ?? "audio.webm",
      mimeFromPath
    );

    const participantNames = meeting.participants
      .map((p) => p.user.name)
      .filter(Boolean);

    const projectMembers = meeting.project.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
    }));

    // ── Step 2: Detect meeting type ───────────────────────────────────────
    const typeResult = await aiClient.detectMeetingType({
      transcript: transcription.transcript,
      meeting_title: meeting.title,
      participants: participantNames,
    });

    const detectedType = typeResult.meeting_type as MeetingType;
    await updateMeetingStatus(meetingId, { meetingType: detectedType });

    console.log(
      `[meeting ${meetingId}] detected type: ${detectedType} (confidence: ${typeResult.confidence})`
    );

    // ── Step 3: Detect Kanban updates (always, regardless of type) ────────
    const existingTasks = meeting.project.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      column_title: t.column?.title ?? "Unknown",
    }));

    const kanbanResult = await aiClient.detectKanbanUpdates({
      transcript: transcription.transcript,
      existing_tasks: existingTasks,
    }).catch((err) => {
      console.warn(`[meeting ${meetingId}] kanban detection failed (non-fatal)`, err);
      return { updates: [] };
    });

    if (kanbanResult.updates.length > 0) {
      // Persist detected updates
      await prisma.autoKanbanUpdate.createMany({
        data: kanbanResult.updates.map((u) => ({
          meetingId,
          taskId: u.task_id ?? null,
          taskTitle: u.task_title,
          newStatus: u.new_status,
          mentionedBy: u.mentioned_by,
          confidence: u.confidence,
          notes: u.notes ?? null,
          applied: false,
        })),
      });

      // Auto-apply DONE updates: move matched tasks to the last (rightmost) column
      const doneColumn = meeting.project.kanbanColumns[meeting.project.kanbanColumns.length - 1];
      if (doneColumn) {
        const doneUpdates = kanbanResult.updates.filter(
          (u) => u.new_status === "DONE" && u.task_id
        );
        for (const update of doneUpdates) {
          await prisma.task.update({
            where: { id: update.task_id! },
            data: { columnId: doneColumn.id },
          }).catch((err) =>
            console.warn(`[meeting ${meetingId}] failed to move task ${update.task_id}`, err)
          );
          // Mark as applied
          await prisma.autoKanbanUpdate.updateMany({
            where: { meetingId, taskId: update.task_id },
            data: { applied: true },
          });
        }
      }
    }

    io?.to(`meeting:${meetingId}`).emit("meeting:kanban-updated", {
      meetingId,
      updates: kanbanResult.updates.length,
    });

    // ── Step 4: Type-specific analysis ───────────────────────────────────
    if (detectedType === "DAILY") {
      await processDailyPipeline(meetingId, meeting, transcription, participantNames, io);
    } else if (detectedType === "SPRINT_PLANNING") {
      await processSprintPipeline(meetingId, meeting, transcription, participantNames, projectMembers, io);
    } else {
      await processRegularPipeline(meetingId, meeting, transcription, participantNames, projectMembers, io);
    }
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

async function processDailyPipeline(
  meetingId: string,
  meeting: any,
  transcription: aiClient.TranscribeResult,
  participantNames: string[],
  io: any
) {
  const dailyResult = await aiClient.analyzeDaily({
    transcript: transcription.transcript,
    participants: participantNames,
  });

  // Persist DailyAnalysis + DailyEntries
  await prisma.$transaction(async (tx) => {
    await tx.dailyAnalysis.create({
      data: {
        meetingId,
        sprintHealth: (["GREEN", "YELLOW", "RED"].includes(dailyResult.sprint_health)
          ? dailyResult.sprint_health
          : "GREEN") as SprintHealth,
        overallBlockers: dailyResult.overall_blockers,
        entries: {
          create: dailyResult.entries.map((e) => ({
            participantName: e.participant_name,
            yesterday: e.yesterday,
            today: e.today,
            blockers: e.blockers,
          })),
        },
      },
    });

    await tx.meeting.update({
      where: { id: meetingId },
      data: { status: "PROCESSED", errorMessage: null },
    });
  });

  io?.to(`meeting:${meetingId}`).emit("meeting:daily-ready", {
    meetingId,
    sprintHealth: dailyResult.sprint_health,
    blockersCount: dailyResult.overall_blockers.length,
  });
}

async function processSprintPipeline(
  meetingId: string,
  meeting: any,
  transcription: aiClient.TranscribeResult,
  participantNames: string[],
  projectMembers: { id: string; name: string }[],
  io: any
) {
  // For sprint planning: generate minutes + sprint-specific analysis
  const [minutes, sprintResult] = await Promise.all([
    aiClient.generateMinutes({
      transcript: transcription.transcript,
      meeting_title: meeting.title,
      participants: participantNames,
    }),
    aiClient.analyzeSprintPlanning({
      transcript: transcription.transcript,
      meeting_title: meeting.title,
      participants: participantNames,
      project_members: projectMembers,
    }),
  ]);

  // Build suggestions from sprint tasks
  const sprintSuggestions = sprintResult.tasks.map((t) => ({
    title: t.title,
    description: t.description ?? null,
    priority: (["LOW", "MEDIUM", "HIGH"].includes(t.priority)
      ? t.priority
      : "MEDIUM") as TaskPriority,
    suggestedForId: t.suggested_responsible_id ?? null,
  }));

  const minute = await prisma.$transaction(async (tx) => {
    const created = await tx.minute.create({
      data: {
        meetingId,
        transcript: transcription.transcript,
        summary: sprintResult.sprint_goal
          ? `**Objetivo del Sprint:** ${sprintResult.sprint_goal}\n\n${minutes.summary}`
          : minutes.summary,
        keyPoints: [
          ...(sprintResult.sprint_goal ? [`Objetivo: ${sprintResult.sprint_goal}`] : []),
          ...sprintResult.user_stories.map((s) => `Historia: ${s}`),
          ...minutes.key_points,
        ],
        language: transcription.language || "es",
        agreements: {
          create: minutes.agreements.map((a) => ({
            order: a.order,
            text: a.text,
          })),
        },
        taskSuggestions: {
          create: sprintSuggestions,
        },
      },
    });

    await tx.meeting.update({
      where: { id: meetingId },
      data: { status: "PROCESSED", errorMessage: null },
    });

    return created;
  });

  io?.to(`meeting:${meetingId}`).emit("meeting:minutes-ready", {
    meetingId,
    minuteId: minute.id,
    meetingType: "SPRINT_PLANNING",
  });
}

async function processRegularPipeline(
  meetingId: string,
  meeting: any,
  transcription: aiClient.TranscribeResult,
  participantNames: string[],
  projectMembers: { id: string; name: string }[],
  io: any
) {
  const minutes = await aiClient.generateMinutes({
    transcript: transcription.transcript,
    meeting_title: meeting.title,
    participants: participantNames,
  });

  const suggestionsResult = await aiClient.extractSuggestions({
    agreements: minutes.agreements.map((a) => a.text),
    project_members: projectMembers,
  });

  const minute = await prisma.$transaction(async (tx) => {
    const created = await tx.minute.create({
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

    return created;
  });

  io?.to(`meeting:${meetingId}`).emit("meeting:minutes-ready", {
    meetingId,
    minuteId: minute.id,
    meetingType: "REGULAR",
  });
}

export async function markParticipantJoined(meetingId: string, userId: string) {
  const { recordParticipantJoin } = await import("./meetings.repository");
  return recordParticipantJoin(meetingId, userId);
}

export async function markParticipantLeft(meetingId: string, userId: string) {
  const { recordParticipantLeave } = await import("./meetings.repository");
  return recordParticipantLeave(meetingId, userId);
}
