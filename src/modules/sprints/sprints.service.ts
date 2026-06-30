import { prisma } from "../../prisma/client";
import { AppError } from "../../shared/errors/AppError";
import { SprintStatus } from "@prisma/client";
import { findFirstColumnId, findDoneColumnIdFn } from "../tasks/tasks.repository";
import type { CreateSprintDto, UpdateSprintDto, AssignTasksDto } from "./sprints.schema";
import {
  findSprintsByProject,
  findSprintById,
  findActiveSprint,
  createSprint,
  updateSprint,
  deleteSprint,
  assignTasksToSprint,
  loadSprintTasksIntoKanban,
  returnUnfinishedTasksToBacklog,
  markDoneTasksCompleted,
  clearAllSprintTasksFromKanban,
  findSprintTaskCount,
  findActiveSprintByProject,
} from "./sprints.repository";

export async function listSprints(projectId: string) {
  const sprints = await findSprintsByProject(projectId);
  return sprints.map((s) => ({
    id: s.id,
    projectId: s.projectId,
    name: s.name,
    goal: s.goal,
    startDate: s.startDate,
    endDate: s.endDate,
    status: s.status,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    taskCount: s._count.tasks,
    totalPoints: s.tasks.reduce((acc, t) => acc + t.storyPoints, 0),
    completedPoints: s.tasks
      .filter((t) => t.completedAt !== null)
      .reduce((acc, t) => acc + t.storyPoints, 0),
    tasks: s.tasks,
  }));
}

export async function getSprintWithTasks(sprintId: string) {
  const sprint = await findSprintById(sprintId);
  if (!sprint) throw new AppError("Sprint not found", 404);
  return sprint;
}

export async function getActiveSprint(projectId: string) {
  return findActiveSprint(projectId);
}

export async function createNewSprint(projectId: string, dto: CreateSprintDto) {
  const start = new Date(dto.startDate);
  const end = new Date(dto.endDate);
  if (end <= start) throw new AppError("endDate must be after startDate", 400);

  return createSprint({
    projectId,
    name: dto.name,
    goal: dto.goal,
    startDate: start,
    endDate: end,
  });
}

export async function updateSprintData(sprintId: string, dto: UpdateSprintDto) {
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint) throw new AppError("Sprint not found", 404);
  if (sprint.status !== SprintStatus.PLANNED) {
    throw new AppError("Only PLANNED sprints can be edited", 400);
  }

  const data: Parameters<typeof updateSprint>[1] = {};
  if (dto.name !== undefined) data.name = dto.name;
  if (dto.goal !== undefined) data.goal = dto.goal;
  if (dto.startDate !== undefined) data.startDate = new Date(dto.startDate);
  if (dto.endDate !== undefined) data.endDate = new Date(dto.endDate);

  return updateSprint(sprintId, data);
}

export async function startSprintService(sprintId: string) {
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint) throw new AppError("Sprint not found", 404);
  if (sprint.status !== SprintStatus.PLANNED) {
    throw new AppError("Only PLANNED sprints can be started", 400);
  }

  const existingActive = await findActiveSprintByProject(sprint.projectId);
  if (existingActive) {
    throw new AppError(
      `Sprint "${existingActive.name}" is already active. Complete it before starting a new one.`,
      400
    );
  }

  const taskCount = await findSprintTaskCount(sprintId);
  if (taskCount === 0) {
    throw new AppError("Cannot start an empty sprint. Add tasks first.", 400);
  }

  const firstColumnId = await findFirstColumnId(sprint.projectId);
  if (!firstColumnId) {
    throw new AppError("Kanban columns are not configured for this project", 500);
  }

  await loadSprintTasksIntoKanban(sprintId, firstColumnId);
  return updateSprint(sprintId, { status: SprintStatus.ACTIVE });
}

export async function completeSprintService(sprintId: string) {
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint) throw new AppError("Sprint not found", 404);
  if (sprint.status !== SprintStatus.ACTIVE) {
    throw new AppError("Only ACTIVE sprints can be completed", 400);
  }

  const doneColumnId = await findDoneColumnIdFn(sprint.projectId);
  if (doneColumnId) {
    // 1. Tasks in Done column: mark completed, remove from Kanban (keep sprintId for increment)
    await markDoneTasksCompleted(sprintId, doneColumnId);
    // 2. Remaining tasks: return to Product Backlog
    await returnUnfinishedTasksToBacklog(sprintId, doneColumnId);
  } else {
    // No done column configured: return all tasks to backlog
    await clearAllSprintTasksFromKanban(sprintId);
  }

  return updateSprint(sprintId, { status: SprintStatus.COMPLETED });
}

export async function deleteSprintService(sprintId: string) {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: { _count: { select: { tasks: true } } },
  });
  if (!sprint) throw new AppError("Sprint not found", 404);
  if (sprint.status !== SprintStatus.PLANNED) {
    throw new AppError("Only PLANNED sprints can be deleted", 400);
  }
  if (sprint._count.tasks > 0) {
    throw new AppError(
      "Move all tasks out of this sprint before deleting it",
      400
    );
  }
  return deleteSprint(sprintId);
}

export async function assignSprintTasks(sprintId: string, dto: AssignTasksDto) {
  const sprint = await prisma.sprint.findUnique({ where: { id: sprintId } });
  if (!sprint) throw new AppError("Sprint not found", 404);

  if (dto.action === "add") {
    if (sprint.status === SprintStatus.COMPLETED) {
      throw new AppError("Cannot add tasks to a completed sprint", 400);
    }
    await assignTasksToSprint(dto.taskIds, sprintId);

    if (sprint.status === SprintStatus.ACTIVE) {
      const firstColumnId = await findFirstColumnId(sprint.projectId);
      if (firstColumnId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await prisma.task.updateMany({
          where: { id: { in: dto.taskIds }, columnId: null } as any,
          data: { columnId: firstColumnId },
        });
      }
    }
  } else {
    await assignTasksToSprint(dto.taskIds, null);
    if (sprint.status === SprintStatus.ACTIVE) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.task.updateMany({
        where: { id: { in: dto.taskIds } },
        data: { columnId: null } as any,
      });
    }
  }

  return { updated: dto.taskIds.length };
}
