import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {
  createInviteLinkController,
  sendInviteByEmailController,
  getInviteInfoController,
  acceptInviteController,
} from "./invites.controller";

export const invitesRouter = Router();

// Project-scoped invite creation (admin only — enforced in service)
invitesRouter.post(
  "/projects/:projectId/invites/link",
  authMiddleware,
  createInviteLinkController
);
invitesRouter.post(
  "/projects/:projectId/invites/email",
  authMiddleware,
  sendInviteByEmailController
);

// Token-based routes — GET is public (preview before login), POST requires auth
invitesRouter.get("/invites/:token", getInviteInfoController);
invitesRouter.post("/invites/:token/accept", authMiddleware, acceptInviteController);
