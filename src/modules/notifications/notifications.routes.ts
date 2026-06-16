import { Router, type Router as ExpressRouter } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {
  listController,
  unreadCountController,
  markReadController,
  markAllReadController,
  deleteController,
  getPreferencesController,
  updatePreferencesController,
  vapidKeyController,
  pushSubscribeController,
  pushUnsubscribeController,
} from "./notifications.controller";

export const notificationsRouter: ExpressRouter = Router();

// All notification routes are scoped to the authenticated user.
notificationsRouter.use(authMiddleware);

notificationsRouter.get("/notifications", listController);
notificationsRouter.get("/notifications/unread-count", unreadCountController);
notificationsRouter.patch("/notifications/read-all", markAllReadController);
notificationsRouter.get("/notifications/preferences", getPreferencesController);
notificationsRouter.put("/notifications/preferences", updatePreferencesController);

notificationsRouter.get("/notifications/push/vapid-public-key", vapidKeyController);
notificationsRouter.post("/notifications/push/subscribe", pushSubscribeController);
notificationsRouter.delete("/notifications/push/subscribe", pushUnsubscribeController);

// Param routes last so literals above are matched first.
notificationsRouter.patch("/notifications/:id/read", markReadController);
notificationsRouter.delete("/notifications/:id", deleteController);
