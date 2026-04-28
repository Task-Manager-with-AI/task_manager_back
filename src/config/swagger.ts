import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";
import path from "path";
import { env } from "./env";

// In production the TS source is compiled to dist/, so we resolve paths from
// __dirname (dist/config or src/config) and match the correct extension.
const ext = env.NODE_ENV === "production" ? "js" : "ts";
const routesGlob = path.join(__dirname, `../modules/**/*.routes.${ext}`);

const serverUrl =
  env.NODE_ENV === "production"
    ? `${env.BACKEND_URL}/api/v1`
    : `http://localhost:${env.BACKEND_PORT}/api/v1`;

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Task Manager API",
      version: "1.0.0",
      description: "Agile Task Manager — Sprint 1 API",
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: env.COOKIE_NAME,
        },
      },
    },
  },
  apis: [routesGlob],
};

const swaggerSpec = swaggerJsdoc(options);

export function setupSwagger(app: Express) {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
}
