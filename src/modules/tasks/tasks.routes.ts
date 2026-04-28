import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { membershipMiddleware } from "../../middlewares/membership.middleware";
import {
  listTasksController,
  getTaskController,
  createTaskController,
  updateTaskController,
  updateStatusController,
  deleteTaskController,
} from "./tasks.controller";

export const tasksRouter = Router();

/**
 * @openapi
 * /projects/{projectId}/tasks:
 *   get:
 *     tags: [Tasks]
 *     summary: List tasks for a project
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of tasks
 */
tasksRouter.get(
  "/projects/:projectId/tasks",
  authMiddleware,
  membershipMiddleware,
  listTasksController
);

/**
 * @openapi
 * /projects/{projectId}/tasks:
 *   post:
 *     tags: [Tasks]
 *     summary: Create a task in a project
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               priority:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH]
 *               responsibleId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       201:
 *         description: Task created
 */
tasksRouter.post(
  "/projects/:projectId/tasks",
  authMiddleware,
  membershipMiddleware,
  createTaskController
);

/**
 * @openapi
 * /tasks/{id}:
 *   get:
 *     tags: [Tasks]
 *     summary: Get task by ID
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
 *         description: Task data
 *       404:
 *         description: Task not found or access denied
 */
tasksRouter.get("/tasks/:id", authMiddleware, getTaskController);

/**
 * @openapi
 * /tasks/{id}:
 *   patch:
 *     tags: [Tasks]
 *     summary: Update task fields
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
 *         description: Updated task
 */
tasksRouter.patch("/tasks/:id", authMiddleware, updateTaskController);

/**
 * @openapi
 * /tasks/{id}/status:
 *   patch:
 *     tags: [Tasks]
 *     summary: Update task status only
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
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, IN_PROGRESS, DONE]
 *     responses:
 *       200:
 *         description: Status updated
 */
tasksRouter.patch("/tasks/:id/status", authMiddleware, updateStatusController);

/**
 * @openapi
 * /tasks/{id}:
 *   delete:
 *     tags: [Tasks]
 *     summary: Delete a task
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
 *         description: Task deleted
 */
tasksRouter.delete("/tasks/:id", authMiddleware, deleteTaskController);
