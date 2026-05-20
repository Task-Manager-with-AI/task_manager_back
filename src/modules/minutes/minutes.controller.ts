import { Request, Response, NextFunction } from "express";
import { getMinute, getMinuteByMeeting } from "./minutes.service";
import { sendSuccess } from "../../shared/utils/response";

export async function getMinuteByMeetingController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const minute = await getMinuteByMeeting(
      req.params["meetingId"] as string,
      req.user!.id
    );
    sendSuccess(res, minute);
  } catch (err) {
    next(err);
  }
}

export async function getMinuteController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const minute = await getMinute(
      req.params["minuteId"] as string,
      req.user!.id
    );
    sendSuccess(res, minute);
  } catch (err) {
    next(err);
  }
}
