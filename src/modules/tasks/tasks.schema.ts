import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  responsibleId: z.string().uuid("responsibleId must be a valid UUID").optional(),
  columnId: z.string().uuid("columnId must be a valid UUID").optional(),
  sprintId: z.string().uuid("sprintId must be a valid UUID").optional(),
  storyPoints: z.number().int().min(1).max(100).default(1),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  responsibleId: z.string().uuid().nullable().optional(),
  sprintId: z.string().uuid().nullable().optional(),
  storyPoints: z.number().int().min(1).max(100).optional(),
});

export const updateColumnSchema = z.object({
  columnId: z.string().uuid("columnId must be a valid UUID"),
});

export type CreateTaskDto = z.infer<typeof createTaskSchema>;
export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;
export type UpdateColumnDto = z.infer<typeof updateColumnSchema>;
