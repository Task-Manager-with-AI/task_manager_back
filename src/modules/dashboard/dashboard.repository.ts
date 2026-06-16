import { prisma } from "../../prisma/client";
import { SprintStatus, TaskPriority } from "@prisma/client";

export async function findUserProjectIds(userId: string, projectId?: string) {
  const memberships = await prisma.projectMember.findMany({
    where: {
      userId,
      isActive: true,
      ...(projectId ? { projectId } : {}),
    },
    select: { projectId: true },
  });
  return memberships.map((m) => m.projectId);
}

export async function findDoneColumnIdsByProjects(projectIds: string[]) {
  if (projectIds.length === 0) return new Map<string, string>();

  const columns = await prisma.kanbanColumn.findMany({
    where: { projectId: { in: projectIds } },
    orderBy: { position: "desc" },
    select: { projectId: true, id: true },
  });

  const map = new Map<string, string>();
  for (const col of columns) {
    if (!map.has(col.projectId)) {
      map.set(col.projectId, col.id);
    }
  }
  return map;
}

export async function countActiveProjects(projectIds: string[]) {
  if (projectIds.length === 0) return 0;
  return prisma.project.count({
    where: { id: { in: projectIds }, status: "ACTIVE" },
  });
}

export async function countOpenTasks(projectIds: string[], doneColumnIds: string[]) {
  if (projectIds.length === 0) return 0;
  return prisma.task.count({
    where: {
      projectId: { in: projectIds },
      columnId: { notIn: doneColumnIds.length ? doneColumnIds : ["__none__"] },
    },
  });
}

export async function countOverdueTasks(
  projectIds: string[],
  doneColumnIds: string[],
  today: Date
) {
  if (projectIds.length === 0) return 0;
  return prisma.task.count({
    where: {
      projectId: { in: projectIds },
      dueDate: { lt: today },
      columnId: { notIn: doneColumnIds.length ? doneColumnIds : ["__none__"] },
    },
  });
}

export async function countMeetingsThisWeek(
  projectIds: string[],
  weekStart: Date,
  weekEnd: Date
) {
  if (projectIds.length === 0) return 0;
  return prisma.meeting.count({
    where: {
      projectId: { in: projectIds },
      scheduledAt: { gte: weekStart, lte: weekEnd },
    },
  });
}

