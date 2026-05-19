import { z } from "zod";

export const updateSuggestionSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  suggestedForId: z.string().uuid().nullable().optional(),
});

export const acceptSuggestionSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  responsibleId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime({ offset: true }).optional(),
});

export type UpdateSuggestionDto = z.infer<typeof updateSuggestionSchema>;
export type AcceptSuggestionDto = z.infer<typeof acceptSuggestionSchema>;
