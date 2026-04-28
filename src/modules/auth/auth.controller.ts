import { Request, Response, NextFunction } from "express";
import { registerSchema, loginSchema } from "./auth.schema";
import { register, login, getMe } from "./auth.service";
import { sendSuccess, sendCreated } from "../../shared/utils/response";
import { env } from "../../config/env";

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 86400000,
};

/** Opciones para borrar la cookie: sin maxAge (Express depreca maxAge en clearCookie). Deben coincidir path/httpOnly/secure/sameSite con COOKIE_OPTIONS. */
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
    sendCreated(res, user, "Account created successfully");
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
