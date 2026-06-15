import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { overviewController, calendarController } from "./dashboard.controller";

export const dashboardRouter = Router();

dashboardRouter.get("/overview", authMiddleware, overviewController);
dashboardRouter.get("/calendar", authMiddleware, calendarController);
