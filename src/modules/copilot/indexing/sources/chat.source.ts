import { prisma } from "../../../../prisma/client";
import { singleChunk } from "../chunking";
import type { BuiltChunk, KnowledgeSource, SourceBuildResult } from "./types";

const WINDOW_SIZE = 25; // messages grouped per chunk

/**
 * Chat history is indexed in windows of consecutive messages, keyed by chatId.
 * ONLY project group chats are indexed — direct (1:1) chats are private and are
 * never added to the project corpus (see plan §8). Recent live messages are
 * answered by the get_chat_messages tool; this index covers the historical bulk.
 */
export const chatSource: KnowledgeSource = {
  type: "CHAT_MESSAGE",
  async build(chatId: string): Promise<SourceBuildResult | null> {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { id: true, type: true, projectId: true, project: { select: { name: true } } },
    });
    // Skip non-project chats entirely (privacy isolation).
    if (!chat || chat.type !== "PROJECT" || !chat.projectId) return null;

    const messages = await prisma.message.findMany({
      where: { chatId, deletedAt: null, type: { in: ["TEXT", "SYSTEM"] } },
      orderBy: { createdAt: "asc" },
      select: {
        content: true,
        createdAt: true,
        sender: { select: { name: true } },
      },
    });

    const chunks: BuiltChunk[] = [];
    for (let i = 0; i < messages.length; i += WINDOW_SIZE) {
      const window = messages.slice(i, i + WINDOW_SIZE);
      const lines = window
        .map((m) => {
          const who = m.sender?.name ?? "Sistema";
          const when = m.createdAt.toISOString().slice(0, 16).replace("T", " ");
          return `[${when}] ${who}: ${m.content}`;
        })
        .join("\n");
      if (!lines.trim()) continue;

      const first = window[0]!.createdAt;
      chunks.push({
        ...singleChunk(lines),
        metadata: {
          title: `Chat del proyecto: ${chat.project?.name ?? ""}`.trim(),
          sourceType: "CHAT_MESSAGE",
          sourceId: chat.id,
          url: `/chats?chatId=${chat.id}`,
          createdAt: first.toISOString(),
        },
      });
    }

    return { projectId: chat.projectId, chunks };
  },
};
