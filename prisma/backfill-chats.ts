/**
 * Idempotent backfill: ensures every existing project has a PROJECT chat with
 * all of its active members as participants. Safe to run multiple times.
 *
 *   npx ts-node prisma/backfill-chats.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const projects = await prisma.project.findMany({
    select: {
      id: true,
      name: true,
      chat: { select: { id: true } },
      members: {
        where: { isActive: true },
        select: { userId: true },
      },
    },
  });

  let createdChats = 0;
  let addedParticipants = 0;

  for (const project of projects) {
    let chatId = project.chat?.id;
    if (!chatId) {
      const chat = await prisma.chat.create({
        data: { type: "PROJECT", projectId: project.id },
        select: { id: true },
      });
      chatId = chat.id;
      createdChats += 1;
    }

    for (const member of project.members) {
      const result = await prisma.chatParticipant.upsert({
        where: { chatId_userId: { chatId, userId: member.userId } },
        update: { isActive: true },
        create: { chatId, userId: member.userId },
      });
      if (result) addedParticipants += 1;
    }
    console.log(
      `✔ ${project.name}: chat ${chatId} (${project.members.length} members)`
    );
  }

  console.log(
    `\nDone. Created ${createdChats} chats, ensured ${addedParticipants} participants across ${projects.length} projects.`
  );
}

main()
  .catch((err) => {
    console.error("Backfill failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
