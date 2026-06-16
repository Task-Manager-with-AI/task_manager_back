import { Prisma } from "@prisma/client";
import type {
  NotificationCategory,
  NotificationType,
} from "@prisma/client";
import { prisma } from "../../prisma/client";

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
  actorId?: string;
  projectId?: string;
  groupKey?: string;
}

/**
 * Insert a notification, or — when an unread one with the same (userId, groupKey)
 * exists — coalesce it (bump count + refresh content). Returns the row.
 */
export async function createOrCoalesce(input: CreateNotificationInput) {
  if (input.groupKey) {
    const existing = await prisma.notification.findFirst({
      where: { userId: input.userId, groupKey: input.groupKey, readAt: null },
      select: { id: true, count: true },
    });
    if (existing) {
      return prisma.notification.update({
        where: { id: existing.id },
        data: {
          count: existing.count + 1,
          title: input.title,
          body: input.body ?? null,
          data: (input.data ?? {}) as Prisma.InputJsonValue,
          actorId: input.actorId ?? null,
          updatedAt: new Date(),
        },
      });
    }
  }

  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      category: input.category,
      title: input.title,
      body: input.body ?? null,
      data: (input.data ?? {}) as Prisma.InputJsonValue,
      actorId: input.actorId ?? null,
      projectId: input.projectId ?? null,
      groupKey: input.groupKey ?? null,
    },
  });
}

export function listForUser(
  userId: string,
  opts: { cursor?: string; limit: number; unreadOnly?: boolean }
) {
  return prisma.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: "desc" },
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: { actor: { select: { id: true, name: true } } },
  });
}

export function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(id: string, userId: string) {
  const res = await prisma.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return res.count > 0;
}

export async function markAllRead(userId: string) {
  const res = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return res.count;
}

export async function remove(id: string, userId: string) {
  const res = await prisma.notification.deleteMany({ where: { id, userId } });
  return res.count > 0;
}

// ── Preferences ─────────────────────────────────────────────────────────────
export function getPreferences(userId: string) {
  return prisma.notificationPreference.findMany({ where: { userId } });
}

export function upsertPreference(
  userId: string,
  category: NotificationCategory,
  data: { inApp?: boolean; push?: boolean; email?: boolean }
) {
  return prisma.notificationPreference.upsert({
    where: { userId_category: { userId, category } },
    update: data,
    create: { userId, category, ...data },
  });
}

// ── Push subscriptions ──────────────────────────────────────────────────────
export function upsertPushSubscription(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}) {
  return prisma.pushSubscription.upsert({
    where: { endpoint: input.endpoint },
    update: { userId: input.userId, p256dh: input.p256dh, auth: input.auth },
    create: input,
  });
}

export function deletePushSubscription(endpoint: string) {
  return prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

export function getPushSubscriptions(userId: string) {
  return prisma.pushSubscription.findMany({ where: { userId } });
}
