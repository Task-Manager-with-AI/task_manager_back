import { prisma } from "../../prisma/client";
import { AppError } from "../../shared/errors/AppError";
import {
  findTasksByProject,
  findTaskWithMembership,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
} from "./tasks.repository";
import type { CreateTaskDto, UpdateTaskDto, UpdateStatusDto } from "./tasks.schema";
import { TaskPriority, TaskStatus } from "@prisma/client";

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

  return createTask({
    title: dto.title,
    description: dto.description,
    dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    priority: dto.priority as TaskPriority,
    projectId,
    createdById,
    responsibleId: dto.responsibleId,
  });
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

  return updateTask(taskId, {
    title: dto.title,
    description: dto.description,
    dueDate: dto.dueDate ? new Date(dto.dueDate) : dto.dueDate === null ? null : undefined,
    priority: dto.priority as TaskPriority | undefined,
    responsibleId: dto.responsibleId,
  });
}

export async function changeTaskStatus(
  taskId: string,
  userId: string,
  dto: UpdateStatusDto
) {
  const task = await findTaskWithMembership(taskId, userId);
  if (!task) throw new AppError("Task not found or access denied", 404);
  return updateTaskStatus(taskId, dto.status as TaskStatus);
}

export async function removeTask(taskId: string, userId: string) {
  const task = await findTaskWithMembership(taskId, userId);
  if (!task) throw new AppError("Task not found or access denied", 404);
  return deleteTask(taskId);
}
