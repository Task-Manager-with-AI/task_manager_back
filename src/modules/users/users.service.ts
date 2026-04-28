import { AppError } from "../../shared/errors/AppError";
import { findById, updateById, findAll } from "./users.repository";
import type { UpdateUserDto } from "./users.schema";

export async function getMe(userId: string) {
  const user = await findById(userId);
  if (!user) throw new AppError("User not found", 404);
  return user;
}

export async function updateMe(userId: string, dto: UpdateUserDto) {
  const user = await findById(userId);
  if (!user) throw new AppError("User not found", 404);
  return updateById(userId, dto);
}

export async function listUsers() {
  return findAll();
}
