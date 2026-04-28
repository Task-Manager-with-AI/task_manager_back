import "dotenv/config";
import { app } from "./app";
import { prisma } from "./prisma/client";
import { env } from "./config/env";

async function bootstrap() {
  await prisma.$connect();
  console.log("✅ Database connected");

  app.listen(env.BACKEND_PORT, () => {
    console.log(`🚀 Server running on http://localhost:${env.BACKEND_PORT}`);
    console.log(`📄 Swagger docs at http://localhost:${env.BACKEND_PORT}/api/docs`);
  });
}

bootstrap().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
