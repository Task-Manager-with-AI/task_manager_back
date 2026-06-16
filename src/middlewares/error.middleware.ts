import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AppError } from "../shared/errors/AppError";
import { env } from "../config/env";

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors && { errors: err.errors }),
    });
  }

  if (err instanceof ZodError) {
    const errors: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".");
      errors[key] = errors[key] ?? [];
      errors[key].push(issue.message);
    }
    return res.status(400).json({
      success: false,
      message: "Validation error",
      errors,
    });
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        message: `File too large. Max size is ${env.DOCUMENT_ASSET_MAX_FILE_SIZE_MB}MB`,
        errors: {
          [err.field ?? "file"]: [
            `File exceeds ${env.DOCUMENT_ASSET_MAX_FILE_SIZE_MB}MB limit`,
          ],
        },
      });
    }

    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  console.error("Unhandled error:", err);

  res.status(500).json({
    success: false,
    message: "Internal server error",
    ...(env.NODE_ENV !== "production" && { stack: (err as Error).stack }),
  });
}
