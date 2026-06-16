import { z } from "zod";

export const askSchema = z.object({
  question: z.string().min(1, "question is required").max(4000),
  threadId: z.string().uuid().optional(),
});

export type AskDto = z.infer<typeof askSchema>;
