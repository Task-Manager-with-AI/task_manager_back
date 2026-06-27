import { prisma } from "../../prisma/client";

export async function getPlatformMetrics() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    activeUsers,
    newLast7Days,
    newLast30Days,
    googleUsers,
    totalProjects,
    activeProjects,
    totalTasks,
    completedTasks,
    totalMeetings,
    meetingsWithMinutes,
    totalDocuments,
    totalMessages,
    directChats,
    feedbackAgg,
    registrationsByDay,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.user.count({ where: { createdAt: { gte: sevenDaysAgo } } }),
    prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
    prisma.user.count({ where: { googleId: { not: null } } }),
    prisma.project.count(),
    prisma.project.count({ where: { status: "ACTIVE" } }),
    prisma.task.count(),
    prisma.task.count({ where: { completedAt: { not: null } } }),
    prisma.meeting.count(),
    prisma.meeting.count({ where: { minute: { isNot: null } } }),
    prisma.document.count({ where: { deletedAt: null } }),
    prisma.message.count({ where: { deletedAt: null } }),
    prisma.chat.count({ where: { type: "DIRECT" } }),
    prisma.appFeedback.aggregate({ _count: true, _avg: { rating: true } }),
    prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("createdAt")::text AS date, COUNT(*)::bigint AS count
      FROM "User"
      WHERE "createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
  ]);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      newLast7Days,
      newLast30Days,
      byProvider: { email: totalUsers - googleUsers, google: googleUsers },
    },
    projects: { total: totalProjects, active: activeProjects },
    tasks: { total: totalTasks, completed: completedTasks },
    meetings: { total: totalMeetings, withMinutes: meetingsWithMinutes },
    documents: { total: totalDocuments },
    chats: { totalMessages, directChats },
    feedback: {
      count: feedbackAgg._count,
      averageRating: feedbackAgg._avg.rating ?? 0,
    },
    registrationsByDay: registrationsByDay.map((r) => ({
      date: r.date,
      count: Number(r.count),
    })),
  };
}

export async function findAllUsers(params: {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  isActive?: boolean;
  sortBy?: string;
  order?: "asc" | "desc";
}) {
  const { page, limit, search, role, isActive, sortBy = "createdAt", order = "desc" } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }
  if (role) where.role = { name: role };
  if (isActive !== undefined) where.isActive = isActive;

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: order },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        emailVerified: true,
        googleId: true,
        createdAt: true,
        role: { select: { id: true, name: true } },
        _count: { select: { memberships: true, tasksOwned: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users: users.map(({ googleId, ...u }) => ({ ...u, hasGoogle: googleId !== null })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, roleId: true, isActive: true, role: { select: { name: true } } },
  });
}

export async function updateUser(id: string, data: { isActive?: boolean; roleId?: number }) {
  return prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      roleId: true,
      role: { select: { name: true } },
    },
  });
}

export async function findAllFeedback(params: {
  page: number;
  limit: number;
  rating?: number;
  from?: Date;
  to?: Date;
  sortBy?: string;
  order?: "asc" | "desc";
}) {
  const { page, limit, rating, from, to, sortBy = "createdAt", order = "desc" } = params;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (rating) where.rating = rating;
  if (from || to) {
    const createdAt: Record<string, Date> = {};
    if (from) createdAt.gte = from;
    if (to) createdAt.lte = to;
    where.createdAt = createdAt;
  }

  const [feedback, total] = await Promise.all([
    prisma.appFeedback.findMany({
      where,
      skip,
      take: limit,
      orderBy: { [sortBy]: order },
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.appFeedback.count({ where }),
  ]);

  return { feedback, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function findAllRoles() {
  return prisma.role.findMany({
    where: { name: { not: "SUPER_ADMIN" } },
    orderBy: { id: "asc" },
    select: { id: true, name: true },
  });
}

export async function getFeedbackStats() {
  const [aggregate, distribution, byDay] = await Promise.all([
    prisma.appFeedback.aggregate({ _count: true, _avg: { rating: true } }),
    prisma.appFeedback.groupBy({ by: ["rating"], _count: true }),
    prisma.$queryRaw<Array<{ date: string; average: number; count: bigint }>>`
      SELECT
        DATE("createdAt")::text AS date,
        AVG(rating)::float       AS average,
        COUNT(*)::bigint         AS count
      FROM "AppFeedback"
      WHERE "createdAt" >= NOW() - INTERVAL '30 days'
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `,
  ]);

  const dist: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  for (const d of distribution) dist[String(d.rating)] = d._count;

  return {
    count: aggregate._count,
    average: aggregate._avg.rating ?? 0,
    distribution: dist,
    byDay: byDay.map((d) => ({
      date: d.date,
      average: Number(d.average),
      count: Number(d.count),
    })),
  };
}
