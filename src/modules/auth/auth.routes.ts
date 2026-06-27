import { Router, type Router as ExpressRouter } from "express";
import rateLimit from "express-rate-limit";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {
  registerController,
  loginController,
  logoutController,
  meController,
  realtimeTokenController,
  verifyEmailController,
  resendVerificationController,
  googleAuthController,
} from "./auth.controller";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: "Too many requests, try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const authRouter: ExpressRouter = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user (sends email verification code)
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
 *         description: Account created, verification email sent
 *       409:
 *         description: Email already in use
 */
authRouter.post("/register", authLimiter, registerController);

/**
 * @openapi
 * /auth/verify-email:
 *   post:
 *     tags: [Auth]
 *     summary: Verify email with the 6-digit code (sets session cookie)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, code]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               code:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 6
 *     responses:
 *       200:
 *         description: Email verified, session cookie set
 *       400:
 *         description: Invalid or expired code
 */
authRouter.post("/verify-email", authLimiter, verifyEmailController);

/**
 * @openapi
 * /auth/resend-verification:
 *   post:
 *     tags: [Auth]
 *     summary: Resend email verification code
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Verification code sent
 *       409:
 *         description: Email already verified
 */
authRouter.post("/resend-verification", authLimiter, resendVerificationController);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login with email + password and receive session cookie
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
 *       403:
 *         description: Email not verified
 */
authRouter.post("/login", authLimiter, loginController);

/**
 * @openapi
 * /auth/google:
 *   post:
 *     tags: [Auth]
 *     summary: Sign in with Google (Google Identity Services credential)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [credential]
 *             properties:
 *               credential:
 *                 type: string
 *                 description: Google ID token from GIS
 *     responses:
 *       200:
 *         description: Logged in, cookie set
 *       401:
 *         description: Invalid Google credential
 */
authRouter.post("/google", authLimiter, googleAuthController);

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

/**
 * @openapi
 * /auth/realtime-token:
 *   get:
 *     tags: [Auth]
 *     summary: Get JWT for WebSocket clients (collaboration, Socket.IO cross-origin)
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Session token for realtime connections
 *       401:
 *         description: Not authenticated
 */
authRouter.get("/realtime-token", authMiddleware, realtimeTokenController);
