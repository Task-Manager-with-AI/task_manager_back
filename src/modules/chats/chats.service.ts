import { MessageType, TaskPriority } from "@prisma/client";
import { prisma } from "../../prisma/client";
import { AppError } from "../../shared/errors/AppError";
import { isUserOnline } from "../../signaling/presence";
import { emitChatEvent } from "../../signaling/chat.signaling";
import * as fileStorage from "../../services/file-storage.service";
import * as aiClient from "../../services/ai-client.service";
import * as repo from "./chats.repository";
import type { MessageWithRelations } from "./chats.repository";
import type {
  SendMessageDto,
  EditMessageDto,
  ConvertToTaskDto,
} from "./chats.schema";

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export interface ChatMessageDto {
  id: string;
  chatId: string;
  senderId: string | null;
  senderName: string | null;
  type: MessageType;
  content: string;
  deleted: boolean;
  attachmentUrl?: string;
  attachmentMime?: string;
  replyTo?: { id: string; senderName: string | null; preview: string };
  reactions: Array<{ emoji: string; userIds: string[] }>;
  taskId?: string;
  status: "sent" | "delivered" | "read";
  createdAt: string;
  editedAt?: string;
}

// ── Access guard ──────────────────────────────────────────────────────────

export async function assertParticipant(chatId: string, userId: string) {
  const participant = await repo.findParticipant(chatId, userId);
  if (!participant || !participant.isActive) {
    throw new AppError("Chat not found or access denied", 403);
  }
  return participant;
}

// ── Serialization helpers ──────────────────────────────────────────────────

function previewFor(type: MessageType, content: string, deleted: boolean) {
  if (deleted) return "Mensaje eliminado";
  if (type === "IMAGE") return "📷 Imagen";
  if (type === "FILE") return "📎 Archivo";
  if (type === "SYSTEM") return content;
  return content;
}

function computeStatus(
  message: MessageWithRelations,
  viewerId: string,
  others: Array<{ userId: string; lastReadAt: Date | null }>
): "sent" | "delivered" | "read" {
  if (message.senderId !== viewerId) return "read";
  if (others.length === 0) return "sent";
  const allRead = others.every(
    (o) => o.lastReadAt && o.lastReadAt >= message.createdAt
  );
  if (allRead) return "read";
  if (others.some((o) => isUserOnline(o.userId))) return "delivered";
  return "sent";
}

function serializeMessage(
  message: MessageWithRelations,
  viewerId: string,
  others: Array<{ userId: string; lastReadAt: Date | null }>
): ChatMessageDto {
  const reactionMap = new Map<string, string[]>();
  for (const r of message.reactions) {
    const list = reactionMap.get(r.emoji) ?? [];
    list.push(r.userId);
    reactionMap.set(r.emoji, list);
  }

  const deleted = Boolean(message.deletedAt);

  return {
    id: message.id,
    chatId: message.chatId,
    senderId: message.senderId,
    senderName: message.sender?.name ?? null,
    type: message.type,
    content: deleted ? "" : message.content,
    deleted,
    attachmentUrl:
      message.attachmentUrl && !deleted
        ? `/api/v1/chats/attachments/${message.id}`
        : undefined,
    attachmentMime: message.attachmentMime ?? undefined,
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          senderName: message.replyTo.sender?.name ?? null,
          preview: previewFor(
            message.replyTo.type,
            message.replyTo.content,
            Boolean(message.replyTo.deletedAt)
          ).slice(0, 120),
        }
      : undefined,
    reactions: Array.from(reactionMap.entries()).map(([emoji, userIds]) => ({
      emoji,
      userIds,
    })),
    taskId: message.taskLink?.taskId,
    status: computeStatus(message, viewerId, others),
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString(),
  };
}

async function otherParticipants(chatId: string, viewerId: string) {
  const participants = await repo.findActiveParticipants(chatId);
  return participants.filter((p) => p.userId !== viewerId);
}

async function participantIds(chatId: string) {
  const participants = await repo.findActiveParticipants(chatId);
  return participants.map((p) => p.userId);
}

// ── Chat listing & detail ─────────────────────────────────────────────────

