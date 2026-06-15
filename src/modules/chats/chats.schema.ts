import { z } from "zod";

export const sendMessageSchema = z.object({
  content: z.string().trim().min(1, "Message cannot be empty").max(5000),
  replyToId: z.string().uuid().optional(),
});

export const editMessageSchema = z.object({
  content: z.string().trim().min(1, "Message cannot be empty").max(5000),
});

export const reactionSchema = z.object({
  emoji: z.string().min(1).max(16),
});

export const directChatSchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
});

export const convertToTaskSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  responsibleId: z.string().uuid().optional(),
});

export const listMessagesQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export type SendMessageDto = z.infer<typeof sendMessageSchema>;
export type EditMessageDto = z.infer<typeof editMessageSchema>;
export type ReactionDto = z.infer<typeof reactionSchema>;
export type DirectChatDto = z.infer<typeof directChatSchema>;
export type ConvertToTaskDto = z.infer<typeof convertToTaskSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
