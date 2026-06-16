import { Request, Response, NextFunction } from "express";
import { sendSuccess, sendCreated } from "../../shared/utils/response";
import { AppError } from "../../shared/errors/AppError";
import {
  sendMessageSchema,
  editMessageSchema,
  reactionSchema,
  directChatSchema,
  convertToTaskSchema,
  listMessagesQuerySchema,
} from "./chats.schema";
import * as service from "./chats.service";

export async function listChatsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const chats = await service.listChats(req.user!.id);
    sendSuccess(res, chats);
  } catch (err) {
    next(err);
  }
}

export async function getChatController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const chat = await service.getChat(req.params["chatId"] as string, req.user!.id);
    sendSuccess(res, chat);
  } catch (err) {
    next(err);
  }
}

export async function listMessagesController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { cursor, limit } = listMessagesQuerySchema.parse(req.query);
    const result = await service.listMessages(
      req.params["chatId"] as string,
      req.user!.id,
      limit,
      cursor
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function sendMessageController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = sendMessageSchema.parse(req.body);
    const message = await service.sendMessage(
      req.params["chatId"] as string,
      req.user!.id,
      dto
    );
    sendCreated(res, message, "Message sent");
  } catch (err) {
    next(err);
  }
}

export async function editMessageController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = editMessageSchema.parse(req.body);
    const message = await service.editMessage(
      req.params["messageId"] as string,
      req.user!.id,
      dto
    );
    sendSuccess(res, message, "Message updated");
  } catch (err) {
    next(err);
  }
}

export async function deleteMessageController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const message = await service.deleteMessage(
      req.params["messageId"] as string,
      req.user!.id
    );
    sendSuccess(res, message, "Message deleted");
  } catch (err) {
    next(err);
  }
}

export async function toggleReactionController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { emoji } = reactionSchema.parse(req.body);
    const reactions = await service.toggleReaction(
      req.params["messageId"] as string,
      req.user!.id,
      emoji
    );
    sendSuccess(res, reactions);
  } catch (err) {
    next(err);
  }
}

export async function markReadController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await service.markRead(
      req.params["chatId"] as string,
      req.user!.id
    );
    sendSuccess(res, result, "Chat marked as read");
  } catch (err) {
    next(err);
  }
}

export async function directChatController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { userId } = directChatSchema.parse(req.body);
    const chat = await service.getOrCreateDirectChat(req.user!.id, userId);
    sendSuccess(res, chat);
  } catch (err) {
    next(err);
  }
}

export async function projectChatController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await service.getProjectChatId(
      req.params["projectId"] as string
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function uploadAttachmentController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.file) {
      throw new AppError("No file provided (field name 'file')", 400);
    }
    const message = await service.sendAttachment(
      req.params["chatId"] as string,
      req.user!.id,
      { buffer: req.file.buffer, mimetype: req.file.mimetype }
    );
    sendCreated(res, message, "Attachment uploaded");
  } catch (err) {
    next(err);
  }
}

export async function getAttachmentController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { buffer, mime } = await service.getAttachment(
      req.params["messageId"] as string,
      req.user!.id
    );
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function convertToTaskController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = convertToTaskSchema.parse(req.body ?? {});
    const result = await service.convertMessageToTask(
      req.params["messageId"] as string,
      req.user!.id,
      dto
    );
    sendCreated(res, result, "Task created from message");
  } catch (err) {
    next(err);
  }
}

export async function summaryController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await service.summarizeChat(
      req.params["chatId"] as string,
      req.user!.id
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}
