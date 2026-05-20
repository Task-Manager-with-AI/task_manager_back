import { Request, Response, NextFunction } from "express";
import {
  acceptSuggestionSchema,
  updateSuggestionSchema,
} from "./suggestions.schema";
import {
  acceptSuggestion,
  listMinuteSuggestions,
  rejectSuggestion,
  updateSuggestion,
} from "./suggestions.service";
import { sendSuccess } from "../../shared/utils/response";

export async function listSuggestionsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const suggestions = await listMinuteSuggestions(
      req.params["minuteId"] as string,
      req.user!.id
    );
    sendSuccess(res, suggestions);
  } catch (err) {
    next(err);
  }
}

export async function updateSuggestionController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = updateSuggestionSchema.parse(req.body);
    const updated = await updateSuggestion(
      req.params["suggestionId"] as string,
      req.user!.id,
      dto
    );
    sendSuccess(res, updated, "Suggestion updated");
  } catch (err) {
    next(err);
  }
}

export async function rejectSuggestionController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const updated = await rejectSuggestion(
      req.params["suggestionId"] as string,
      req.user!.id
    );
    sendSuccess(res, updated, "Suggestion rejected");
  } catch (err) {
    next(err);
  }
}

export async function acceptSuggestionController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = acceptSuggestionSchema.parse(req.body ?? {});
    const result = await acceptSuggestion(
      req.params["suggestionId"] as string,
      req.user!.id,
      dto
    );
    sendSuccess(res, result, "Suggestion accepted — task created");
  } catch (err) {
    next(err);
  }
}
