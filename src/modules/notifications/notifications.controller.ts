import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../shared/utils/response";
import { env } from "../../config/env";
import * as service from "./notifications.service";
import {
  listQuerySchema,
  updatePreferencesSchema,
  pushSubscribeSchema,
  pushUnsubscribeSchema,
} from "./notifications.schema";

export async function listController(req: Request, res: Response, next: NextFunction) {
  try {
    const { cursor, limit, filter } = listQuerySchema.parse(req.query);
    const result = await service.list(req.user!.id, {
      cursor,
      limit,
      unreadOnly: filter === "unread",
    });
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function unreadCountController(req: Request, res: Response, next: NextFunction) {
  try {
    const count = await service.unreadCount(req.user!.id);
    sendSuccess(res, { count });
  } catch (err) {
    next(err);
  }
}

export async function markReadController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.markRead(req.params["id"] as string, req.user!.id);
    sendSuccess(res, result, "Marked as read");
  } catch (err) {
    next(err);
  }
}

export async function markAllReadController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.markAllRead(req.user!.id);
    sendSuccess(res, result, "All marked as read");
  } catch (err) {
    next(err);
  }
}

export async function deleteController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await service.remove(req.params["id"] as string, req.user!.id);
    sendSuccess(res, result, "Notification deleted");
  } catch (err) {
    next(err);
  }
}

export async function getPreferencesController(req: Request, res: Response, next: NextFunction) {
  try {
    const prefs = await service.getPreferences(req.user!.id);
    sendSuccess(res, prefs);
  } catch (err) {
    next(err);
  }
}

export async function updatePreferencesController(req: Request, res: Response, next: NextFunction) {
  try {
    const { preferences } = updatePreferencesSchema.parse(req.body);
    let result = await service.getPreferences(req.user!.id);
    for (const p of preferences) {
      result = await service.updatePreference(req.user!.id, p.category, {
        inApp: p.inApp,
        push: p.push,
        email: p.email,
      });
    }
    sendSuccess(res, result, "Preferences updated");
  } catch (err) {
    next(err);
  }
}

export async function vapidKeyController(_req: Request, res: Response) {
  sendSuccess(res, { publicKey: env.VAPID_PUBLIC_KEY ?? null });
}

export async function pushSubscribeController(req: Request, res: Response, next: NextFunction) {
  try {
    const { endpoint, keys } = pushSubscribeSchema.parse(req.body);
    await service.subscribePush({
      userId: req.user!.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent: req.headers["user-agent"],
    });
    sendSuccess(res, { subscribed: true }, "Push subscription saved");
  } catch (err) {
    next(err);
  }
}

export async function pushUnsubscribeController(req: Request, res: Response, next: NextFunction) {
  try {
    const { endpoint } = pushUnsubscribeSchema.parse(req.body);
    const result = await service.unsubscribePush(endpoint);
    sendSuccess(res, result, "Push subscription removed");
  } catch (err) {
    next(err);
  }
}
