import { Router, type Router as ExpressRouter } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { membershipMiddleware } from "../../middlewares/membership.middleware";
import {
  listSprintsController,
  getActiveSprintController,
  getSprintController,
  createSprintController,
  updateSprintController,
  startSprintController,
  completeSprintController,
  deleteSprintController,
  assignTasksController,
} from "./sprints.controller";

export const sprintsRouter: ExpressRouter = Router();

// Project-scoped routes
sprintsRouter.get(
  "/projects/:projectId/sprints",
  authMiddleware,
  membershipMiddleware,
  listSprintsController
);

sprintsRouter.get(
  "/projects/:projectId/sprints/active",
  authMiddleware,
  membershipMiddleware,
  getActiveSprintController
);

sprintsRouter.post(
  "/projects/:projectId/sprints",
  authMiddleware,
  membershipMiddleware,
  createSprintController
);

// Sprint-scoped routes (membership checked inside service via sprint.projectId)
sprintsRouter.get("/sprints/:sprintId", authMiddleware, getSprintController);
sprintsRouter.patch("/sprints/:sprintId", authMiddleware, updateSprintController);
sprintsRouter.post("/sprints/:sprintId/start", authMiddleware, startSprintController);
sprintsRouter.post("/sprints/:sprintId/complete", authMiddleware, completeSprintController);
sprintsRouter.delete("/sprints/:sprintId", authMiddleware, deleteSprintController);
sprintsRouter.patch("/sprints/:sprintId/tasks", authMiddleware, assignTasksController);
