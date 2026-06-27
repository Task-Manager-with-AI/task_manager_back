import { Request, Response, NextFunction } from "express";
import { AppError } from "../shared/errors/AppError";
import { prisma } from "../prisma/client";

export async function superAdminMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const role = await prisma.role.findUnique({
      where: { id: req.user!.roleId },
      select: { name: true },
    });
    if (role?.name !== "SUPER_ADMIN") {
      throw new AppError("Access denied", 403);
    }
    next();
  } catch (err) {
    next(err instanceof AppError ? err : new AppError("Access denied", 403));
  }
}
