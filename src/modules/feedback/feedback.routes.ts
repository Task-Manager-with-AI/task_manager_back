import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { submitFeedbackController, getMyFeedbackController } from "./feedback.controller";

export const feedbackRouter = Router();

feedbackRouter.use(authMiddleware);

feedbackRouter.post("/feedback", submitFeedbackController);
feedbackRouter.get("/feedback/my", getMyFeedbackController);
