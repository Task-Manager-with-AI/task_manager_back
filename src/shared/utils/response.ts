import { Response } from "express";

export function sendSuccess<T>(
  res: Response,
  data: T,
  message = "Success",
  statusCode = 200
) {
  res.status(statusCode).json({ success: true, message, data });
}

export function sendCreated<T>(res: Response, data: T, message = "Created") {
  res.status(201).json({ success: true, message, data });
}
