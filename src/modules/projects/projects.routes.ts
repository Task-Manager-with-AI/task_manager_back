import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { membershipMiddleware } from "../../middlewares/membership.middleware";
import {
  listProjectsController,
  getProjectController,
  createProjectController,
  updateProjectController,
  deleteProjectController,
  addMemberController,
  getMembersController,
} from "./projects.controller";

export const projectsRouter = Router();

/**
 * @openapi
 * /projects:
 *   get:
 *     tags: [Projects]
 *     summary: List projects for authenticated user
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: List of projects
 */
projectsRouter.get("/", authMiddleware, listProjectsController);

/**
 * @openapi
 * /projects:
 *   post:
 *     tags: [Projects]
 *     summary: Create a new project
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Project created
 */
projectsRouter.post("/", authMiddleware, createProjectController);

/**
 * @openapi
 * /projects/{id}:
 *   get:
 *     tags: [Projects]
 *     summary: Get project by ID
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project data
 *       403:
 *         description: Not a member
 */
projectsRouter.get("/:id", authMiddleware, membershipMiddleware, getProjectController);

/**
 * @openapi
 * /projects/{id}:
 *   patch:
 *     tags: [Projects]
 *     summary: Update project
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Updated project
 */
projectsRouter.patch("/:id", authMiddleware, membershipMiddleware, updateProjectController);

/**
 * @openapi
 * /projects/{id}:
 *   delete:
 *     tags: [Projects]
 *     summary: Soft delete a project
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Project deleted
 */
projectsRouter.delete("/:id", authMiddleware, membershipMiddleware, deleteProjectController);

/**
 * @openapi
 * /projects/{id}/members:
 *   post:
 *     tags: [Projects]
 *     summary: Add a member to the project
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *               memberRole:
 *                 type: string
 *                 enum: [ADMIN, MEMBER, GUEST]
 *     responses:
 *       201:
 *         description: Member added
 *       409:
 *         description: User already a member
 */
projectsRouter.post("/:id/members", authMiddleware, membershipMiddleware, addMemberController);

/**
 * @openapi
 * /projects/{id}/members:
 *   get:
 *     tags: [Projects]
 *     summary: Get project members
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of members
 */
projectsRouter.get("/:id/members", authMiddleware, membershipMiddleware, getMembersController);
