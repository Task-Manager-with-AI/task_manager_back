import type { Prisma } from "@prisma/client";

export const KANBAN_COLUMN_COLORS = [
  "blue",
  "violet",
  "emerald",
  "amber",
  "rose",
  "slate",
] as const;

export type KanbanColumnColor = (typeof KANBAN_COLUMN_COLORS)[number];

export const DEFAULT_KANBAN_COLUMNS: { title: string; color: KanbanColumnColor }[] = [
  { title: "Pending", color: "amber" },
  { title: "In Progress", color: "violet" },
  { title: "Done", color: "emerald" },
];

export async function seedDefaultKanbanColumns(
  tx: Prisma.TransactionClient,
  projectId: string
) {
  for (let position = 0; position < DEFAULT_KANBAN_COLUMNS.length; position++) {
    const col = DEFAULT_KANBAN_COLUMNS[position];
    await tx.kanbanColumn.create({
      data: {
        projectId,
        title: col.title,
        position,
        color: col.color,
      },
    });
  }
}