export async function listChats(userId: string) {
  const chats = await repo.findUserChats(userId);
  return Promise.all(
    chats.map(async (chat) => {
      const self = chat.participants.find((p) => p.userId === userId);
      const unreadCount = await repo.countUnread(
        chat.id,
        userId,
        self?.lastReadAt ?? null
      );
      const last = chat.messages[0];
      const other =
        chat.type === "DIRECT"
          ? chat.participants.find((p) => p.userId !== userId)
          : undefined;

      return {
        id: chat.id,
        type: chat.type,
        name:
          chat.type === "PROJECT"
            ? chat.project?.name ?? "Proyecto"
            : other?.user.name ?? "Usuario",
        projectId: chat.projectId ?? undefined,
        participants: chat.participants.map((p) => ({
          userId: p.userId,
          name: p.user.name,
          isOnline: isUserOnline(p.userId),
        })),
        lastMessage: last
          ? {
              id: last.id,
              senderId: last.senderId,
              type: last.type,
              preview: previewFor(
                last.type,
                last.content,
                Boolean(last.deletedAt)
              ).slice(0, 140),
              createdAt: last.createdAt.toISOString(),
            }
          : undefined,
        unreadCount,
      };
    })
  );
}

export async function getChat(chatId: string, userId: string) {
  await assertParticipant(chatId, userId);
  const chat = await repo.findChatDetail(chatId);
  if (!chat) throw new AppError("Chat not found", 404);
  const other =
    chat.type === "DIRECT"
      ? chat.participants.find((p) => p.userId !== userId)
      : undefined;
  return {
    id: chat.id,
    type: chat.type,
    name:
      chat.type === "PROJECT"
        ? chat.project?.name ?? "Proyecto"
        : other?.user.name ?? "Usuario",
    projectId: chat.projectId ?? undefined,
    participants: chat.participants.map((p) => ({
      userId: p.userId,
      name: p.user.name,
      isOnline: isUserOnline(p.userId),
    })),
  };
}

// ── Messages ──────────────────────────────────────────────────────────────

export async function listMessages(
  chatId: string,
  userId: string,
  limit: number,
  cursor?: string
) {
  const others = await otherParticipants(chatId, userId);
  const messages = await repo.findMessages(chatId, limit, cursor);
  const items = messages.map((m) => serializeMessage(m, userId, others));
  const nextCursor =
    messages.length === limit ? messages[messages.length - 1]?.id : undefined;
  // Return in chronological order for the client.
  return { items: items.reverse(), nextCursor };
}

export async function sendMessage(
  chatId: string,
  userId: string,
  dto: SendMessageDto
) {
  if (dto.replyToId) {
    const target = await repo.findMessageById(dto.replyToId);
    if (!target || target.chatId !== chatId) {
      throw new AppError("Reply target not found in this chat", 400);
    }
  }

  const message = await repo.createMessage({
    chatId,
    senderId: userId,
    type: "TEXT",
    content: dto.content,
    replyToId: dto.replyToId ?? null,
  });

  return emitAndSerialize(message, userId);
}

export async function sendAttachment(
  chatId: string,
  userId: string,
  file: { buffer: Buffer; mimetype: string }
) {
  const ext = fileStorage.inferExtensionFromMime(file.mimetype);
  const storageUrl = await fileStorage.storeFile(
    "chat/attachments",
    chatId,
    file.buffer,
    ext,
    file.mimetype
  );
  const type: MessageType = file.mimetype.startsWith("image/")
    ? "IMAGE"
    : "FILE";

  const message = await repo.createMessage({
    chatId,
    senderId: userId,
    type,
    content: type === "IMAGE" ? "" : "Archivo adjunto",
    attachmentUrl: storageUrl,
    attachmentMime: file.mimetype,
  });

  return emitAndSerialize(message, userId);
}

async function emitAndSerialize(message: MessageWithRelations, viewerId: string) {
  const others = await otherParticipants(message.chatId, viewerId);
  const ids = [viewerId, ...others.map((o) => o.userId)];
  // Each recipient gets the message serialized from their own perspective
  // for accurate status; emit a viewer-neutral payload and let clients refine.
  const payload = serializeMessage(message, message.senderId ?? viewerId, others);
  emitChatEvent("chat:new-message", message.chatId, ids, payload);
  return serializeMessage(message, viewerId, others);
}

