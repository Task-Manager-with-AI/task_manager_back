import "dotenv/config";
import { createServer } from "http";
import { app } from "./app";
import { prisma } from "./prisma/client";
import { env } from "./config/env";
import { setupSignaling } from "./signaling/signaling.server";

async function bootstrap() {
  await prisma.$connect();
  console.log("✅ Database connected");

  const httpServer = createServer(app);
  setupSignaling(httpServer);

  httpServer.listen(env.BACKEND_PORT, () => {
    console.log(`🚀 Server running on http://localhost:${env.BACKEND_PORT}`);
    console.log(`📄 Swagger docs at http://localhost:${env.BACKEND_PORT}/api/docs`);
    console.log(`📡 Socket.IO signaling attached at /socket.io`);
  });
}

bootstrap().catch((err) => {
  console.error("Fatal error during startup:", err);
  process.exit(1);
});
