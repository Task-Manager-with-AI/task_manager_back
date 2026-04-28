import { Request, Response, NextFunction } from "express";
import { jwtVerify } from "jose";
import { AppError } from "../shared/errors/AppError";
import { env } from "../config/env";

const secret = new TextEncoder().encode(env.JWT_SECRET);

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const token = req.cookies?.[env.COOKIE_NAME] as string | undefined;
    if (!token) throw new AppError("Authentication required", 401);

    const { payload } = await jwtVerify(token, secret);

    req.user = {
      id: payload.id as string,
      email: payload.email as string,
      roleId: payload.roleId as number,
    };

    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(new AppError("Authentication required", 401));
  }
}