export async function editMessage(
  messageId: string,
  userId: string,
  dto: EditMessageDto
) {
  const existing = await repo.findMessageById(messageId);
  if (!existing) throw new AppError("Message not found", 404);
  await assertParticipant(existing.chatId, userId);
  if (existing.senderId !== userId) {
    throw new AppError("You can only edit your own messages", 403);
  }
  if (existing.deletedAt) {
    throw new AppError("Cannot edit a deleted message", 400);
  }
  if (Date.now() - existing.createdAt.getTime() > EDIT_WINDOW_MS) {
    throw new AppError("Edit window has expired", 400);
  }

  const updated = await repo.updateMessageContent(messageId, dto.content);
  const others = await otherParticipants(updated.chatId, userId);
  const ids = [userId, ...others.map((o) => o.userId)];
  const payload = serializeMessage(updated, updated.senderId ?? userId, others);
  emitChatEvent("chat:message-updated", updated.chatId, ids, payload);
  return serializeMessage(updated, userId, others);
}

export async function deleteMessage(messageId: string, userId: string) {
  const existing = await repo.findMessageById(messageId);
  if (!existing) throw new AppError("Message not found", 404);
  await assertParticipant(existing.chatId, userId);
  if (existing.senderId !== userId) {
    throw new AppError("You can only delete your own messages", 403);
  }

  const updated = await repo.softDeleteMessage(messageId);
  const others = await otherParticipants(updated.chatId, userId);
  const ids = [userId, ...others.map((o) => o.userId)];
  const payload = serializeMessage(updated, updated.senderId ?? userId, others);
  emitChatEvent("chat:message-updated", updated.chatId, ids, payload);
  return serializeMessage(updated, userId, others);
}

// ── Reactions ───────────────────────────────────────────────────────────

export async function toggleReaction(
  messageId: string,
  userId: string,
  emoji: string
) {
  const message = await repo.findMessageById(messageId);
  if (!message) throw new AppError("Message not found", 404);
  await assertParticipant(message.chatId, userId);

  const existing = await repo.findReaction(messageId, userId, emoji);
  if (existing) {
    await repo.removeReaction(existing.id);
  } else {
    await repo.addReaction(messageId, userId, emoji);
  }

  const reactions = await repo.findMessageReactions(messageId);
  const reactionMap = new Map<string, string[]>();
  for (const r of reactions) {
    const list = reactionMap.get(r.emoji) ?? [];
    list.push(r.userId);
    reactionMap.set(r.emoji, list);
  }
  const grouped = Array.from(reactionMap.entries()).map(([e, userIds]) => ({
    emoji: e,
    userIds,
  }));

  const ids = await participantIds(message.chatId);
  emitChatEvent("chat:reaction-updated", message.chatId, ids, {
    messageId,
    reactions: grouped,
  });
  return grouped;
}

// ── Read receipts ─────────────────────────────────────────────────────────

export async function markRead(chatId: string, userId: string) {
  await assertParticipant(chatId, userId);
  const lastReadAt = await repo.markParticipantRead(chatId, userId);
  const ids = await participantIds(chatId);
  emitChatEvent("chat:read", chatId, ids, {
    chatId,
    userId,
    lastReadAt: lastReadAt.toISOString(),
  });
  return { chatId, lastReadAt: lastReadAt.toISOString() };
}

// ── Direct chats ────────────────────────────────────────────────────────

export async function getOrCreateDirectChat(userId: string, otherUserId: string) {
  if (userId === otherUserId) {
    throw new AppError("Cannot start a chat with yourself", 400);
  }
  const other = await repo.findActiveUser(otherUserId);
  if (!other) throw new AppError("User not found", 404);

  const existing = await repo.findDirectChatBetween(userId, otherUserId);
  if (existing) {
    await repo.reactivateDirectParticipants(existing.id, userId, otherUserId);
    return getChat(existing.id, userId);
  }

  const chat = await repo.createDirectChat(userId, otherUserId);
  return getChat(chat.id, userId);
}

export async function getProjectChatId(projectId: string) {
  const chatId = await repo.findProjectChatId(projectId);
  if (!chatId) throw new AppError("Project chat not found", 404);
  return { chatId };
}

