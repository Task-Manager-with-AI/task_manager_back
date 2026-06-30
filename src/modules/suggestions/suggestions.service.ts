import { prisma } from "../../prisma/client";
import { AppError } from "../../shared/errors/AppError";
import {
  findMinuteWithMembership,
  findSuggestionsByMinute,
  findSuggestionWithMembership,
} from "./suggestions.repository";
import type {
  AcceptSuggestionDto,
  UpdateSuggestionDto,
} from "./suggestions.schema";
import { TaskPriority } from "@prisma/client";

export async function listMinuteSuggestions(minuteId: string, userId: string) {
  const minute = await findMinuteWithMembership(minuteId, userId);
  if (!minute) throw new AppError("Minute not found or access denied", 404);
  return findSuggestionsByMinute(minuteId);
}

export async function updateSuggestion(
  suggestionId: string,
  userId: string,
  dto: UpdateSuggestionDto
) {
  const suggestion = await findSuggestionWithMembership(suggestionId, userId);
  if (!suggestion) {
    throw new AppError("Suggestion not found or access denied", 404);
  }
  if (suggestion.status === "ACCEPTED") {
    throw new AppError("Cannot edit an accepted suggestion", 400);
  }

  return prisma.taskSuggestion.update({
    where: { id: suggestionId },
    data: {
      title: dto.title,
      description: dto.description,
      priority: dto.priority as TaskPriority | undefined,
      suggestedForId: dto.suggestedForId,
      status: "EDITED",
    },
  });
}

export async function rejectSuggestion(suggestionId: string, userId: string) {
  const suggestion = await findSuggestionWithMembership(suggestionId, userId);
  if (!suggestion) {
    throw new AppError("Suggestion not found or access denied", 404);
  }
  if (suggestion.status === "ACCEPTED") {
    throw new AppError("Cannot reject an accepted suggestion", 400);
  }
  return prisma.taskSuggestion.update({
    where: { id: suggestionId },
    data: { status: "REJECTED" },
  });
}

export async function acceptSuggestion(
  suggestionId: string,
  userId: string,
  dto: AcceptSuggestionDto
) {
  const suggestion = await findSuggestionWithMembership(suggestionId, userId);
  if (!suggestion) {
    throw new AppError("Suggestion not found or access denied", 404);
  }
  if (suggestion.status === "ACCEPTED" && suggestion.taskId) {
    throw new AppError("Suggestion already accepted", 400);
  }

  const projectId = suggestion.minute.meeting.projectId;

  const responsibleId = dto.responsibleId ?? suggestion.suggestedForId;
  if (responsibleId) {
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: responsibleId, projectId } },
    });
    if (!membership || !membership.isActive) {
      throw new AppError(
        "Responsible user is not an active member of this project",
        400
      );
    }
  }

  const finalTitle = dto.title ?? suggestion.title;
  const finalDescription =
    dto.description === undefined ? suggestion.description : dto.description;
  const finalPriority = (dto.priority ?? suggestion.priority) as TaskPriority;

  const result = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: finalTitle,
        description: finalDescription ?? undefined,
        priority: finalPriority,
        projectId,
        // No columnId/sprintId → task lands in the Product Backlog
        createdById: userId,
        responsibleId: responsibleId ?? undefined,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        responsible: { select: { id: true, name: true, email: true } },
        project: { select: { id: true, name: true } },
        column: { select: { id: true, title: true, color: true, position: true } },
      },
    });

    const updatedSuggestion = await tx.taskSuggestion.update({
      where: { id: suggestionId },
      data: { status: "ACCEPTED", taskId: task.id },
    });

    return { task, suggestion: updatedSuggestion };
  });

  return result;
}
