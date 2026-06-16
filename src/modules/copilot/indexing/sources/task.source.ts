import { prisma } from "../../../../prisma/client";
import { singleChunk } from "../chunking";
import type { KnowledgeSource, SourceBuildResult } from "./types";

/**
 * A task is indexed as a single chunk (title + description). Volatile fields
 * (status/column, responsible) are intentionally answered by live tools, not
 * the index — but we include a snapshot here to aid semantic recall.
 */
export const taskSource: KnowledgeSource = {
  type: "TASK",
  async build(taskId: string): Promise<SourceBuildResult | null> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        description: true,
        projectId: true,
        priority: true,
        updatedAt: true,
        column: { select: { title: true } },
        responsible: { select: { name: true } },
      },
    });
    if (!task) return null;

    const parts = [
      `Tarea: ${task.title}`,
      task.description ? `Descripción: ${task.description}` : null,
      `Estado: ${task.column?.title ?? "—"}`,
      `Prioridad: ${task.priority}`,
      task.responsible ? `Responsable: ${task.responsible.name}` : "Sin responsable",
    ].filter(Boolean);

    return {
      projectId: task.projectId,
      chunks: [
        {
          ...singleChunk(parts.join("\n")),
          metadata: {
            title: task.title,
            sourceType: "TASK",
            sourceId: task.id,
            url: `/projects/${task.projectId}?task=${task.id}`,
            createdAt: task.updatedAt.toISOString(),
          },
        },
      ],
    };
  },
};
