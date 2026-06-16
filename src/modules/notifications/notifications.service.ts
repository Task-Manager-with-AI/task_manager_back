import type { NotificationCategory, NotificationType } from "@prisma/client";
import { prisma } from "../../prisma/client";
import { isUserOnline } from "../../signaling/presence";
import { AppError } from "../../shared/errors/AppError";
import { buildNotification, type NotifyData } from "./notifications.catalog";
import { emitToUser } from "./notifications.emitter";
import * as repo from "./notifications.repository";
import * as push from "./push.service";

export interface NotifyInput {
  type: NotificationType;
  recipientIds: string[];
  actorId?: string;
  data?: NotifyData;
}

/**
 * Raise a notification for a set of recipients. Applies the cross-cutting rules
 * (no-self, per-category preferences), persists (with coalescing), emits the
 * realtime socket event, and pushes to offline recipients. The REST/service
 * layer is the source of truth; the socket only mirrors it.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const { type, actorId } = input;
  const data = input.data ?? {};

  // De-dupe + drop the actor (never notify yourself).
  const recipients = Array.from(new Set(input.recipientIds)).filter(
    (id) => id && id !== actorId
  );
  if (recipients.length === 0) return;

  // Resolve the actor's display name once if not provided by the caller.
  if (actorId && !data.actorName) {
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true },
    });
    if (actor) data.actorName = actor.name;
  }

  const built = buildNotification(type, data);
  const category = built.category;
  const payloadData = { ...data, url: built.url ?? data.url };

  const prefsByUser = await repo.getPreferencesForUsers(recipients);

  for (const userId of recipients) {
    const prefs = categoryPrefsFromRows(prefsByUser.get(userId) ?? [], category);
    if (!prefs.inApp) continue;

    const notification = await repo.createOrCoalesce({
      userId,
      type,
      category,
      title: built.title,
      body: built.body,
      data: payloadData,
      actorId,
      projectId: data.projectId,
      groupKey: built.groupKey,
    });

    emitToUser(userId, "notification:new", serialize(notification));
    const count = await repo.unreadCount(userId);
    emitToUser(userId, "notification:unread-count", { count });

    if (prefs.push && !isUserOnline(userId)) {
      void push.sendToUser(userId, {
        title: built.title,
        body: built.body,
        url: built.url ?? data.url,
        notificationId: notification.id,
      });
    }
  }
}

/** Fire-and-forget variant for use inside domain services (never throws up). */
export function notifySafe(input: NotifyInput): void {
  notify(input).catch((err) => {
    console.error(`[notifications] failed to notify (${input.type}):`, err);
  });
}

function categoryPrefsFromRows(
  prefs: Awaited<ReturnType<typeof repo.getPreferences>>,
  category: NotificationCategory
): { inApp: boolean; push: boolean } {
  const match = prefs.find((p) => p.category === category);
  return { inApp: match?.inApp ?? true, push: match?.push ?? true };
}

function serialize(n: {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  body: string | null;
  data: unknown;
  count: number;
  readAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: n.id,
    type: n.type,
    category: n.category,
    title: n.title,
    body: n.body,
    data: n.data,
    count: n.count,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}

// ── Read-side API (used by the controller) ──────────────────────────────────
export async function list(
  userId: string,
  opts: { cursor?: string; limit: number; unreadOnly?: boolean }
) {
  const rows = await repo.listForUser(userId, opts);
  const hasMore = rows.length > opts.limit;
  const items = hasMore ? rows.slice(0, opts.limit) : rows;
  return {
    items,
    nextCursor: hasMore ? items[items.length - 1]!.id : null,
  };
}

export function unreadCount(userId: string) {
  return repo.unreadCount(userId);
}

export async function markRead(id: string, userId: string) {
  const ok = await repo.markRead(id, userId);
  if (!ok) throw new AppError("Notification not found", 404);
  const count = await repo.unreadCount(userId);
  emitToUser(userId, "notification:read", { id, count });
  return { id, unreadCount: count };
}

export async function markAllRead(userId: string) {
  const updated = await repo.markAllRead(userId);
  emitToUser(userId, "notification:unread-count", { count: 0 });
  return { updated, unreadCount: 0 };
}

export async function remove(id: string, userId: string) {
  const ok = await repo.remove(id, userId);
  if (!ok) throw new AppError("Notification not found", 404);
  const count = await repo.unreadCount(userId);
  return { deleted: true, unreadCount: count };
}

// ── Preferences ─────────────────────────────────────────────────────────────
const ALL_CATEGORIES: NotificationCategory[] = [
  "PROJECT",
  "MEETING",
  "TASK",
  "DOCUMENT",
  "CHAT",
  "AI",
  "SYSTEM",
];

export async function getPreferences(userId: string) {
  const rows = await repo.getPreferences(userId);
  // Return a full matrix, filling defaults for categories without a row.
  return ALL_CATEGORIES.map((category) => {
    const row = rows.find((r) => r.category === category);
    return {
      category,
      inApp: row?.inApp ?? true,
      push: row?.push ?? true,
      email: row?.email ?? false,
    };
  });
}

export async function updatePreference(
  userId: string,
  category: NotificationCategory,
  data: { inApp?: boolean; push?: boolean; email?: boolean }
) {
  await repo.upsertPreference(userId, category, data);
  return getPreferences(userId);
}

// ── Push subscriptions ──────────────────────────────────────────────────────
export function subscribePush(input: {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}) {
  return repo.upsertPushSubscription(input);
}

export async function unsubscribePush(endpoint: string) {
  await repo.deletePushSubscription(endpoint);
  return { unsubscribed: true };
}
