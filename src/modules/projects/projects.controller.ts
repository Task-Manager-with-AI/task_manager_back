import { Request, Response, NextFunction } from "express";
import {
  createProjectSchema,
  updateProjectSchema,
  addMemberSchema,
} from "./projects.schema";
import {
  listProjects,
  getProject,
  createNewProject,
  updateExistingProject,
  deleteProject,
  addProjectMember,
  getProjectMembers,
} from "./projects.service";
import { sendSuccess, sendCreated } from "../../shared/utils/response";

export async function listProjectsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const projects = await listProjects(req.user!.id);
    sendSuccess(res, projects);
  } catch (err) {
    next(err);
  }
}

export async function getProjectController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const project = await getProject(req.params["id"] as string);
    sendSuccess(res, project);
  } catch (err) {
    next(err);
  }
}

export async function createProjectController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = createProjectSchema.parse(req.body);
    const project = await createNewProject(dto, req.user!.id);
    sendCreated(res, project, "Project created");
  } catch (err) {
    next(err);
  }
}

export async function updateProjectController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = updateProjectSchema.parse(req.body);
    const project = await updateExistingProject(req.params["id"] as string, dto);
    sendSuccess(res, project, "Project updated");
  } catch (err) {
    next(err);
  }
}

export async function deleteProjectController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    await deleteProject(req.params["id"] as string);
    sendSuccess(res, null, "Project deleted");
  } catch (err) {
    next(err);
  }
}

export async function addMemberController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = addMemberSchema.parse(req.body);
    const member = await addProjectMember(req.params["id"] as string, dto);
    sendCreated(res, member, "Member added");
  } catch (err) {
    next(err);
  }
}

export async function getMembersController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const members = await getProjectMembers(req.params["id"] as string);
    sendSuccess(res, members);
  } catch (err) {
    next(err);
  }
}
