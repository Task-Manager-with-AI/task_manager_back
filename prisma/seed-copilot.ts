/**
 * Standalone runner for the RAG Copilot demo seed.
 *
 *   npm run seed:copilot
 */
import { PrismaClient, RoleName } from "@prisma/client";
import { seedCopilotDemo } from "./seeds/copilot-demo.seed";

const prisma = new PrismaClient();

async function main() {
  // Ensure base roles exist (no-op if already seeded).
  for (const name of [RoleName.ADMIN, RoleName.MEMBER, RoleName.GUEST]) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
  await seedCopilotDemo(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
