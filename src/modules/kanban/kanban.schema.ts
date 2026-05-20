import { z } from "zod";
import { KANBAN_COLUMN_COLORS } from "../../shared/kanban/defaults";

export const kanbanColumnColorSchema = z.enum(KANBAN_COLUMN_COLORS);

export const kanbanColumnInputSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1, "Title is required").max(40, "Title max 40 characters"),
  color: kanbanColumnColorSchema.nullable().optional(),
});

export const updateKanbanLayoutSchema = z.object({
  columns: z
    .array(kanbanColumnInputSchema)
    .min(1, "At least one column required")
    .max(8, "Maximum 8 columns allowed"),
});

export type KanbanColumnInput = z.infer<typeof kanbanColumnInputSchema>;
export type UpdateKanbanLayoutDto = z.infer<typeof updateKanbanLayoutSchema>;
