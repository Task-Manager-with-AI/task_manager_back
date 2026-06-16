import { Request, Response, NextFunction } from "express";
import { overviewQuerySchema, calendarQuerySchema } from "./dashboard.schema";
import { getDashboardOverview, getDashboardCalendar } from "./dashboard.service";
import { sendSuccess } from "../../shared/utils/response";

export async function overviewController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const query = overviewQuerySchema.parse(req.query);
    const data = await getDashboardOverview(req.user!.id, query);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function calendarController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const query = calendarQuerySchema.parse(req.query);
    const data = await getDashboardCalendar(req.user!.id, query);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}
