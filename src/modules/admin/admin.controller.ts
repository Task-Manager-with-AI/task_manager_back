import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { sendSuccess } from "../../shared/utils/response";
import * as svc from "./admin.service";
import * as repo from "./admin.repository";

const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  role: z.string().optional(),
  isActive: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
  sortBy: z.enum(["createdAt", "name", "email"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

const patchUserBodySchema = z.object({
  isActive: z.boolean().optional(),
  roleId: z.number().int().positive().optional(),
});

const listFeedbackQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  from: z.string().optional().transform((v) => (v ? new Date(v) : undefined)),
  to: z.string().optional().transform((v) => (v ? new Date(v) : undefined)),
  sortBy: z.enum(["createdAt", "rating"]).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export async function metricsController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getMetrics();
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function listUsersController(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listUsersQuerySchema.parse(req.query);
    const data = await svc.listUsers(query);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function patchUserController(req: Request, res: Response, next: NextFunction) {
  try {
    const body = patchUserBodySchema.parse(req.body);
    const data = await svc.patchUser(req.params["id"] as string, body, req.user!.id);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function listFeedbackController(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listFeedbackQuerySchema.parse(req.query);
    const data = await svc.listFeedback(query);
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function rolesController(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await repo.findAllRoles();
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}

export async function feedbackStatsController(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await svc.getFeedbackStats();
    sendSuccess(res, data);
  } catch (err) {
    next(err);
  }
}
