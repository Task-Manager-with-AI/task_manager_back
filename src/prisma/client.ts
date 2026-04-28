import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { __prisma: PrismaClient };

export const prisma =
  globalForPrisma.__prisma ?? new PrismaClient({ log: ["warn", "error"] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}
