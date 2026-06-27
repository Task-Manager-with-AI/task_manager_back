import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { superAdminMiddleware } from "../../middlewares/super-admin.middleware";
import {
  metricsController,
  listUsersController,
  patchUserController,
  listFeedbackController,
  feedbackStatsController,
  rolesController,
} from "./admin.controller";

export const adminRouter = Router();

adminRouter.use(authMiddleware, superAdminMiddleware);

adminRouter.get("/metrics", metricsController);
adminRouter.get("/roles", rolesController);
adminRouter.get("/users", listUsersController);
adminRouter.patch("/users/:id", patchUserController);
// Literal routes must come before parameterized routes
adminRouter.get("/feedback/stats", feedbackStatsController);
adminRouter.get("/feedback", listFeedbackController);
