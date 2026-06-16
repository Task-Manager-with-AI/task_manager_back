import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client";

export interface Citation {
  chunkId?: string;
  sourceType: string;
  sourceId: string;
  title: string;
  url: string | null;
}

export function createThread(projectId: string, userId: string, title?: string) {
  return prisma.conversationThread.create({
    data: { projectId, userId, title: title ?? null },
    select: { id: true, projectId: true, userId: true, title: true, createdAt: true },
  });
}

export async function getThreadForUser(threadId: string, userId: string) {
  return prisma.conversationThread.findFirst({
    where: { id: threadId, userId },
    select: { id: true, projectId: true, userId: true, title: true },
  });
}

export function listThreads(projectId: string, userId: string) {
  return prisma.conversationThread.findMany({
    where: { projectId, userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
}

export function getThreadMessages(threadId: string) {
  return prisma.conversationMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      citations: true,
      createdAt: true,
    },
  });
}

/** Prior user/assistant turns for LLM context (tool traces excluded). */
export async function getConversationHistory(threadId: string, limit = 20) {
  const rows = await prisma.conversationMessage.findMany({
    where: { threadId, role: { in: ["user", "assistant"] } },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { role: true, content: true },
  });
  return rows.reverse();
}

export function saveMessage(params: {
  threadId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  citations?: Citation[];
  toolCalls?: unknown;
}) {
  return prisma.conversationMessage.create({
    data: {
      threadId: params.threadId,
      role: params.role,
      content: params.content,
      citations: params.citations
        ? (params.citations as unknown as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      toolCalls: params.toolCalls
        ? (params.toolCalls as Prisma.InputJsonValue)
        : Prisma.JsonNull,
    },
    select: { id: true, createdAt: true },
  });
}

export async function touchThread(threadId: string, title?: string) {
  await prisma.conversationThread.update({
    where: { id: threadId },
    data: { updatedAt: new Date(), ...(title ? { title } : {}) },
  });
}

export async function deleteThread(threadId: string, userId: string): Promise<boolean> {
  const result = await prisma.conversationThread.deleteMany({
    where: { id: threadId, userId },
  });
  return result.count > 0;
}
