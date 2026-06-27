import { AppError } from "../../shared/errors/AppError";
import * as repo from "./feedback.repository";
import type { CreateFeedbackDto } from "./feedback.schema";

const MAX_PER_DAY = 3;

export async function submitFeedback(userId: string, dto: CreateFeedbackDto) {
  const todayCount = await repo.countTodayFeedback(userId);
  if (todayCount >= MAX_PER_DAY) {
    throw new AppError(
      `Has alcanzado el límite de ${MAX_PER_DAY} valoraciones por día`,
      429
    );
  }
  return repo.createFeedback({
    userId,
    rating: dto.rating,
    comment: dto.comment,
    page: dto.page,
  });
}

export async function getMyFeedback(userId: string) {
  return repo.findMyFeedback(userId);
}
