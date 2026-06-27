import { Request, Response, NextFunction } from "express";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  googleAuthSchema,
} from "./auth.schema";
import {
  register,
  login,
  getMe,
  verifyEmail,
  resendVerificationCode,
  googleAuth,
} from "./auth.service";
import { sendSuccess, sendCreated } from "../../shared/utils/response";
import { AppError } from "../../shared/errors/AppError";
import { env } from "../../config/env";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 86400000,
};

const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function registerController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = registerSchema.parse(req.body);
    const user = await register(dto);
    sendCreated(res, user, "Account created. Please verify your email.");
  } catch (err) {
    next(err);
  }
}

export async function verifyEmailController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = verifyEmailSchema.parse(req.body);
    const { token, user } = await verifyEmail(dto);
    res.cookie(env.COOKIE_NAME, token, COOKIE_OPTIONS);
    sendSuccess(res, user, "Email verified successfully");
  } catch (err) {
    next(err);
  }
}

export async function resendVerificationController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = resendVerificationSchema.parse(req.body);
    await resendVerificationCode(dto);
    sendSuccess(res, null, "Verification code sent");
  } catch (err) {
    next(err);
  }
}

export async function loginController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = loginSchema.parse(req.body);
    const { token, user } = await login(dto);
    res.cookie(env.COOKIE_NAME, token, COOKIE_OPTIONS);
    sendSuccess(res, user, "Logged in successfully");
  } catch (err) {
    next(err);
  }
}

export async function googleAuthController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = googleAuthSchema.parse(req.body);
    const { token, user } = await googleAuth(dto);
    res.cookie(env.COOKIE_NAME, token, COOKIE_OPTIONS);
    sendSuccess(res, user, "Logged in with Google");
  } catch (err) {
    next(err);
  }
}

export async function logoutController(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    res.clearCookie(env.COOKIE_NAME, CLEAR_COOKIE_OPTIONS);
    sendSuccess(res, null, "Logged out successfully");
  } catch (err) {
    next(err);
  }
}

export async function meController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const user = await getMe(req.user!.id);
    sendSuccess(res, user);
  } catch (err) {
    next(err);
  }
}

export async function realtimeTokenController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.cookies?.[env.COOKIE_NAME] as string | undefined;
    if (!token) throw new AppError("Authentication required", 401);
    sendSuccess(res, { token });
  } catch (err) {
    next(err);
  }
}
