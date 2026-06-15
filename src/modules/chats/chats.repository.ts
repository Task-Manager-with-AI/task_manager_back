import { Prisma, MessageType } from "@prisma/client";
import { prisma } from "../../prisma/client";

export const messageInclude = {
  sender: { select: { id: true, name: true } },
  replyTo: {
    select: {
      id: true,
      content: true,
      type: true,
      deletedAt: true,
      sender: { select: { id: true, name: true } },
    },
  },
  reactions: true,
  taskLink: { select: { taskId: true } },
} satisfies Prisma.MessageInclude;

export type MessageWithRelations = Prisma.MessageGetPayload<{
  include: typeof messageInclude;
}>;

// ── Project integration helpers (called from projects module) ─────────────

export async function ensureProjectChat(
  tx: Prisma.TransactionClient,
  projectId: string
): Promise<string> {
  const existing = await tx.chat.findUnique({
    where: { projectId },
    select: { id: true },
  });
  if (existing) return existing.id;
  const chat = await tx.chat.create({
    data: { type: "PROJECT", projectId },
    select: { id: true },
  });
  return chat.id;
}

export async function upsertParticipant(
  tx: Prisma.TransactionClient,
  chatId: string,
  userId: string
) {
  return tx.chatParticipant.upsert({
    where: { chatId_userId: { chatId, userId } },
    update: { isActive: true },
    create: { chatId, userId },
  });
}

// ── Chat listing & detail ─────────────────────────────────────────────────

export async function findUserChats(userId: string) {
  return prisma.chat.findMany({
    where: { participants: { some: { userId, isActive: true } } },
    include: {
      project: { select: { id: true, name: true } },
      participants: {
        where: { isActive: true },
        include: { user: { select: { id: true, name: true } } },
      },
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { sender: { select: { id: true, name: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function findChatDetail(chatId: string) {
  return prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      project: { select: { id: true, name: true } },
      participants: {
        where: { isActive: true },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
}

export async function findParticipant(chatId: string, userId: string) {
  return prisma.chatParticipant.findUnique({
    where: { chatId_userId: { chatId, userId } },
  });
}

export async function findActiveParticipants(chatId: string) {
  return prisma.chatParticipant.findMany({
    where: { chatId, isActive: true },
    select: { userId: true, lastReadAt: true },
  });
}

export async function countUnread(
  chatId: string,
  userId: string,
  lastReadAt: Date | null
) {
  return prisma.message.count({
    where: {
      chatId,
      deletedAt: null,
      senderId: { not: userId },
      ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
    },
  });
}

// ── Messages ──────────────────────────────────────────────────────────────

export async function findMessages(
  chatId: string,
  limit: number,
  cursor?: string
) {
  return prisma.message.findMany({
    where: { chatId },
    include: messageInclude,
    orderBy: { createdAt: "desc" },
    take: limit,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
  });
}

export async function findMessageById(messageId: string) {
  return prisma.message.findUnique({
    where: { id: messageId },
    include: messageInclude,
  });
}

export async function createMessage(data: {
  chatId: string;
  senderId: string | null;
  type: MessageType;
  content: string;
  attachmentUrl?: string | null;
  attachmentMime?: string | null;
  replyToId?: string | null;
}): Promise<MessageWithRelations> {
  const [message] = await prisma.$transaction([
    prisma.message.create({ data, include: messageInclude }),
    prisma.chat.update({
      where: { id: data.chatId },
      data: { updatedAt: new Date() },
    }),
  ]);
  return message;
}

export async function updateMessageContent(messageId: string, content: string) {
  return prisma.message.update({
    where: { id: messageId },
    data: { content, editedAt: new Date() },
    include: messageInclude,
  });
}

export async function softDeleteMessage(messageId: string) {
  return prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date(), content: "" },
    include: messageInclude,
  });
}

// ── Reactions ───────────────────────────────────────────────────────────

export async function findReaction(
  messageId: string,
  userId: string,
  emoji: string
) {
  return prisma.messageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
  });
}

export async function addReaction(
  messageId: string,
  userId: string,
  emoji: string
) {
  return prisma.messageReaction.create({
    data: { messageId, userId, emoji },
  });
}

export async function removeReaction(reactionId: string) {
  return prisma.messageReaction.delete({ where: { id: reactionId } });
}

export async function findMessageReactions(messageId: string) {
  return prisma.messageReaction.findMany({ where: { messageId } });
}

// ── Read receipts ─────────────────────────────────────────────────────────

export async function markParticipantRead(chatId: string, userId: string) {
  const now = new Date();
  await prisma.chatParticipant.update({
    where: { chatId_userId: { chatId, userId } },
    data: { lastReadAt: now },
  });
  return now;
}

// ── Direct chats ────────────────────────────────────────────────────────

export async function findDirectChatBetween(userA: string, userB: string) {
  return prisma.chat.findFirst({
    where: {
      type: "DIRECT",
      AND: [
        { participants: { some: { userId: userA } } },
        { participants: { some: { userId: userB } } },
      ],
    },
    select: { id: true },
  });
}

export async function createDirectChat(userA: string, userB: string) {
  return prisma.$transaction(async (tx) => {
    const chat = await tx.chat.create({ data: { type: "DIRECT" } });
    await tx.chatParticipant.createMany({
      data: [
        { chatId: chat.id, userId: userA },
        { chatId: chat.id, userId: userB },
      ],
    });
    return chat;
  });
}

export async function reactivateDirectParticipants(
  chatId: string,
  userA: string,
  userB: string
) {
  await prisma.chatParticipant.updateMany({
    where: { chatId, userId: { in: [userA, userB] } },
    data: { isActive: true },
  });
}

// ── Project chat shortcut ─────────────────────────────────────────────────

export async function findProjectChatId(projectId: string) {
  const chat = await prisma.chat.findUnique({
    where: { projectId },
    select: { id: true },
  });
  return chat?.id ?? null;
}

// ── Convert message to task ───────────────────────────────────────────────

export async function findFirstColumnId(projectId: string) {
  const column = await prisma.kanbanColumn.findFirst({
    where: { projectId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  return column?.id ?? null;
}

export async function findActiveUser(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true },
  });
}

export async function listChatUsers() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
}
