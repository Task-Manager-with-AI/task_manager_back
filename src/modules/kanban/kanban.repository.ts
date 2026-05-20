import { prisma } from "../../prisma/client";

export async function findColumnsByProject(projectId: string) {
  return prisma.kanbanColumn.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
    include: { _count: { select: { tasks: true } } },
  });
}

export async function findColumnById(columnId: string, projectId: string) {
  return prisma.kanbanColumn.findFirst({
    where: { id: columnId, projectId },
  });
}
