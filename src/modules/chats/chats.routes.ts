import { Router, type Router as ExpressRouter } from "express";
import multer from "multer";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { membershipMiddleware } from "../../middlewares/membership.middleware";
import { chatMembershipMiddleware } from "../../middlewares/chat-membership.middleware";
import { AppError } from "../../shared/errors/AppError";
import {
  listChatsController,
  getChatController,
  listMessagesController,
  sendMessageController,
  editMessageController,
  deleteMessageController,
  toggleReactionController,
  markReadController,
  directChatController,
  projectChatController,
  uploadAttachmentController,
  getAttachmentController,
  convertToTaskController,
  summaryController,
} from "./chats.controller";

export const chatsRouter: ExpressRouter = Router();

const ALLOWED_MIME = [
  /^image\//,
  /^application\/pdf$/,
  /^application\/msword$/,
  /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document$/,
  /^text\/plain$/,
];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.some((re) => re.test(file.mimetype))) {
      cb(null, true);
    } else {
      cb(new AppError(`Unsupported file type: ${file.mimetype}`, 400));
    }
  },
});

// ── List ──────────────────────────────────────────────────────────────────
chatsRouter.get("/chats", authMiddleware, listChatsController);

// ── Direct chat (literal — declared before /chats/:chatId) ─────────────────
chatsRouter.post("/chats/direct", authMiddleware, directChatController);

// ── Attachments serving (literal) ─────────────────────────────────────────
chatsRouter.get(
  "/chats/attachments/:messageId",
  authMiddleware,
  getAttachmentController
);

// ── Message-scoped routes (literal /chats/messages/...) ────────────────────
chatsRouter.patch(
  "/chats/messages/:messageId",
  authMiddleware,
  editMessageController
);
chatsRouter.delete(
  "/chats/messages/:messageId",
  authMiddleware,
  deleteMessageController
);
chatsRouter.post(
  "/chats/messages/:messageId/reactions",
  authMiddleware,
  toggleReactionController
);
chatsRouter.post(
  "/chats/messages/:messageId/convert-to-task",
  authMiddleware,
  convertToTaskController
);

// ── Chat-scoped routes (:chatId) ───────────────────────────────────────────
chatsRouter.get(
  "/chats/:chatId",
  authMiddleware,
  chatMembershipMiddleware,
  getChatController
);
chatsRouter.get(
  "/chats/:chatId/messages",
  authMiddleware,
  chatMembershipMiddleware,
  listMessagesController
);
chatsRouter.post(
  "/chats/:chatId/messages",
  authMiddleware,
  chatMembershipMiddleware,
  sendMessageController
);
chatsRouter.post(
  "/chats/:chatId/attachments",
  authMiddleware,
  chatMembershipMiddleware,
  upload.single("file"),
  uploadAttachmentController
);
chatsRouter.patch(
  "/chats/:chatId/read",
  authMiddleware,
  chatMembershipMiddleware,
  markReadController
);
chatsRouter.post(
  "/chats/:chatId/summary",
  authMiddleware,
  chatMembershipMiddleware,
  summaryController
);

// ── Project chat shortcut ─────────────────────────────────────────────────
chatsRouter.get(
  "/projects/:projectId/chat",
  authMiddleware,
  membershipMiddleware,
  projectChatController
);
