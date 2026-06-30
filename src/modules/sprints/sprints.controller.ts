import { Request, Response, NextFunction } from "express";
import {
  createSprintSchema,
  updateSprintSchema,
  assignTasksSchema,
} from "./sprints.schema";
import {
  listSprints,
  getSprintWithTasks,
  getActiveSprint,
  createNewSprint,
  updateSprintData,
  startSprintService,
  completeSprintService,
  deleteSprintService,
  assignSprintTasks,
} from "./sprints.service";
import { sendSuccess, sendCreated } from "../../shared/utils/response";

export async function listSprintsController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listSprints(req.params["projectId"] as string);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getActiveSprintController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getActiveSprint(req.params["projectId"] as string);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function getSprintController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getSprintWithTasks(req.params["sprintId"] as string);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function createSprintController(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = createSprintSchema.parse(req.body);
    const data = await createNewSprint(req.params["projectId"] as string, dto);
    sendCreated(res, data, "Sprint created");
  } catch (err) {
    next(err);
  }
}

export async function updateSprintController(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = updateSprintSchema.parse(req.body);
    const data = await updateSprintData(req.params["sprintId"] as string, dto);
    sendSuccess(res, data, "Sprint updated");
  } catch (err) {
    next(err);
  }
}

export async function startSprintController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await startSprintService(req.params["sprintId"] as string);
    sendSuccess(res, data, "Sprint started");
  } catch (err) {
    next(err);
  }
}

export async function completeSprintController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await completeSprintService(req.params["sprintId"] as string);
    sendSuccess(res, data, "Sprint completed");
  } catch (err) {
    next(err);
  }
}

export async function deleteSprintController(req: Request, res: Response, next: NextFunction) {
  try {
    await deleteSprintService(req.params["sprintId"] as string);
    sendSuccess(res, null, "Sprint deleted");
  } catch (err) {
    next(err);
  }
}

export async function assignTasksController(req: Request, res: Response, next: NextFunction) {
  try {
    const dto = assignTasksSchema.parse(req.body);
    const data = await assignSprintTasks(req.params["sprintId"] as string, dto);
    sendSuccess(res, data, "Tasks updated");
  } catch (err) {
    next(err);
  }
}
