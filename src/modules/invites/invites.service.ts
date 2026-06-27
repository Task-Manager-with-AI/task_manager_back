import { prisma } from "../../prisma/client";
import { AppError } from "../../shared/errors/AppError";
import { env } from "../../config/env";
import { addMember } from "../projects/projects.repository";
import {
  createInvite,
  findInviteByToken,
  markInviteAccepted,
} from "./invites.repository";
import type { CreateInviteLinkDto, SendInviteEmailDto } from "./invites.schema";

function expiresAt() {
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
}

async function assertAdminOfProject(projectId: string, userId: string) {
  const membership = await prisma.projectMember.findFirst({
    where: { projectId, userId, isActive: true },
  });
  if (!membership) throw new AppError("Not a member of this project", 403);
  if (membership.memberRole !== "ADMIN") throw new AppError("Only admins can invite", 403);
}

export async function createInviteLink(
  projectId: string,
  createdById: string,
  dto: CreateInviteLinkDto
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.status !== "ACTIVE") throw new AppError("Project not found", 404);

  await assertAdminOfProject(projectId, createdById);

  const invite = await createInvite({
    projectId,
    createdById,
    memberRole: dto.memberRole,
    expiresAt: expiresAt(),
  });

  const inviteUrl = `${env.FRONTEND_URL}/invite/project/${invite.token}`;
  return { inviteUrl, token: invite.token, expiresAt: invite.expiresAt };
}

export async function sendInviteByEmail(
  projectId: string,
  createdById: string,
  dto: SendInviteEmailDto
) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.status !== "ACTIVE") throw new AppError("Project not found", 404);

  await assertAdminOfProject(projectId, createdById);

  const invite = await createInvite({
    projectId,
    createdById,
    email: dto.email.toLowerCase(),
    memberRole: dto.memberRole,
    expiresAt: expiresAt(),
  });

  const inviteUrl = `${env.FRONTEND_URL}/invite/project/${invite.token}`;

  // [DEMO] Email invite disabled (no Resend sending domain configured yet).
  // Instead of emailing, we return the invite link so the admin can share it.
  // To re-enable: re-import sendProjectInviteEmail and call it here.
  return {
    inviteUrl,
    token: invite.token,
    expiresAt: invite.expiresAt,
    message: "Invite created — share this link (email sending is disabled)",
  };
}

export async function getInviteInfo(token: string) {
  const invite = await findInviteByToken(token);
  if (!invite) throw new AppError("Invite not found", 404);

  if (invite.acceptedAt) {
    return { valid: false, reason: "used" as const, projectName: invite.project.name };
  }
  if (invite.expiresAt < new Date()) {
    return { valid: false, reason: "expired" as const, projectName: invite.project.name };
  }
  if (invite.project.status !== "ACTIVE") {
    return { valid: false, reason: "expired" as const, projectName: invite.project.name };
  }

  return {
    valid: true,
    projectName: invite.project.name,
    projectId: invite.project.id,
    memberRole: invite.memberRole,
    invitedEmail: invite.email ?? null,
    createdBy: invite.createdBy.name,
  };
}

export async function acceptInvite(token: string, userId: string, userEmail: string) {
  const invite = await findInviteByToken(token);
  if (!invite) throw new AppError("Invite not found", 404);
  if (invite.acceptedAt) throw new AppError("This invite has already been used", 409);
  if (invite.expiresAt < new Date()) throw new AppError("This invite has expired", 410);
  if (invite.project.status !== "ACTIVE") throw new AppError("Project is no longer active", 410);

  // If the invite was scoped to a specific email, enforce it
  if (invite.email && invite.email !== userEmail.toLowerCase()) {
    throw new AppError("This invite was sent to a different email address", 403);
  }

  // Check if already a member
  const existingMember = await prisma.projectMember.findFirst({
    where: { projectId: invite.projectId, userId, isActive: true },
  });
  if (existingMember) {
    throw new AppError("You are already a member of this project", 409);
  }

  await addMember({ projectId: invite.projectId, userId, memberRole: invite.memberRole });
  await markInviteAccepted(invite.id, userId);

  return { projectId: invite.projectId, projectName: invite.project.name };
}
