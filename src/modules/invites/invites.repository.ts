import { prisma } from "../../prisma/client";

export async function createInvite(data: {
  projectId: string;
  createdById: string;
  email?: string;
  memberRole: string;
  expiresAt: Date;
}) {
  return prisma.projectInvite.create({ data });
}

export async function findInviteByToken(token: string) {
  return prisma.projectInvite.findUnique({
    where: { token },
    include: {
      project: { select: { id: true, name: true, status: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export async function markInviteAccepted(id: string, acceptedById: string) {
  return prisma.projectInvite.update({
    where: { id },
    data: { acceptedAt: new Date(), acceptedById },
  });
}

export async function findActiveInvitesByProject(projectId: string) {
  return prisma.projectInvite.findMany({
    where: {
      projectId,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });
}
