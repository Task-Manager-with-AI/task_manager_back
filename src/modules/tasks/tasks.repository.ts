import { prisma } from "../../prisma/client";
import { Prisma, TaskPriority, TaskStatus } from "@prisma/client";

const taskInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  responsible: { select: { id: true, name: true, email: true } },
  project: { select: { id: true, name: true } },
};

export async function findTasksByProject(projectId: string) {
  return prisma.task.findMany({
    where: { projectId },
    include: taskInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function findTaskById(id: string) {
  return prisma.task.findUnique({ where: { id }, include: taskInclude });
}

export async function findTaskWithMembership(taskId: string, userId: string) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      project: { members: { some: { userId, isActive: true } } },
    },
    include: taskInclude,
  });
}

export async function createTask(data: {
  title: string;
  description?: string;
  dueDate?: Date;
  priority: TaskPriority;
  projectId: string;
  createdById: string;
  responsibleId?: string;
}) {
  return prisma.task.create({ data, include: taskInclude });
}

export async function updateTask(
  id: string,
  data: {
    title?: string;
    description?: string;
    dueDate?: Date | null;
    priority?: TaskPriority;
    responsibleId?: string | null;
  }
) {
  return prisma.task.update({ where: { id }, data, include: taskInclude });
}

export async function updateTaskStatus(id: string, status: TaskStatus) {
  return prisma.task.update({ where: { id }, data: { status }, include: taskInclude });
}

export async function deleteTask(id: string) {
  return prisma.task.delete({ where: { id } });
}
