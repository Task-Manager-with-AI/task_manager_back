import { Router, type Router as ExpressRouter } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { overviewController, calendarController } from "./dashboard.controller";

export const dashboardRouter: ExpressRouter = Router();

dashboardRouter.get("/overview", authMiddleware, overviewController);
dashboardRouter.get("/calendar", authMiddleware, calendarController);
