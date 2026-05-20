import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { membershipMiddleware } from "../../middlewares/membership.middleware";
import {
  listKanbanColumnsController,
  updateKanbanLayoutController,
} from "./kanban.controller";

export const kanbanRouter = Router({ mergeParams: true });

kanbanRouter.get(
  "/columns",
  authMiddleware,
  membershipMiddleware,
  listKanbanColumnsController
);

kanbanRouter.put(
  "/columns",
  authMiddleware,
  membershipMiddleware,
  updateKanbanLayoutController
);