export async function findProjectsWithStats(
  projectIds: string[],
  doneColumnMap: Map<string, string>
) {
  if (projectIds.length === 0) return [];

  const projects = await prisma.project.findMany({
    where: { id: { in: projectIds } },
    include: {
      tasks: { select: { id: true, columnId: true } },
      sprints: {
        where: { status: SprintStatus.ACTIVE },
        take: 1,
        select: { id: true, name: true, endDate: true },
      },
      meetings: {
        where: { meetingType: "DAILY", dailyAnalysis: { isNot: null } },
        orderBy: { scheduledAt: "desc" },
        take: 1,
        select: {
          dailyAnalysis: { select: { sprintHealth: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return projects.map((p) => {
    const doneColumnId = doneColumnMap.get(p.id);
    const doneTasks = p.tasks.filter((t) => t.columnId === doneColumnId).length;
    const totalTasks = p.tasks.length;
    const progressPercent =
      totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    return {
      id: p.id,
      name: p.name,
      status: p.status,
      totalTasks,
      doneTasks,
      progressPercent,
      activeSprint: p.sprints[0]
        ? {
            id: p.sprints[0].id,
            name: p.sprints[0].name,
            endDate: p.sprints[0].endDate.toISOString(),
          }
        : undefined,
      sprintHealth: p.meetings[0]?.dailyAnalysis?.sprintHealth ?? null,
    };
  });
}

export async function findActiveSprint(projectId: string, sprintId?: string) {
  if (sprintId) {
    return prisma.sprint.findFirst({
      where: {
        id: sprintId,
        ...(projectId ? { projectId } : {}),
      },
      include: {
        tasks: {
          select: { id: true, storyPoints: true, completedAt: true },
        },
      },
    });
  }

  return prisma.sprint.findFirst({
    where: { projectId, status: SprintStatus.ACTIVE },
    include: {
      tasks: {
        select: { id: true, storyPoints: true, completedAt: true },
      },
    },
  });
}

export async function findSprintByIdForUser(sprintId: string, projectIds: string[]) {
  if (projectIds.length === 0) return null;
  return prisma.sprint.findFirst({
    where: { id: sprintId, projectId: { in: projectIds } },
    include: {
      tasks: {
        select: { id: true, storyPoints: true, completedAt: true },
      },
    },
  });
}

export async function findFirstActiveSprintAcrossProjects(projectIds: string[]) {
  if (projectIds.length === 0) return null;

  return prisma.sprint.findFirst({
    where: { projectId: { in: projectIds }, status: SprintStatus.ACTIVE },
    orderBy: { startDate: "desc" },
    include: {
      tasks: {
        select: { id: true, storyPoints: true, completedAt: true },
      },
    },
  });
}

export async function groupTasksByColumn(projectIds: string[]) {
  if (projectIds.length === 0) return [];

  const tasks = await prisma.task.groupBy({
    by: ["columnId"],
    where: { projectId: { in: projectIds } },
    _count: { id: true },
  });

  const columnIds = tasks.map((t) => t.columnId);
  const columns = await prisma.kanbanColumn.findMany({
    where: { id: { in: columnIds } },
    select: { id: true, title: true, color: true },
  });

  const columnMap = new Map(columns.map((c) => [c.id, c]));

  return tasks.map((t) => {
    const col = columnMap.get(t.columnId);
    return {
      column: col?.title ?? "Unknown",
      count: t._count.id,
      color: col?.color ?? undefined,
    };
  });
}

export async function groupTasksByPriority(projectIds: string[]) {
  if (projectIds.length === 0) return [];

  const groups = await prisma.task.groupBy({
    by: ["priority"],
    where: { projectId: { in: projectIds } },
    _count: { id: true },
  });

  const order: TaskPriority[] = ["HIGH", "MEDIUM", "LOW"];
  return order
    .map((priority) => {
      const found = groups.find((g) => g.priority === priority);
      return { priority, count: found?._count.id ?? 0 };
    })
    .filter((g) => g.count > 0);
}

export async function findCompletedTasksForVelocity(
  projectIds: string[],
  since: Date
) {
  if (projectIds.length === 0) return [];

  return prisma.task.findMany({
    where: {
      projectId: { in: projectIds },
      completedAt: { gte: since },
    },
    select: { completedAt: true },
  });
}

export async function findCalendarTasks(
  projectIds: string[],
  from: Date,
  to: Date
) {
  if (projectIds.length === 0) return [];

  return prisma.task.findMany({
    where: {
      projectId: { in: projectIds },
      dueDate: { gte: from, lte: to },
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      priority: true,
      projectId: true,
      project: { select: { name: true } },
    },
  });
}

export async function findCalendarMeetings(
  projectIds: string[],
  from: Date,
  to: Date
) {
  if (projectIds.length === 0) return [];

  return prisma.meeting.findMany({
    where: {
      projectId: { in: projectIds },
      scheduledAt: { gte: from, lte: to },
    },
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      meetingType: true,
      projectId: true,
      project: { select: { name: true } },
    },
  });
}

export async function findCalendarSprintEnds(
  projectIds: string[],
  from: Date,
  to: Date
) {
  if (projectIds.length === 0) return [];

  return prisma.sprint.findMany({
    where: {
      projectId: { in: projectIds },
      status: SprintStatus.ACTIVE,
      endDate: { gte: from, lte: to },
    },
    select: {
      id: true,
      name: true,
      endDate: true,
      projectId: true,
      project: { select: { name: true } },
    },
  });
}
