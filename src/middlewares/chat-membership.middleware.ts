import { Request, Response, NextFunction } from "express";
import { prisma } from "../prisma/client";
import { AppError } from "../shared/errors/AppError";

/**
 * Verifies the authenticated user is an active participant of the chat
 * identified by `:chatId`. Used in place of project membership for chat routes,
 * since direct chats have no associated project.
 */
export async function chatMembershipMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user!.id;
    const chatId = req.params["chatId"] as string;

    const participant = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } },
    });

    if (!participant || !participant.isActive) {
      throw new AppError("Chat not found or access denied", 403);
    }

    next();
  } catch (err) {
    next(err);
  }
}
