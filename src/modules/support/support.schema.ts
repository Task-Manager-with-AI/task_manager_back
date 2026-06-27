import { z } from "zod";

export const contactSchema = z.object({
  subject: z.string().min(5).max(100),
  message: z.string().min(10).max(2000),
  category: z.enum(["bug", "feature", "billing", "other"]).default("other"),
});

export type ContactDto = z.infer<typeof contactSchema>;
