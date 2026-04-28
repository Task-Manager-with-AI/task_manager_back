import { Request, Response, NextFunction } from "express";
import { updateUserSchema } from "./users.schema";
import { getMe, updateMe, listUsers } from "./users.service";
import { sendSuccess } from "../../shared/utils/response";

export async function getMeController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = await getMe(req.user!.id);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

export async function updateMeController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = updateUserSchema.parse(req.body);
    const user = await updateMe(req.user!.id, dto);
    sendSuccess(res, user, "Profile updated");
  } catch (err) {
    next(err);
  }
}

export async function listUsersController(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const users = await listUsers();
    sendSuccess(res, users);
  } catch (err) {
    next(err);
  }
}
