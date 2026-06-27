import { z } from "zod";

export const createFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  page: z.string().max(50).optional(),
});

export type CreateFeedbackDto = z.infer<typeof createFeedbackSchema>;
