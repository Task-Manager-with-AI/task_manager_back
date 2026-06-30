import { prisma } from "../../prisma/client";
import { SprintStatus } from "@prisma/client";

const sprintInclude = {
  _count: { select: { tasks: true } },
};

const taskSelect = {
  id: true,
  title: true,
  priority: true,
  storyPoints: true,
  completedAt: true,
  columnId: true,
  sprintId: true,
  dueDate: true,
  responsible: { select: { id: true, name: true, email: true } },
};

const sprintWithTasksInclude = {
  tasks: {
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      responsible: { select: { id: true, name: true, email: true } },
      column: { select: { id: true, title: true, color: true, position: true } },
    },
  },
};

export async function findSprintsByProject(projectId: string) {
  return prisma.sprint.findMany({
    where: { projectId },
    include: {
      _count: { select: { tasks: true } },
      tasks: { select: taskSelect },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function findSprintById(sprintId: string) {
  return prisma.sprint.findUnique({
    where: { id: sprintId },
    include: sprintWithTasksInclude,
  });
}

export async function findActiveSprint(projectId: string) {
  return prisma.sprint.findFirst({
    where: { projectId, status: SprintStatus.ACTIVE },
    include: {
      ...sprintInclude,
      tasks: {
        select: { id: true, storyPoints: true, completedAt: true, columnId: true },
      },
    },
  });
}

export async function createSprint(data: {
  projectId: string;
  name: string;
  goal?: string;
  startDate: Date;
  endDate: Date;
}) {
  return prisma.sprint.create({ data, include: sprintInclude });
}

export async function updateSprint(
  sprintId: string,
  data: {
    name?: string;
    goal?: string;
    startDate?: Date;
    endDate?: Date;
    status?: SprintStatus;
  }
) {
  return prisma.sprint.update({ where: { id: sprintId }, data, include: sprintInclude });
}

export async function deleteSprint(sprintId: string) {
  return prisma.sprint.delete({ where: { id: sprintId } });
}

export async function assignTasksToSprint(taskIds: string[], sprintId: string | null) {
  return prisma.task.updateMany({
    where: { id: { in: taskIds } },
    data: { sprintId },
  });
}

export async function loadSprintTasksIntoKanban(sprintId: string, columnId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.task.updateMany({
    where: { sprintId, columnId: null } as any,
    data: { columnId },
  });
}

export async function returnUnfinishedTasksToBacklog(sprintId: string, doneColumnId: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.task.updateMany({
    where: { sprintId, columnId: { not: doneColumnId } },
    data: { sprintId: null, columnId: null } as any,
  });
}

export async function markDoneTasksCompleted(sprintId: string, doneColumnId: string) {
  // Tasks in the done column: mark completedAt, clear columnId (keep sprintId for increment view)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.task.updateMany({
    where: { sprintId, columnId: doneColumnId },
    data: { completedAt: new Date(), columnId: null } as any,
  });
}

export async function clearAllSprintTasksFromKanban(sprintId: string) {
  // Fallback when no done column: move everything back to backlog
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return prisma.task.updateMany({
    where: { sprintId },
    data: { sprintId: null, columnId: null } as any,
  });
}

export async function findSprintTaskCount(sprintId: string) {
  return prisma.task.count({ where: { sprintId } });
}

export async function findActiveSprintByProject(projectId: string) {
  return prisma.sprint.findFirst({
    where: { projectId, status: SprintStatus.ACTIVE },
  });
}
