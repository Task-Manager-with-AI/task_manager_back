import { Request, Response, NextFunction } from "express";
import { updateKanbanLayoutSchema } from "./kanban.schema";
import { listKanbanColumns, replaceKanbanLayout } from "./kanban.service";
import { sendSuccess } from "../../shared/utils/response";

export async function listKanbanColumnsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const projectId = req.params["id"] as string;
    const columns = await listKanbanColumns(projectId);
    sendSuccess(res, columns);
  } catch (err) {
    next(err);
  }
}

export async function updateKanbanLayoutController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const projectId = req.params["id"] as string;
    const dto = updateKanbanLayoutSchema.parse(req.body);
    const columns = await replaceKanbanLayout(projectId, dto);
    sendSuccess(res, columns, "Kanban layout updated");
  } catch (err) {
    next(err);
  }
}
