import { Prisma } from "@prisma/client";
import { prisma } from "../../prisma/client";

export async function findProjectsByUser(userId: string) {
  return prisma.project.findMany({
    where: {
      status: "ACTIVE",
      members: { some: { userId, isActive: true } },
    },
    include: { createdBy: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function findProjectById(id: string) {
  return prisma.project.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      members: {
        where: { isActive: true },
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  });
}

export async function createProject(data: {
  name: string;
  description?: string;
  createdById: string;
}) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const project = await tx.project.create({ data });
    await tx.projectMember.create({
      data: { userId: data.createdById, projectId: project.id, memberRole: "ADMIN" },
    });
    return project;
  });
}

export async function updateProject(
  id: string,
  data: { name?: string; description?: string }
) {
  return prisma.project.update({ where: { id }, data });
}

export async function softDeleteProject(id: string) {
  return prisma.project.update({ where: { id }, data: { status: "INACTIVE" } });
}

export async function addMember(data: {
  projectId: string;
  userId: string;
  memberRole: string;
}) {
  return prisma.projectMember.create({
    data,
    include: { user: { select: { id: true, name: true, email: true } } },
  });
}

export async function findMembers(projectId: string) {
  return prisma.projectMember.findMany({
    where: { projectId, isActive: true },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: "asc" },
  });
}

export async function findActiveUserById(userId: string) {
  return prisma.user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true },
  });
}
