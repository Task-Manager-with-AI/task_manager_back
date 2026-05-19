import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {
  getMinuteByMeetingController,
  getMinuteController,
} from "./minutes.controller";

export const minutesRouter = Router();

minutesRouter.get(
  "/meetings/:meetingId/minutes",
  authMiddleware,
  getMinuteByMeetingController
);

minutesRouter.get(
  "/minutes/:minuteId",
  authMiddleware,
  getMinuteController
);
