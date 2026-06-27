import { prisma } from "../../prisma/client";

export async function countTodayFeedback(userId: string): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return prisma.appFeedback.count({
    where: { userId, createdAt: { gte: startOfDay } },
  });
}

export async function createFeedback(data: {
  userId: string;
  rating: number;
  comment?: string;
  page?: string;
}) {
  return prisma.appFeedback.create({ data });
}

export async function findMyFeedback(userId: string) {
  return prisma.appFeedback.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}
