import { z } from "zod";

export const createMeetingSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  participantIds: z.array(z.string().uuid()).default([]),
});

export const updateMeetingSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  scheduledAt: z.string().datetime({ offset: true }).nullable().optional(),
});

export type CreateMeetingDto = z.infer<typeof createMeetingSchema>;
export type UpdateMeetingDto = z.infer<typeof updateMeetingSchema>;
