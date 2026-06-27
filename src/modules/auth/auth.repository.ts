import { prisma } from "../../prisma/client";

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });
}

export async function findUserByGoogleId(googleId: string) {
  return prisma.user.findUnique({
    where: { googleId },
    include: { role: true },
  });
}

export async function createUser(data: {
  name: string;
  email: string;
  passwordHash?: string;
  googleId?: string;
  roleId: number;
  emailVerified?: boolean;
  emailVerificationCode?: string;
  emailVerificationExpires?: Date;
}) {
  return prisma.user.create({
    data,
    select: {
      id: true,
      name: true,
      email: true,
      roleId: true,
      isActive: true,
      emailVerified: true,
      createdAt: true,
    },
  });
}

export async function updateVerificationCode(
  email: string,
  code: string,
  expires: Date
) {
  return prisma.user.update({
    where: { email },
    data: {
      emailVerificationCode: code,
      emailVerificationExpires: expires,
    },
  });
}

export async function markEmailVerified(email: string) {
  return prisma.user.update({
    where: { email },
    data: {
      emailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpires: null,
    },
  });
}

export async function linkGoogleId(userId: string, googleId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: { googleId, emailVerified: true },
  });
}
