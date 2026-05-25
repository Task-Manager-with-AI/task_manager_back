import "dotenv/config";
import express, { type Express } from "express";
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
import { meetingsRouter } from "./modules/meetings/meetings.routes";
import { minutesRouter } from "./modules/minutes/minutes.routes";
import { suggestionsRouter } from "./modules/suggestions/suggestions.routes";
import { documentsRouter } from "./modules/documents/documents.routes";
import path from "path";
import { env } from "./config/env";

export const app: Express = express();

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
app.use("/api/v1", meetingsRouter);
app.use("/api/v1", minutesRouter);
app.use("/api/v1", suggestionsRouter);
app.use("/api/v1", documentsRouter);

// Static audio uploads (only for development; behind auth in real prod)
app.use(
  "/uploads/audio",
  express.static(path.resolve(env.AUDIO_UPLOAD_DIR))
);

// Swagger docs
setupSwagger(app);

// Global error handler — must be last
app.use(errorMiddleware);
