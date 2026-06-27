import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const superAdmin = await prisma.user.findFirst({
    where: { role: { name: "SUPER_ADMIN" } },
    select: { id: true },
  });

  if (!superAdmin) {
    console.log("No SUPER_ADMIN found. Skipping.");
    return;
  }

  const users = await prisma.user.findMany({
    where: { id: { not: superAdmin.id }, isActive: true },
    select: { id: true },
  });

  let created = 0;
  for (const user of users) {
    const existing = await prisma.chat.findFirst({
      where: {
        type: "DIRECT",
        AND: [
          { participants: { some: { userId: user.id, isActive: true } } },
          { participants: { some: { userId: superAdmin.id, isActive: true } } },
        ],
      },
    });
    if (existing) continue;

    await prisma.chat.create({
      data: {
        type: "DIRECT",
        participants: {
          create: [{ userId: user.id }, { userId: superAdmin.id }],
        },
      },
    });
    created++;
  }

  console.log(`Backfill complete: ${created} support chats created.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
