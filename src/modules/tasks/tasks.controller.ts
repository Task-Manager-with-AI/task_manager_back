import { Request, Response, NextFunction } from "express";
import {
  createTaskSchema,
  updateTaskSchema,
  updateStatusSchema,
} from "./tasks.schema";
import {
  listProjectTasks,
  getTask,
  createNewTask,
  updateExistingTask,
  changeTaskStatus,
  removeTask,
} from "./tasks.service";
import { sendSuccess, sendCreated } from "../../shared/utils/response";

export async function listTasksController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const tasks = await listProjectTasks(req.params["projectId"] as string);
    sendSuccess(res, tasks);
  } catch (err) {
    next(err);
  }
}

export async function getTaskController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const task = await getTask(req.params["id"] as string, req.user!.id);
    sendSuccess(res, task);
  } catch (err) {
    next(err);
  }
}

export async function createTaskController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = createTaskSchema.parse(req.body);
    const task = await createNewTask(dto, req.params["projectId"] as string, req.user!.id);
    sendCreated(res, task, "Task created");
  } catch (err) {
    next(err);
  }
}

export async function updateTaskController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = updateTaskSchema.parse(req.body);
    const task = await updateExistingTask(req.params["id"] as string, req.user!.id, dto);
    sendSuccess(res, task, "Task updated");
  } catch (err) {
    next(err);
  }
}

export async function updateStatusController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = updateStatusSchema.parse(req.body);
    const task = await changeTaskStatus(req.params["id"] as string, req.user!.id, dto);
    sendSuccess(res, task, "Status updated");
  } catch (err) {
    next(err);
  }
}

export async function deleteTaskController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    await removeTask(req.params["id"] as string, req.user!.id);
    sendSuccess(res, null, "Task deleted");
  } catch (err) {
    next(err);
  }
}
