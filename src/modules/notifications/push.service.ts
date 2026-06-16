import webpush from "web-push";
import { env } from "../../config/env";
import * as repo from "./notifications.repository";

let configured = false;

/** Returns true if VAPID keys are present and web-push is ready. */
export function isPushEnabled(): boolean {
  if (configured) return true;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return false;
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body?: string;
  url?: string;
  notificationId?: string;
}

/**
 * Send a Web Push to all of a user's subscriptions. Dead endpoints (404/410)
 * are pruned. No-op when push is disabled (VAPID keys absent).
 */
export async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!isPushEnabled()) return;

  const subs = await repo.getPushSubscriptions(userId);
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          body
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription expired/invalid — remove it.
          await repo.deletePushSubscription(sub.endpoint).catch(() => undefined);
        } else {
          console.error(`[push] failed to send to ${userId}:`, err);
        }
      }
    })
  );
}
