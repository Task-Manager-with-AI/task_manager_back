import { PrismaClient, RoleName } from "@prisma/client";
import { seedDashboardDemo } from "./seeds/dashboard-demo.seed";

const prisma = new PrismaClient();

async function main() {
  const roles: RoleName[] = [RoleName.ADMIN, RoleName.MEMBER, RoleName.GUEST];

  for (const name of roles) {
    await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  console.log("Seed complete: 3 roles created.");

  await seedDashboardDemo(prisma);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
