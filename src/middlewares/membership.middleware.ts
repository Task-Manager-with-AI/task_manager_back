import { Request, Response, NextFunction } from "express";
import { prisma } from "../prisma/client";
import { AppError } from "../shared/errors/AppError";

export async function membershipMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const projectId = (req.params["projectId"] ?? req.params["id"]) as string;

    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId, projectId } },
    });

    if (!membership || !membership.isActive) {
      throw new AppError("Access forbidden", 403);
    }

    next();
  } catch (err) {
    next(err);
  }
}
