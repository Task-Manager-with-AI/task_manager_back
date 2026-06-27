import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SUPER_ADMIN_EMAIL = "fsociety.soporte@gmail.com";

async function main() {
  const superAdminRole = await prisma.role.upsert({
    where: { name: "SUPER_ADMIN" },
    update: {},
    create: { name: "SUPER_ADMIN" },
  });
  console.log(`Role SUPER_ADMIN: id=${superAdminRole.id}`);

  const user = await prisma.user.findUnique({
    where: { email: SUPER_ADMIN_EMAIL },
    select: { id: true, name: true, roleId: true },
  });

  if (!user) {
    console.error(
      `User ${SUPER_ADMIN_EMAIL} not found. Has the user signed in via Google yet?`
    );
    process.exit(1);
  }

  await prisma.user.update({
    where: { email: SUPER_ADMIN_EMAIL },
    data: { roleId: superAdminRole.id },
  });

  console.log(
    `✅ User ${SUPER_ADMIN_EMAIL} (id=${user.id}) upgraded to SUPER_ADMIN`
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
