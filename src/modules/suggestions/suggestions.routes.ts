import { Router, type Router as ExpressRouter } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {
  acceptSuggestionController,
  listSuggestionsController,
  rejectSuggestionController,
  updateSuggestionController,
} from "./suggestions.controller";

export const suggestionsRouter: ExpressRouter = Router();

suggestionsRouter.get(
  "/minutes/:minuteId/suggestions",
  authMiddleware,
  listSuggestionsController
);

suggestionsRouter.patch(
  "/suggestions/:suggestionId",
  authMiddleware,
  updateSuggestionController
);

suggestionsRouter.patch(
  "/suggestions/:suggestionId/accept",
  authMiddleware,
  acceptSuggestionController
);

suggestionsRouter.patch(
  "/suggestions/:suggestionId/reject",
  authMiddleware,
  rejectSuggestionController
);
