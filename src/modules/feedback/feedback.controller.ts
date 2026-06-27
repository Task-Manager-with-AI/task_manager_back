import { Request, Response, NextFunction } from "express";
import { sendSuccess, sendCreated } from "../../shared/utils/response";
import { createFeedbackSchema } from "./feedback.schema";
import * as svc from "./feedback.service";

export async function submitFeedbackController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = createFeedbackSchema.parse(req.body);
    const data = await svc.submitFeedback(req.user!.id, dto);
    sendCreated(res, data, "Valoración enviada");
  } catch (err) {
    next(err);
  }
}

export async function getMyFeedbackController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const data = await svc.getMyFeedback(req.user!.id);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}
