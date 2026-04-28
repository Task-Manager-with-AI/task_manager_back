import { AppError } from "../../shared/errors/AppError";
import {
  findProjectsByUser,
  findProjectById,
  createProject,
  updateProject,
  softDeleteProject,
  addMember,
  findMembers,
  findActiveUserById,
} from "./projects.repository";
import type {
  CreateProjectDto,
  UpdateProjectDto,
  AddMemberDto,
} from "./projects.schema";

export async function listProjects(userId: string) {
  return findProjectsByUser(userId);
}

export async function getProject(id: string) {
  const project = await findProjectById(id);
  if (!project || project.status === "INACTIVE") {
    throw new AppError("Project not found", 404);
  }
  return project;
}

export async function createNewProject(
  dto: CreateProjectDto,
  createdById: string
) {
  return createProject({ ...dto, createdById });
}

export async function updateExistingProject(
  id: string,
  dto: UpdateProjectDto
) {
  const project = await findProjectById(id);
  if (!project) throw new AppError("Project not found", 404);
  return updateProject(id, dto);
}

export async function deleteProject(id: string) {
  const project = await findProjectById(id);
  if (!project) throw new AppError("Project not found", 404);
  return softDeleteProject(id);
}

export async function addProjectMember(projectId: string, dto: AddMemberDto) {
  const project = await findProjectById(projectId);
  if (!project || project.status === "INACTIVE") {
    throw new AppError("Project not found", 404);
  }

  const user = await findActiveUserById(dto.userId);
  if (!user) {
    throw new AppError("User not found", 404);
  }

  try {
    return await addMember({ projectId, userId: dto.userId, memberRole: dto.memberRole });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e?.code === "P2002") throw new AppError("User is already a member", 409);
    throw err;
  }
}

export async function getProjectMembers(projectId: string) {
  return findMembers(projectId);
}
