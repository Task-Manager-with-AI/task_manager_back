import { AppError } from "../../shared/errors/AppError";
import {
  findMinuteByMeetingWithMembership,
  findMinuteWithMembership,
} from "./minutes.repository";

export async function getMinuteByMeeting(meetingId: string, userId: string) {
  const minute = await findMinuteByMeetingWithMembership(meetingId, userId);
  if (!minute) {
    throw new AppError(
      "Minute not found for this meeting or access denied",
      404
    );
  }
  return minute;
}

export async function getMinute(minuteId: string, userId: string) {
  const minute = await findMinuteWithMembership(minuteId, userId);
  if (!minute) throw new AppError("Minute not found or access denied", 404);
  return minute;
}
