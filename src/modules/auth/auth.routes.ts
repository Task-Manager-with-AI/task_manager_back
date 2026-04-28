import { Router } from "express";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {
  registerController,
  loginController,
  logoutController,
  meController,
} from "./auth.controller";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many requests, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRouter = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 2
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       201:
 *         description: Account created
 *       409:
 *         description: Email already in use
 */
authRouter.post("/register", authLimiter, registerController);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login and receive session cookie
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logged in, cookie set
 *       401:
 *         description: Invalid credentials
 */
authRouter.post("/login", authLimiter, loginController);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout and clear session cookie
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 */
authRouter.post("/logout", authMiddleware, logoutController);

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Get current authenticated user
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Current user data
 *       401:
 *         description: Not authenticated
 */
authRouter.get("/me", authMiddleware, meController);
