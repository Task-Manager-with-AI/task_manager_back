import { PrismaClient } from "@prisma/client";
import { env } from "../config/env";

const globalForPrisma = globalThis as unknown as { __prisma: PrismaClient };

/** Append Prisma pool params for Supabase/PgBouncer (avoids EMAXCONNSESSION). */
function resolveDatabaseUrl(rawUrl: string): string {
  const limit = String(env.DATABASE_CONNECTION_LIMIT);
  let url = rawUrl;
  const sep = () => (url.includes("?") ? "&" : "?");

  if (!url.includes("connection_limit=")) {
    url += `${sep()}connection_limit=${limit}`;
  }
  // Transaction pooler (port 6543) requires pgbouncer=true for Prisma.
  if (url.includes(":6543/") && !url.includes("pgbouncer=")) {
    url += `${sep()}pgbouncer=true`;
  }
  return url;
}

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: ["warn", "error"],
    datasources: {
      db: { url: resolveDatabaseUrl(process.env.DATABASE_URL ?? "") },
    },
  });

globalForPrisma.__prisma = prisma;
