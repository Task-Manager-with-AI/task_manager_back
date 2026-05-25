import { z } from "zod";

export const createDocumentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(180),
});

export const updateDocumentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(180),
});

export type CreateDocumentDto = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentDto = z.infer<typeof updateDocumentSchema>;
