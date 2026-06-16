import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../shared/utils/response";
import { AppError } from "../../shared/errors/AppError";
import { askSchema } from "./copilot.schema";
import * as service from "./copilot.service";
import type { CopilotEvent } from "./copilot.service";
import { indexStatus } from "./indexing/knowledge.repository";
import { reindexProject } from "./indexing/indexing.service";
import { transcribeAudio } from "../../services/ai-client.service";

/**
 * POST /projects/:projectId/copilot/ask — streams the agent's work as SSE.
 * Events: thread, status, tool, message, error, done.
 */
export async function askController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  let dto;
  try {
    dto = askSchema.parse(req.body);
  } catch (err) {
    return next(err);
  }

  const projectId = req.params["projectId"] as string;
  const userId = req.user!.id;

  // Set up the SSE stream.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event: CopilotEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  try {
    await service.ask({
      projectId,
      userId,
      question: dto.question,
      threadId: dto.threadId,
      onEvent: send,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    send({ type: "error", message });
    send({ type: "done" });
  } finally {
    res.end();
  }
}

export async function listThreadsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const threads = await service.listThreads(
      req.params["projectId"] as string,
      req.user!.id
    );
    sendSuccess(res, threads);
  } catch (err) {
    next(err);
  }
}

export async function getThreadController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await service.getThread(
      req.params["threadId"] as string,
      req.user!.id
    );
    sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function deleteThreadController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const result = await service.deleteThread(
      req.params["threadId"] as string,
      req.user!.id
    );
    sendSuccess(res, result, "Conversation deleted");
  } catch (err) {
    next(err);
  }
}

export async function reindexController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const jobs = await reindexProject(req.params["projectId"] as string);
    sendSuccess(res, { enqueuedJobs: jobs }, "Reindexing enqueued");
  } catch (err) {
    next(err);
  }
}

export async function indexStatusController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const status = await indexStatus(req.params["projectId"] as string);
    sendSuccess(res, status);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /copilot/transcribe — voice dictation. Accepts a short audio clip and
 * returns its transcript via the AI backend (Whisper). Used by the composer's
 * microphone button as a reliable alternative to the browser Speech API.
 */
export async function transcribeController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.file) {
      throw new AppError("No audio provided (field name 'audio')", 400);
    }
    const fileName = req.file.originalname || "dictation.webm";
    const result = await transcribeAudio(
      req.file.buffer,
      fileName,
      req.file.mimetype || "audio/webm",
      "es"
    );
    sendSuccess(res, { transcript: result.transcript });
  } catch (err) {
    next(err);
  }
}
