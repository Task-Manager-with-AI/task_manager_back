import type { Sprint } from "@prisma/client";
import {
  findUserProjectIds,
  findDoneColumnIdsByProjects,
  countActiveProjects,
  countOpenTasks,
  countOverdueTasks,
  countMeetingsThisWeek,
  findProjectsWithStats,
  findActiveSprint,
  findSprintByIdForUser,
  findFirstActiveSprintAcrossProjects,
  groupTasksByColumn,
  groupTasksByPriority,
  findCompletedTasksForVelocity,
  findCalendarTasks,
  findCalendarMeetings,
  findCalendarSprintEnds,
} from "./dashboard.repository";
import type { CalendarQuery, OverviewQuery } from "./dashboard.schema";

type SprintTask = { id: string; storyPoints: number; completedAt: Date | null };

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}


function eachDay(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  const current = startOfDay(from);
  const end = startOfDay(to);
  while (current <= end) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return days;
}

function getWeekStart(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return endOfDay(end);
}

function taskWeight(task: SprintTask): number {
  return task.storyPoints ?? 1;
}

function buildBurndown(sprint: Sprint & { tasks: SprintTask[] }) {
  const tasks = sprint.tasks;
  const totalScope = tasks.reduce((s, t) => s + taskWeight(t), 0);
  const days = eachDay(sprint.startDate, sprint.endDate);
  const dayCount = days.length;
  const useStoryPoints = tasks.some((t) => t.storyPoints > 1);

  const ideal = days.map((day, index) => {
    const remaining =
      dayCount <= 1
        ? 0
        : Math.max(0, totalScope - (totalScope / (dayCount - 1)) * index);
    return { date: toDateString(day), remaining: Math.round(remaining * 10) / 10 };
  });

  const actual = days.map((day) => {
    const dayEnd = endOfDay(day);
    const remaining = tasks
      .filter((t) => !t.completedAt || t.completedAt > dayEnd)
      .reduce((s, t) => s + taskWeight(t), 0);
    return { date: toDateString(day), remaining };
  });

  return {
    sprint: {
      id: sprint.id,
      name: sprint.name,
      startDate: sprint.startDate.toISOString(),
      endDate: sprint.endDate.toISOString(),
    },
    unit: useStoryPoints ? ("storyPoints" as const) : ("tasks" as const),
    ideal,
    actual,
  };
}

function buildBurnup(sprint: Sprint & { tasks: SprintTask[] }) {
  const tasks = sprint.tasks;
  const totalScope = tasks.reduce((s, t) => s + taskWeight(t), 0);
  const days = eachDay(sprint.startDate, sprint.endDate);

  const scope = days.map((day) => ({
    date: toDateString(day),
    total: totalScope,
  }));

  const completed = days.map((day) => {
    const dayEnd = endOfDay(day);
    const done = tasks
      .filter((t) => t.completedAt && t.completedAt <= dayEnd)
      .reduce((s, t) => s + taskWeight(t), 0);
    return { date: toDateString(day), done };
  });

  return { scope, completed };
}

function buildWeeklyVelocity(
  completedTasks: { completedAt: Date | null }[],
  weeks: number
) {
  const now = new Date();
  const result: { weekLabel: string; completed: number }[] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const ref = new Date(now);
    ref.setDate(ref.getDate() - i * 7);
    const weekStart = getWeekStart(ref);
    const weekEnd = getWeekEnd(ref);

    const count = completedTasks.filter(
      (t) =>
        t.completedAt &&
        t.completedAt >= weekStart &&
        t.completedAt <= weekEnd
    ).length;

    const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`;
    result.push({ weekLabel: label, completed: count });
  }

  return result;
}

export async function getDashboardOverview(userId: string, query: OverviewQuery) {
  const projectIds = await findUserProjectIds(userId, query.projectId);
  const doneColumnMap = await findDoneColumnIdsByProjects(projectIds);
  const doneColumnIds = [...doneColumnMap.values()];

  const today = startOfDay(new Date());
  const weekStart = getWeekStart(today);
  const weekEnd = getWeekEnd(today);

  const [
    activeProjects,
    openTasks,
    overdueTasks,
    meetingsThisWeek,
    projects,
    tasksByColumn,
    tasksByPriority,
    completedTasks,
  ] = await Promise.all([
    countActiveProjects(projectIds),
    countOpenTasks(projectIds, doneColumnIds),
    countOverdueTasks(projectIds, doneColumnIds, today),
    countMeetingsThisWeek(projectIds, weekStart, weekEnd),
    findProjectsWithStats(projectIds, doneColumnMap),
    groupTasksByColumn(projectIds),
    groupTasksByPriority(projectIds),
    findCompletedTasksForVelocity(
      projectIds,
      new Date(today.getTime() - 6 * 7 * 24 * 60 * 60 * 1000)
    ),
  ]);

  let sprintForCharts = null;
  if (query.sprintId) {
    sprintForCharts = await findSprintByIdForUser(query.sprintId, projectIds);
  } else if (query.projectId) {
    sprintForCharts = await findActiveSprint(query.projectId);
  } else {
    sprintForCharts = await findFirstActiveSprintAcrossProjects(projectIds);
  }

  const burndown = sprintForCharts ? buildBurndown(sprintForCharts) : null;
  const burnup = sprintForCharts ? buildBurnup(sprintForCharts) : null;
  const weeklyVelocity = buildWeeklyVelocity(completedTasks, 5);

  return {
    kpis: {
      activeProjects,
      openTasks,
      overdueTasks,
      meetingsThisWeek,
    },
    projects,
    burndown,
    burnup,
    tasksByColumn,
    tasksByPriority,
    weeklyVelocity,
  };
}

export async function getDashboardCalendar(userId: string, query: CalendarQuery) {
  const projectIds = await findUserProjectIds(userId, query.projectId);
  const from = startOfDay(new Date(query.from));
  const to = endOfDay(new Date(query.to));

  const [tasks, meetings, sprints] = await Promise.all([
    findCalendarTasks(projectIds, from, to),
    findCalendarMeetings(projectIds, from, to),
    findCalendarSprintEnds(projectIds, from, to),
  ]);

  const events = [
    ...tasks.map((t) => ({
      id: t.id,
      type: "TASK_DUE" as const,
      title: t.title,
      date: toDateString(t.dueDate!),
      projectId: t.projectId,
      projectName: t.project.name,
      meta: { priority: t.priority },
    })),
    ...meetings.map((m) => ({
      id: m.id,
      type: "MEETING" as const,
      title: m.title,
      date: toDateString(m.scheduledAt!),
      datetime: m.scheduledAt!.toISOString(),
      projectId: m.projectId,
      projectName: m.project.name,
      meta: { meetingType: m.meetingType },
    })),
    ...sprints.map((s) => ({
      id: s.id,
      type: "SPRINT_END" as const,
      title: s.name,
      date: toDateString(s.endDate),
      projectId: s.projectId,
      projectName: s.project.name,
      meta: { sprintName: s.name },
    })),
  ];

  events.sort((a, b) => {
    const aTime = "datetime" in a && a.datetime ? a.datetime : a.date;
    const bTime = "datetime" in b && b.datetime ? b.datetime : b.date;
    return aTime.localeCompare(bTime);
  });

  return { events: events.slice(0, 50) };
}
