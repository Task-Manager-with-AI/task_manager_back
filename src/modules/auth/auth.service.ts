import * as argon2 from "argon2";
import { SignJWT } from "jose";
import { prisma } from "../../prisma/client";
import { AppError } from "../../shared/errors/AppError";
import { env } from "../../config/env";
import { findUserByEmail, createUser } from "./auth.repository";
import type { RegisterDto, LoginDto } from "./auth.schema";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function register(dto: RegisterDto) {
  const existing = await findUserByEmail(dto.email);
  if (existing) throw new AppError("Email already in use", 409);

  const memberRole = await prisma.role.findUnique({ where: { name: "MEMBER" } });
  if (!memberRole) throw new AppError("Role configuration error", 500);

  const passwordHash = await argon2.hash(dto.password);

  const user = await createUser({
    name: dto.name,
    email: dto.email,
    passwordHash,
    roleId: memberRole.id,
  });

  return user;
}

export async function login(dto: LoginDto) {
  const INVALID_CREDENTIALS = "Invalid credentials";

  const user = await findUserByEmail(dto.email);
  if (!user) throw new AppError(INVALID_CREDENTIALS, 401);

  const valid = await argon2.verify(user.passwordHash, dto.password);
  if (!valid) throw new AppError(INVALID_CREDENTIALS, 401);

  const token = await new SignJWT({
    id: user.id,
    email: user.email,
    roleId: user.roleId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secret);

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    roleId: user.roleId,
  };

  return { token, user: safeUser };
}

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      roleId: true,
      isActive: true,
      createdAt: true,
      role: { select: { name: true } },
    },
  });
  if (!user) throw new AppError("User not found", 404);
  return user;
}
