import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client";
import { AppError } from "../../shared/errors/AppError";
import { findColumnsByProject } from "./kanban.repository";
import type { UpdateKanbanLayoutDto } from "./kanban.schema";

const POSITION_OFFSET = 1000;

export async function listKanbanColumns(projectId: string) {
  const columns = await findColumnsByProject(projectId);
  return columns.map((col) => ({
    id: col.id,
    projectId: col.projectId,
    title: col.title,
    position: col.position,
    color: col.color,
    taskCount: col._count.tasks,
    createdAt: col.createdAt,
    updatedAt: col.updatedAt,
  }));
}

export async function replaceKanbanLayout(projectId: string, dto: UpdateKanbanLayoutDto) {
  const existing = await findColumnsByProject(projectId);
  const existingById = new Map(existing.map((c) => [c.id, c]));
  const inputIds = new Set(
    dto.columns.map((c) => c.id).filter((id): id is string => Boolean(id))
  );

  for (const col of existing) {
    if (!inputIds.has(col.id) && col._count.tasks > 0) {
      throw new AppError(
        `Column "${col.title}" has tasks. Move them to another column before removing it.`,
        400
      );
    }
  }

  for (const input of dto.columns) {
    if (input.id && !existingById.has(input.id)) {
      throw new AppError("Column not found in this project", 400);
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      const toRemove = existing.filter((c) => !inputIds.has(c.id));
      for (const col of toRemove) {
        await tx.kanbanColumn.delete({ where: { id: col.id } });
      }

      const remaining = await tx.kanbanColumn.findMany({
        where: { projectId },
        orderBy: { position: "asc" },
      });
      for (let i = 0; i < remaining.length; i++) {
        await tx.kanbanColumn.update({
          where: { id: remaining[i].id },
          data: { position: POSITION_OFFSET + i },
        });
      }

      for (let position = 0; position < dto.columns.length; position++) {
        const input = dto.columns[position];
        if (input.id) {
          await tx.kanbanColumn.update({
            where: { id: input.id },
            data: {
              title: input.title,
              position,
              color: input.color ?? null,
            },
          });
        } else {
          await tx.kanbanColumn.create({
            data: {
              projectId,
              title: input.title,
              position,
              color: input.color ?? null,
            },
          });
        }
      }
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new AppError(
        "Could not update column order due to a conflict. Please try saving again.",
        409
      );
    }
    throw err;
  }

  return listKanbanColumns(projectId);
}
