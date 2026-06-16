import { z } from "zod";

export const overviewQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  sprintId: z.string().uuid().optional(),
});

export const calendarQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  projectId: z.string().uuid().optional(),
});

export type OverviewQuery = z.infer<typeof overviewQuerySchema>;
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;