// ── Attachments serving ───────────────────────────────────────────────────

export async function getAttachment(messageId: string, userId: string) {
  const message = await repo.findMessageById(messageId);
  if (!message || !message.attachmentUrl) {
    throw new AppError("Attachment not found", 404);
  }
  await assertParticipant(message.chatId, userId);
  const buffer = await fileStorage.readFile(message.attachmentUrl);
  return { buffer, mime: message.attachmentMime ?? "application/octet-stream" };
}

// ── Convert message to task (HU-CHAT-4) ───────────────────────────────────

export async function convertMessageToTask(
  messageId: string,
  userId: string,
  dto: ConvertToTaskDto
) {
  const message = await repo.findMessageById(messageId);
  if (!message) throw new AppError("Message not found", 404);

  const chat = await repo.findChatDetail(message.chatId);
  if (!chat || chat.type !== "PROJECT" || !chat.projectId) {
    throw new AppError("Tasks can only be created from project chats", 400);
  }
  const projectId = chat.projectId;

  // Requester must be an active member of the project.
  const membership = await prisma.projectMember.findUnique({
    where: { userId_projectId: { userId, projectId } },
  });
  if (!membership || !membership.isActive) {
    throw new AppError("You are not an active member of this project", 403);
  }

  if (message.taskLink) {
    throw new AppError("This message was already converted to a task", 409);
  }

  const columnId = await repo.findFirstColumnId(projectId);
  if (!columnId) throw new AppError("Project has no Kanban columns", 400);

  const title =
    dto.title?.trim() ||
    (message.content.trim() || "Tarea desde el chat").slice(0, 200);
  const priority = (dto.priority ?? "MEDIUM") as TaskPriority;
  const responsibleId = dto.responsibleId ?? message.senderId ?? undefined;

  const { task, systemMessage } = await prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title,
        description: `Creada desde el chat del proyecto.`,
        priority,
        projectId,
        columnId,
        createdById: userId,
        responsibleId: responsibleId ?? null,
      },
    });
    await tx.chatTaskLink.create({
      data: { messageId, taskId: task.id },
    });
    const systemMessage = await tx.message.create({
      data: {
        chatId: chat.id,
        senderId: null,
        type: "SYSTEM",
        content: `✅ Se creó la tarea «${title}» a partir de un mensaje`,
      },
      include: repo.messageInclude,
    });
    await tx.chat.update({
      where: { id: chat.id },
      data: { updatedAt: new Date() },
    });
    return { task, systemMessage };
  });

  const ids = await participantIds(chat.id);
  const others = await otherParticipants(chat.id, userId);

  // Emit the system message and the task-created badge event.
  emitChatEvent(
    "chat:new-message",
    chat.id,
    ids,
    serializeMessage(systemMessage, systemMessage.senderId ?? userId, others)
  );
  emitChatEvent("chat:task-created", chat.id, ids, {
    messageId,
    taskId: task.id,
  });

  // Re-fetch the original message so its taskLink badge is reflected.
  const refreshed = await repo.findMessageById(messageId);
  if (refreshed) {
    emitChatEvent(
      "chat:message-updated",
      chat.id,
      ids,
      serializeMessage(refreshed, refreshed.senderId ?? userId, others)
    );
  }

  return { taskId: task.id, title };
}

// ── AI summary (HU-CHAT-5) ────────────────────────────────────────────────

export async function summarizeChat(chatId: string, userId: string) {
  const participant = await assertParticipant(chatId, userId);
  const since = participant.lastReadAt ?? undefined;

  // Pull recent (or unread) messages, oldest first, cap to keep prompt small.
  const recent = await repo.findMessages(chatId, 80);
  const relevant = recent
    .filter((m) => !m.deletedAt && m.type !== "SYSTEM")
    .filter((m) => (since ? m.createdAt > since : true))
    .reverse();

  if (relevant.length === 0) {
    return { summary: [], count: 0 };
  }

  const transcript = relevant
    .map((m) => `${m.sender?.name ?? "Sistema"}: ${m.content}`)
    .join("\n");

  const summary = await aiClient.summarizeChat(transcript);
  return { summary, count: relevant.length };
}
