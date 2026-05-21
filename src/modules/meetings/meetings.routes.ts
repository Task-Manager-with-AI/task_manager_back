import { Router, type Router as ExpressRouter } from "express";
import multer from "multer";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { membershipMiddleware } from "../../middlewares/membership.middleware";
import {
  listMeetingsController,
  listAllMeetingsController,
  getMeetingController,
  createMeetingController,
  startMeetingController,
  uploadAudioController,
  endMeetingController,
  getDailyAnalysisController,
  getKanbanUpdatesController,
} from "./meetings.controller";

export const meetingsRouter: ExpressRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
});

// Global meetings list (all projects the user can access)
meetingsRouter.get("/meetings", authMiddleware, listAllMeetingsController);

meetingsRouter.get(
  "/projects/:projectId/meetings",
  authMiddleware,
  membershipMiddleware,
  listMeetingsController
);

meetingsRouter.post(
  "/projects/:projectId/meetings",
  authMiddleware,
  membershipMiddleware,
  createMeetingController
);

meetingsRouter.get(
  "/meetings/:meetingId",
  authMiddleware,
  getMeetingController
);

meetingsRouter.patch(
  "/meetings/:meetingId/start",
  authMiddleware,
  startMeetingController
);

meetingsRouter.post(
  "/meetings/:meetingId/audio",
  authMiddleware,
  upload.single("audio"),
  uploadAudioController
);

meetingsRouter.patch(
  "/meetings/:meetingId/end",
  authMiddleware,
  endMeetingController
);

meetingsRouter.get(
  "/meetings/:meetingId/daily",
  authMiddleware,
  getDailyAnalysisController
);

meetingsRouter.get(
  "/meetings/:meetingId/kanban-updates",
  authMiddleware,
  getKanbanUpdatesController
);
