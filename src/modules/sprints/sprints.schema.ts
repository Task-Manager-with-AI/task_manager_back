import { z } from "zod";

export const createSprintSchema = z.object({
  name: z.string().min(1, "Sprint name is required"),
  goal: z.string().optional(),
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }),
});

export const updateSprintSchema = createSprintSchema.partial();

export const assignTasksSchema = z.object({
  taskIds: z.array(z.string().uuid()),
  action: z.enum(["add", "remove"]),
});

export type CreateSprintDto = z.infer<typeof createSprintSchema>;
export type UpdateSprintDto = z.infer<typeof updateSprintSchema>;
export type AssignTasksDto = z.infer<typeof assignTasksSchema>;
