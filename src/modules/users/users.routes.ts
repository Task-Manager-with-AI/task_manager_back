import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {
  getMeController,
  updateMeController,
  listUsersController,
} from "./users.controller";

export const usersRouter = Router();

/**
 * @openapi
 * /users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get current user profile
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: User profile
 */
usersRouter.get("/me", authMiddleware, getMeController);

/**
 * @openapi
 * /users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Update current user profile
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated profile
 */
usersRouter.patch("/me", authMiddleware, updateMeController);

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [Users]
 *     summary: List all active users (for task assignment)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of users
 */
usersRouter.get("/", authMiddleware, listUsersController);
