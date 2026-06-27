import { prisma } from "../../prisma/client";

const safeSelect = {
  id: true,
  name: true,
  email: true,
  roleId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { name: true } },
};

export async function findById(id: string) {
  return prisma.user.findUnique({ where: { id }, select: safeSelect });
}

export async function updateById(id: string, data: { name?: string }) {
  return prisma.user.update({ where: { id }, data, select: safeSelect });
}

export async function findAll() {
  return prisma.user.findMany({ where: { isActive: true }, select: safeSelect });
}

export async function findUsersSharedWithMe(requesterId: string) {
  const myMemberships = await prisma.projectMember.findMany({
    where: { userId: requesterId, isActive: true },
    select: { projectId: true },
  });
  const projectIds = myMemberships.map((m) => m.projectId);

  return prisma.user.findMany({
    where: {
      isActive: true,
      id: { not: requesterId },
      memberships: { some: { projectId: { in: projectIds }, isActive: true } },
    },
    select: safeSelect,
    orderBy: { name: "asc" },
  });
}
