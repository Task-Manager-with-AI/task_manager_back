import { Request, Response, NextFunction } from "express";
import { createMeetingSchema } from "./meetings.schema";
import {
  listProjectMeetings,
  listAllMeetings,
  getMeeting,
  createNewMeeting,
  startMeeting,
  uploadMeetingAudio,
  endMeetingAndProcess,
  getDailyAnalysis,
  getKanbanUpdates,
} from "./meetings.service";
import { sendSuccess, sendCreated } from "../../shared/utils/response";
import { AppError } from "../../shared/errors/AppError";

export async function listMeetingsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const meetings = await listProjectMeetings(
      req.params["projectId"] as string
    );
    sendSuccess(res, meetings);
  } catch (err) {
    next(err);
  }
}

export async function getMeetingController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const meeting = await getMeeting(
      req.params["meetingId"] as string,
      req.user!.id
    );
    sendSuccess(res, meeting);
  } catch (err) {
    next(err);
  }
}

export async function createMeetingController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = createMeetingSchema.parse(req.body);
    const meeting = await createNewMeeting(
      dto,
      req.params["projectId"] as string,
      req.user!.id
    );
    sendCreated(res, meeting, "Meeting created");
  } catch (err) {
    next(err);
  }
}

export async function startMeetingController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const meeting = await startMeeting(
      req.params["meetingId"] as string,
      req.user!.id
    );
    sendSuccess(res, meeting, "Meeting started");
  } catch (err) {
    next(err);
  }
}

export async function uploadAudioController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.file) {
      throw new AppError("No audio file provided (field name 'audio')", 400);
    }
    const meeting = await uploadMeetingAudio(
      req.params["meetingId"] as string,
      req.user!.id,
      req.file.buffer,
      req.file.mimetype
    );
    sendSuccess(res, meeting, "Audio uploaded");
  } catch (err) {
    next(err);
  }
}

export async function endMeetingController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const meeting = await endMeetingAndProcess(
      req.params["meetingId"] as string,
      req.user!.id
    );
    sendSuccess(res, meeting, "Meeting ended — processing started");
  } catch (err) {
    next(err);
  }
}

export async function listAllMeetingsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const meetings = await listAllMeetings(req.user!.id);
    sendSuccess(res, meetings);
  } catch (err) {
    next(err);
  }
}

export async function getDailyAnalysisController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const analysis = await getDailyAnalysis(
      req.params["meetingId"] as string,
      req.user!.id
    );
    sendSuccess(res, analysis);
  } catch (err) {
    next(err);
  }
}

export async function getKanbanUpdatesController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const updates = await getKanbanUpdates(
      req.params["meetingId"] as string,
      req.user!.id
    );
    sendSuccess(res, updates);
  } catch (err) {
    next(err);
  }
}
