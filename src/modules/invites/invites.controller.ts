import { Request, Response, NextFunction } from "express";
import { sendSuccess, sendCreated } from "../../shared/utils/response";
import { createInviteLinkSchema, sendInviteEmailSchema } from "./invites.schema";
import {
  createInviteLink,
  sendInviteByEmail,
  getInviteInfo,
  acceptInvite,
} from "./invites.service";

export async function createInviteLinkController(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = createInviteLinkSchema.parse(req.body);
    const result = await createInviteLink(req.params["projectId"] as string, req.user!.id, dto);
    sendCreated(res, result, "Invite link created");
  } catch (err) {
    next(err);
  }
}

export async function sendInviteByEmailController(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = sendInviteEmailSchema.parse(req.body);
    const result = await sendInviteByEmail(req.params["projectId"] as string, req.user!.id, dto);
    sendSuccess(res, result, "Invitation sent");
  } catch (err) {
    next(err);
  }
}

export async function getInviteInfoController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getInviteInfo(req.params["token"] as string);
    sendSuccess(res, result, "Invite info");
  } catch (err) {
    next(err);
  }
}

export async function acceptInviteController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await acceptInvite(req.params["token"] as string, req.user!.id, req.user!.email);
    sendSuccess(res, result, "Joined project successfully");
  } catch (err) {
    next(err);
  }
}
