import * as argon2 from "argon2";
import * as crypto from "crypto";
import { SignJWT } from "jose";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../../prisma/client";
import { AppError } from "../../shared/errors/AppError";
import { env } from "../../config/env";
import { sendVerificationEmail } from "../../shared/email.service";
import { ensureSupportChat } from "../chats/chats.service";
import {
  findUserByEmail,
  findUserByGoogleId,
  createUser,
  updateVerificationCode,
  markEmailVerified,
  linkGoogleId,
} from "./auth.repository";
import type {
  RegisterDto,
  LoginDto,
  VerifyEmailDto,
  ResendVerificationDto,
  GoogleAuthDto,
} from "./auth.schema";

const secret = new TextEncoder().encode(env.JWT_SECRET);
const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

function generateCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

function codeExpiry(): Date {
  return new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
}

async function issueToken(user: { id: string; email: string; roleId: number }) {
  const role = await prisma.role.findUnique({
    where: { id: user.roleId },
    select: { name: true },
  });
  const roleName = role?.name ?? "MEMBER";
  const token = await new SignJWT({
    id: user.id,
    email: user.email,
    roleId: user.roleId,
    roleName,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secret);
  return { token, roleName };
}

export async function register(dto: RegisterDto) {
  const existing = await findUserByEmail(dto.email);
  if (existing) throw new AppError("Email already in use", 409);

  const memberRole = await prisma.role.findUnique({ where: { name: "MEMBER" } });
  if (!memberRole) throw new AppError("Role configuration error", 500);

  const passwordHash = await argon2.hash(dto.password);

  // [DEMO] Email verification disabled: users are auto-verified on register.
  // To re-enable: set emailVerified:false, pass emailVerificationCode/expires,
  // and call sendVerificationEmail(dto.email, code) once a Resend sending
  // domain is verified.
  const user = await createUser({
    name: dto.name,
    email: dto.email,
    passwordHash,
    roleId: memberRole.id,
    emailVerified: true,
  });

  // Fire-and-forget: create support chat with super admin
  void ensureSupportChat(user.id).catch(console.error);

  return user;
}

export async function verifyEmail(dto: VerifyEmailDto) {
  const user = await findUserByEmail(dto.email);
  if (!user) throw new AppError("User not found", 404);
  if (user.emailVerified) throw new AppError("Email already verified", 409);

  if (
    !user.emailVerificationCode ||
    !user.emailVerificationExpires ||
    user.emailVerificationCode !== dto.code ||
    user.emailVerificationExpires < new Date()
  ) {
    throw new AppError("Invalid or expired verification code", 400);
  }

  await markEmailVerified(dto.email);

  const { token, roleName } = await issueToken(user);
  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, roleId: user.roleId, role: { name: roleName } },
  };
}

export async function resendVerificationCode(dto: ResendVerificationDto) {
  const user = await findUserByEmail(dto.email);
  if (!user) throw new AppError("User not found", 404);
  if (user.emailVerified) throw new AppError("Email already verified", 409);

  const code = generateCode();
  const expires = codeExpiry();
  await updateVerificationCode(dto.email, code, expires);
  await sendVerificationEmail(dto.email, code);
}

export async function login(dto: LoginDto) {
  const INVALID_CREDENTIALS = "Invalid credentials";

  const user = await findUserByEmail(dto.email);
  if (!user) throw new AppError(INVALID_CREDENTIALS, 401);

  if (!user.passwordHash) {
    throw new AppError("This account uses Google Sign-In. Please sign in with Google.", 400);
  }

  const valid = await argon2.verify(user.passwordHash, dto.password);
  if (!valid) throw new AppError(INVALID_CREDENTIALS, 401);

  // [DEMO] Email verification check disabled.

  const { token, roleName } = await issueToken(user);
  const safeUser = { id: user.id, name: user.name, email: user.email, roleId: user.roleId, role: { name: roleName } };
  return { token, user: safeUser };
}

export async function googleAuth(dto: GoogleAuthDto) {
  const ticket = await googleClient
    .verifyIdToken({ idToken: dto.credential, audience: env.GOOGLE_CLIENT_ID })
    .catch(() => {
      throw new AppError("Invalid Google credential", 401);
    });

  const payload = ticket.getPayload();
  if (!payload?.email) throw new AppError("Google account has no email", 400);

  const { email, name = "Google User", sub: googleId } = payload;

  let user = await findUserByGoogleId(googleId);

  if (!user) {
    const existingByEmail = await findUserByEmail(email);

    if (existingByEmail) {
      await linkGoogleId(existingByEmail.id, googleId);
      user = await findUserByGoogleId(googleId);
    } else {
      const memberRole = await prisma.role.findUnique({ where: { name: "MEMBER" } });
      if (!memberRole) throw new AppError("Role configuration error", 500);

      await createUser({
        name,
        email,
        googleId,
        roleId: memberRole.id,
        emailVerified: true,
      });
      user = await findUserByGoogleId(googleId);
    }
  }

  if (!user) throw new AppError("Authentication failed", 500);

  // Fire-and-forget: create support chat for new Google users
  void ensureSupportChat(user.id).catch(console.error);

  const { token, roleName } = await issueToken(user);
  const safeUser = { id: user.id, name: user.name, email: user.email, roleId: user.roleId, role: { name: roleName } };
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
      emailVerified: true,
      createdAt: true,
      role: { select: { name: true } },
    },
  });
  if (!user) throw new AppError("User not found", 404);
  return user;
}
