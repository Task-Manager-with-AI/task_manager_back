import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { membershipMiddleware } from "../../middlewares/membership.middleware";
import {
  listMeetingsController,
  getMeetingController,
  createMeetingController,
  startMeetingController,
  uploadAudioController,
  endMeetingController,
} from "./meetings.controller";

export const meetingsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB cap
});

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
