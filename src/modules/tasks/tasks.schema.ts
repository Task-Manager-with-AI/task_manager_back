import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  responsibleId: z.string().uuid("responsibleId must be a valid UUID").optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  dueDate: z.string().datetime({ offset: true }).nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  responsibleId: z.string().uuid().nullable().optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum(["PENDING", "IN_PROGRESS", "DONE"]),
});

export type CreateTaskDto = z.infer<typeof createTaskSchema>;
export type UpdateTaskDto = z.infer<typeof updateTaskSchema>;
export type UpdateStatusDto = z.infer<typeof updateStatusSchema>;
