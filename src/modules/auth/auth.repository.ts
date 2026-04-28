import { prisma } from "../../prisma/client";

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    include: { role: true },
  });
}

export async function createUser(data: {
  name: string;
  email: string;
  passwordHash: string;
  roleId: number;
}) {
  return prisma.user.create({
    data,
    select: {
      id: true,
      name: true,
      email: true,
      roleId: true,
      isActive: true,
      createdAt: true,
    },
  });
}
