import { prisma } from "../../prisma/client";
import { AppError } from "../../shared/errors/AppError";
import {
  findTasksByProject,
  findTaskWithMembership,
  findFirstColumnId,
  createTask,
  updateTask,
  updateTaskColumn,
  deleteTask,
} from "./tasks.repository";
import { findColumnById, findDoneColumnId } from "../kanban/kanban.repository";
import type { CreateTaskDto, UpdateTaskDto, UpdateColumnDto } from "./tasks.schema";
import { TaskPriority } from "@prisma/client";
import { enqueueSafe } from "../copilot/indexing/indexing.service";
import { deleteBySource } from "../copilot/indexing/knowledge.repository";
import { notifySafe } from "../notifications/notifications.service";

export async function listProjectTasks(projectId: string) {
  return findTasksByProject(projectId);
}

export async function getTask(taskId: string, userId: string) {
  const task = await findTaskWithMembership(taskId, userId);
  if (!task) throw new AppError("Task not found or access denied", 404);
  return task;
}

export async function createNewTask(
  dto: CreateTaskDto,
  projectId: string,
  createdById: string
) {
  if (dto.responsibleId) {
    const membership = await prisma.projectMember.findUnique({
      where: {
        userId_projectId: { userId: dto.responsibleId, projectId },
      },
    });
    if (!membership || !membership.isActive) {
      throw new AppError("Responsible user is not an active member of this project", 400);
    }
  }

  let columnId = dto.columnId;
  if (columnId) {
    const column = await findColumnById(columnId, projectId);
    if (!column) throw new AppError("Column not found in this project", 400);
  } else {
    columnId = (await findFirstColumnId(projectId)) ?? undefined;
    if (!columnId) {
      throw new AppError("Kanban columns are not configured for this project", 500);
    }
  }

  const created = await createTask({
    title: dto.title,
    description: dto.description,
    dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    priority: dto.priority as TaskPriority,
    projectId,
    columnId,
    createdById,
    responsibleId: dto.responsibleId,
  });
  enqueueSafe(projectId, "TASK", created.id);
  if (dto.responsibleId) {
    notifySafe({
      type: "TASK_ASSIGNED",
      recipientIds: [dto.responsibleId],
      actorId: createdById,
      data: { taskId: created.id, taskTitle: created.title, projectId },
    });
  }
  return created;
}

export async function updateExistingTask(
  taskId: string,
  userId: string,
  dto: UpdateTaskDto
) {
  const task = await findTaskWithMembership(taskId, userId);
  if (!task) throw new AppError("Task not found or access denied", 404);

  if (dto.responsibleId) {
    const membership = await prisma.projectMember.findUnique({
      where: {
        userId_projectId: { userId: dto.responsibleId, projectId: task.projectId },
      },
    });
    if (!membership || !membership.isActive) {
      throw new AppError("Responsible user is not an active member of this project", 400);
    }
  }

  const updated = await updateTask(taskId, {
    title: dto.title,
    description: dto.description,
    dueDate: dto.dueDate ? new Date(dto.dueDate) : dto.dueDate === null ? null : undefined,
    priority: dto.priority as TaskPriority | undefined,
    responsibleId: dto.responsibleId,
  });
  enqueueSafe(task.projectId, "TASK", taskId);
  // Notify the newly assigned responsible (if it changed to someone else).
  if (
    dto.responsibleId &&
    dto.responsibleId !== task.responsibleId &&
    dto.responsibleId !== userId
  ) {
    notifySafe({
      type: "TASK_ASSIGNED",
      recipientIds: [dto.responsibleId],
      actorId: userId,
      data: { taskId, taskTitle: updated.title, projectId: task.projectId },
    });
  }
  return updated;
}

export async function changeTaskColumn(
  taskId: string,
  userId: string,
  dto: UpdateColumnDto
) {
  const task = await findTaskWithMembership(taskId, userId);
  if (!task) throw new AppError("Task not found or access denied", 404);

  const column = await findColumnById(dto.columnId, task.projectId);
  if (!column) throw new AppError("Column not found in this project", 400);

  const doneColumnId = await findDoneColumnId(task.projectId);
  const isMovingToDone = doneColumnId === dto.columnId;
  const isLeavingDone = doneColumnId === task.columnId && !isMovingToDone;

  let completedAt: Date | null | undefined;
  if (isMovingToDone) {
    completedAt = new Date();
  } else if (isLeavingDone) {
    completedAt = null;
  }

  const moved = await updateTaskColumn(taskId, dto.columnId, completedAt);
  enqueueSafe(task.projectId, "TASK", taskId);
  // Notify the responsible + creator (excluding whoever moved it).
  const watchers = [task.responsibleId, task.createdById].filter(
    (id): id is string => Boolean(id)
  );
  notifySafe({
    type: "TASK_STATUS_CHANGED",
    recipientIds: watchers,
    actorId: userId,
    data: {
      taskId,
      taskTitle: task.title,
      projectId: task.projectId,
      status: column.title,
    },
  });
  return moved;
}

export async function removeTask(taskId: string, userId: string) {
  const task = await findTaskWithMembership(taskId, userId);
  if (!task) throw new AppError("Task not found or access denied", 404);
  const result = await deleteTask(taskId);
  // Remove the task's chunks from the knowledge index.
  deleteBySource("TASK", taskId).catch((err) =>
    console.error(`[copilot] failed to remove chunks for task ${taskId}`, err)
  );
  return result;
}
