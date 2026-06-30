import { prisma } from "../../prisma/client";
import { TaskPriority } from "@prisma/client";

const taskInclude = {
  createdBy: { select: { id: true, name: true, email: true } },
  responsible: { select: { id: true, name: true, email: true } },
  project: { select: { id: true, name: true } },
  column: { select: { id: true, title: true, color: true, position: true } },
};

export async function findTasksByProject(
  projectId: string,
  scope?: "backlog" | "kanban" | "all"
) {
  let where: Record<string, unknown> = { projectId };

  if (scope === "backlog") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where = { projectId, sprintId: null, columnId: null } as any;
  } else if (scope === "kanban") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    where = { projectId, columnId: { not: null } } as any;
  }

  return prisma.task.findMany({
    where,
    include: taskInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function findBacklogTasks(projectId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.task.findMany({
    where: { projectId, sprintId: null, columnId: null } as any,
    include: taskInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function findDoneColumnIdFn(projectId: string) {
  const column = await prisma.kanbanColumn.findFirst({
    where: { projectId },
    orderBy: { position: "desc" },
    select: { id: true },
  });
  return column?.id ?? null;
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

export async function findFirstColumnId(projectId: string) {
  const column = await prisma.kanbanColumn.findFirst({
    where: { projectId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  return column?.id ?? null;
}

export async function createTask(data: {
  title: string;
  description?: string;
  dueDate?: Date;
  priority: TaskPriority;
  projectId: string;
  columnId?: string | null;
  sprintId?: string | null;
  storyPoints?: number;
  createdById: string;
  responsibleId?: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.task.create({ data: data as any, include: taskInclude });
}

export async function updateTask(
  id: string,
  data: {
    title?: string;
    description?: string;
    dueDate?: Date | null;
    priority?: TaskPriority;
    responsibleId?: string | null;
    sprintId?: string | null;
    storyPoints?: number;
  }
) {
  return prisma.task.update({ where: { id }, data, include: taskInclude });
}

export async function updateTaskColumn(
  id: string,
  columnId: string,
  completedAt?: Date | null
) {
  return prisma.task.update({
    where: { id },
    data: { columnId, completedAt },
    include: taskInclude,
  });
}

export async function deleteTask(id: string) {
  return prisma.task.delete({ where: { id } });
}
