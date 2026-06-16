import { Router, type Router as ExpressRouter } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { membershipMiddleware } from "../../middlewares/membership.middleware";
import { AppError } from "../../shared/errors/AppError";
import {
  askController,
  listThreadsController,
  getThreadController,
  deleteThreadController,
  reindexController,
  indexStatusController,
  transcribeController,
} from "./copilot.controller";

export const copilotRouter: ExpressRouter = Router();

// Short voice clips for dictation (memory storage, 25MB — Groq Whisper limit).
const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^audio\//.test(file.mimetype) || file.mimetype === "video/webm") {
      cb(null, true);
    } else {
      cb(new AppError(`Unsupported audio type: ${file.mimetype}`, 400));
    }
  },
});

// LLM calls are costly — throttle the ask endpoint per IP.
const askLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: "Too many requests, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Project-scoped (membership-guarded) ────────────────────────────────────
copilotRouter.post(
  "/projects/:projectId/copilot/ask",
  authMiddleware,
  membershipMiddleware,
  askLimiter,
  askController
);
copilotRouter.get(
  "/projects/:projectId/copilot/threads",
  authMiddleware,
  membershipMiddleware,
  listThreadsController
);
copilotRouter.post(
  "/projects/:projectId/copilot/reindex",
  authMiddleware,
  membershipMiddleware,
  reindexController
);
copilotRouter.get(
  "/projects/:projectId/copilot/index-status",
  authMiddleware,
  membershipMiddleware,
  indexStatusController
);

// ── Voice dictation (auth only) ────────────────────────────────────────────
copilotRouter.post(
  "/copilot/transcribe",
  authMiddleware,
  audioUpload.single("audio"),
  transcribeController
);

// ── Thread-scoped (ownership enforced in the service by userId) ─────────────
copilotRouter.get("/copilot/threads/:threadId", authMiddleware, getThreadController);
copilotRouter.delete("/copilot/threads/:threadId", authMiddleware, deleteThreadController);
