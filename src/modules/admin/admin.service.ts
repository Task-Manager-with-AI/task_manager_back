import { prisma } from "../../prisma/client";
import { AppError } from "../../shared/errors/AppError";
import * as repo from "./admin.repository";

export async function getMetrics() {
  return repo.getPlatformMetrics();
}

export async function listUsers(params: {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  isActive?: boolean;
  sortBy?: string;
  order?: "asc" | "desc";
}) {
  return repo.findAllUsers(params);
}

export async function patchUser(
  targetId: string,
  data: { isActive?: boolean; roleId?: number },
  requesterId: string
) {
  if (targetId === requesterId) {
    throw new AppError("Cannot modify your own account from the admin panel", 403);
  }

  const target = await repo.findUserById(targetId);
  if (!target) throw new AppError("User not found", 404);

  if (target.role.name === "SUPER_ADMIN") {
    throw new AppError("Cannot modify the SUPER_ADMIN account", 403);
  }

  if (data.roleId) {
    const role = await prisma.role.findUnique({
      where: { id: data.roleId },
      select: { name: true },
    });
    if (!role) throw new AppError("Role not found", 404);
    if (role.name === "SUPER_ADMIN") {
      throw new AppError("Cannot promote users to SUPER_ADMIN via this endpoint", 403);
    }
  }

  return repo.updateUser(targetId, data);
}

export async function listFeedback(params: {
  page: number;
  limit: number;
  rating?: number;
  from?: Date;
  to?: Date;
  sortBy?: string;
  order?: "asc" | "desc";
}) {
  return repo.findAllFeedback(params);
}

export async function getFeedbackStats() {
  return repo.getFeedbackStats();
}
