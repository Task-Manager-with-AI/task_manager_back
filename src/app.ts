import "dotenv/config";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { corsOptions } from "./config/cors";
import { setupSwagger } from "./config/swagger";
import { errorMiddleware } from "./middlewares/error.middleware";
import { authRouter } from "./modules/auth/auth.routes";
import { usersRouter } from "./modules/users/users.routes";
import { projectsRouter } from "./modules/projects/projects.routes";
import { tasksRouter } from "./modules/tasks/tasks.routes";

export const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(corsOptions);
app.use(morgan("dev"));
app.use(express.json());
app.use(cookieParser());

// Health check
app.get("/api/v1/health", (_req, res) => {
  res.json({ success: true, message: "OK", data: { status: "healthy" } });
});

// API routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/projects", projectsRouter);
app.use("/api/v1", tasksRouter);

// Swagger docs
setupSwagger(app);

// Global error handler — must be last
app.use(errorMiddleware);
