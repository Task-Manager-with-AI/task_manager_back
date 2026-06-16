import { z } from "zod";

export const listQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  filter: z.enum(["all", "unread"]).default("all"),
});

const categorySchema = z.enum([
  "PROJECT",
  "MEETING",
  "TASK",
  "DOCUMENT",
  "CHAT",
  "AI",
  "SYSTEM",
]);

export const updatePreferencesSchema = z.object({
  preferences: z
    .array(
      z.object({
        category: categorySchema,
        inApp: z.boolean().optional(),
        push: z.boolean().optional(),
        email: z.boolean().optional(),
      })
    )
    .min(1),
});

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url(),
});
