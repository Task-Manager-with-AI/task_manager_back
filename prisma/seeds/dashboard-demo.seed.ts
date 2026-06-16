import {
  PrismaClient,
  RoleName,
  TaskPriority,
  SprintStatus,
  MeetingType,
  MeetingStatus,
} from "@prisma/client";
import * as argon2 from "argon2";

const DEMO_PROJECT_NAMES = [
  "E-commerce MVP",
  "App Móvil FitTrack",
  "Portal Interno RRHH",
];

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addHours(date: Date, hours: number): Date {
  const d = new Date(date);
  d.setHours(d.getHours() + hours);
  return d;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(9, 0, 0, 0);
  return d;
}

async function cleanupDemoData(prisma: PrismaClient, alexId: string) {
  const demoProjects = await prisma.project.findMany({
    where: {
      name: { in: DEMO_PROJECT_NAMES },
      members: { some: { userId: alexId } },
    },
    select: { id: true },
  });

  const projectIds = demoProjects.map((p) => p.id);
  if (projectIds.length === 0) return;

  await prisma.task.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.sprint.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.meeting.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.kanbanColumn.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
}

async function createKanbanColumns(
  prisma: PrismaClient,
  projectId: string
) {
  const titles = ["Pending", "In Progress", "Done"];
  const colors = ["slate", "blue", "emerald"];
  const columns: { id: string; title: string; position: number }[] = [];

  for (let i = 0; i < titles.length; i++) {
    const col = await prisma.kanbanColumn.create({
      data: {
        projectId,
        title: titles[i]!,
        position: i,
        color: colors[i],
      },
    });
    columns.push({ id: col.id, title: col.title, position: col.position });
  }

  return columns;
}

export async function seedDashboardDemo(prisma: PrismaClient) {
  const memberRole = await prisma.role.findUniqueOrThrow({
    where: { name: RoleName.MEMBER },
  });

  const users = [
    { email: "alex@example.com", name: "Alex", password: "string123" },
    { email: "maria@example.com", name: "María", password: "string123" },
    { email: "carlos@example.com", name: "Carlos", password: "string123" },
  ];

  const userRecords: Record<string, { id: string; email: string }> = {};

  for (const u of users) {
    const passwordHash = await argon2.hash(u.password);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, passwordHash },
      create: {
        email: u.email,
        name: u.name,
        passwordHash,
        roleId: memberRole.id,
      },
    });
    userRecords[u.email] = { id: user.id, email: user.email };
  }

  const alex = userRecords["alex@example.com"]!;
  const maria = userRecords["maria@example.com"]!;
  const carlos = userRecords["carlos@example.com"]!;

  await cleanupDemoData(prisma, alex.id);

  const now = new Date();

  // ── Project 1: E-commerce MVP ──
  const ecommerce = await prisma.project.create({
    data: {
      name: "E-commerce MVP",
      description: "Tienda en línea con checkout y catálogo de productos",
      status: "ACTIVE",
      createdById: alex.id,
      members: {
        create: [
          { userId: alex.id, memberRole: "MEMBER" },
          { userId: maria.id, memberRole: "MEMBER" },
          { userId: carlos.id, memberRole: "MEMBER" },
        ],
      },
    },
  });

  const ecoCols = await createKanbanColumns(prisma, ecommerce.id);
  const ecoPending = ecoCols[0]!;
  const ecoProgress = ecoCols[1]!;
  const ecoDone = ecoCols[2]!;

  const ecoSprintStart = addDays(now, -8);
  const ecoSprintEnd = addDays(now, 6);

  await prisma.sprint.create({
    data: {
      projectId: ecommerce.id,
      name: "Sprint 1",
      goal: "Setup inicial",
      startDate: addDays(ecoSprintStart, -14),
      endDate: addDays(ecoSprintStart, -1),
      status: SprintStatus.COMPLETED,
    },
  });

  const ecoSprint2 = await prisma.sprint.create({
    data: {
      projectId: ecommerce.id,
      name: "Sprint 2",
      goal: "Checkout y pagos",
      startDate: ecoSprintStart,
      endDate: ecoSprintEnd,
      status: SprintStatus.ACTIVE,
    },
  });

  const ecoTasks: {
    title: string;
    column: typeof ecoPending;
    priority: TaskPriority;
    storyPoints: number;
    dueDate?: Date;
    completedAt?: Date;
  }[] = [
    { title: "Diseñar wireframes checkout", column: ecoDone, priority: "HIGH", storyPoints: 2, completedAt: addDays(now, -7) },
    { title: "Integrar pasarela Stripe", column: ecoDone, priority: "HIGH", storyPoints: 3, completedAt: addDays(now, -6) },
    { title: "Validación de tarjetas", column: ecoDone, priority: "MEDIUM", storyPoints: 2, completedAt: addDays(now, -5) },
    { title: "Carrito persistente", column: ecoDone, priority: "MEDIUM", storyPoints: 1, completedAt: addDays(now, -4) },
    { title: "Emails de confirmación", column: ecoDone, priority: "LOW", storyPoints: 1, completedAt: addDays(now, -3) },
    { title: "Tests E2E checkout", column: ecoDone, priority: "HIGH", storyPoints: 2, completedAt: addDays(now, -2) },
    { title: "Optimizar imágenes catálogo", column: ecoProgress, priority: "MEDIUM", storyPoints: 1 },
    { title: "Filtros de búsqueda", column: ecoProgress, priority: "MEDIUM", storyPoints: 2 },
    { title: "Paginación productos", column: ecoProgress, priority: "LOW", storyPoints: 1 },
    { title: "Reviews de productos", column: ecoProgress, priority: "LOW", storyPoints: 2 },
    { title: "Wishlist", column: ecoPending, priority: "LOW", storyPoints: 1, dueDate: addDays(now, 2) },
    { title: "Cupones de descuento", column: ecoPending, priority: "HIGH", storyPoints: 2, dueDate: addDays(now, 4) },
    { title: "Historial de pedidos", column: ecoPending, priority: "MEDIUM", storyPoints: 1 },
    { title: "Notificaciones push", column: ecoPending, priority: "MEDIUM", storyPoints: 2 },
    { title: "Dashboard admin ventas", column: ecoProgress, priority: "HIGH", storyPoints: 3 },
    { title: "Export CSV pedidos", column: ecoDone, priority: "LOW", storyPoints: 1, completedAt: addDays(now, -1) },
    { title: "Multi-moneda", column: ecoPending, priority: "HIGH", storyPoints: 2 },
    { title: "SEO meta tags", column: ecoDone, priority: "MEDIUM", storyPoints: 1, completedAt: addDays(now, -1) },
  ];

  for (const t of ecoTasks) {
    await prisma.task.create({
      data: {
        title: t.title,
        priority: t.priority,
        storyPoints: t.storyPoints,
        columnId: t.column.id,
        projectId: ecommerce.id,
        sprintId: ecoSprint2.id,
        createdById: alex.id,
        responsibleId: maria.id,
        dueDate: t.dueDate,
        completedAt: t.completedAt,
      },
    });
  }

  await prisma.meeting.createMany({
    data: [
      {
        title: "Daily Scrum",
        projectId: ecommerce.id,
        createdById: alex.id,
        meetingType: MeetingType.DAILY,
        status: MeetingStatus.SCHEDULED,
        scheduledAt: addHours(startOfDay(addDays(now, 3)), 9),
      },
      {
        title: "Daily Scrum",
        projectId: ecommerce.id,
        createdById: alex.id,
        meetingType: MeetingType.DAILY,
        status: MeetingStatus.SCHEDULED,
        scheduledAt: addHours(startOfDay(addDays(now, 1)), 9),
      },
      {
        title: "Daily Scrum",
        projectId: ecommerce.id,
        createdById: alex.id,
        meetingType: MeetingType.DAILY,
        status: MeetingStatus.SCHEDULED,
        scheduledAt: addHours(startOfDay(addDays(now, -2)), 9),
      },
      {
        title: "Sprint Review",
        projectId: ecommerce.id,
        createdById: alex.id,
        meetingType: MeetingType.REGULAR,
        status: MeetingStatus.SCHEDULED,
        scheduledAt: addHours(startOfDay(addDays(now, 5)), 15),
      },
    ],
  });

  // ── Project 2: App Móvil FitTrack ──
  const fittrack = await prisma.project.create({
    data: {
      name: "App Móvil FitTrack",
      description: "App de fitness con seguimiento de rutinas y nutrición",
      status: "ACTIVE",
      createdById: maria.id,
      members: {
        create: [
          { userId: alex.id, memberRole: "MEMBER" },
          { userId: maria.id, memberRole: "MEMBER" },
        ],
      },
    },
  });

  const fitCols = await createKanbanColumns(prisma, fittrack.id);
  const fitPending = fitCols[0]!;
  const fitProgress = fitCols[1]!;
  const fitDone = fitCols[2]!;

  const fitSprintStart = addDays(now, -4);
  const fitSprintEnd = addDays(now, 6);

  const fitSprint = await prisma.sprint.create({
    data: {
      projectId: fittrack.id,
      name: "Sprint 1",
      goal: "MVP tracking de ejercicios",
      startDate: fitSprintStart,
      endDate: fitSprintEnd,
      status: SprintStatus.ACTIVE,
    },
  });

  const fitTasks = [
    { title: "Onboarding usuario", column: fitDone, priority: "HIGH" as TaskPriority, sp: 2, completedAt: addDays(now, -3) },
    { title: "Catálogo de ejercicios", column: fitDone, priority: "MEDIUM" as TaskPriority, sp: 2, completedAt: addDays(now, -2) },
    { title: "Timer de series", column: fitProgress, priority: "HIGH" as TaskPriority, sp: 3 },
    { title: "Gráficos de progreso", column: fitProgress, priority: "MEDIUM" as TaskPriority, sp: 2 },
    { title: "Registro de peso", column: fitProgress, priority: "LOW" as TaskPriority, sp: 1 },
    { title: "Plan nutricional", column: fitPending, priority: "MEDIUM" as TaskPriority, sp: 2, dueDate: addDays(now, 5) },
    { title: "Integración HealthKit", column: fitPending, priority: "HIGH" as TaskPriority, sp: 3, dueDate: addDays(now, 5) },
    { title: "Modo offline", column: fitPending, priority: "MEDIUM" as TaskPriority, sp: 2 },
    { title: "Push recordatorios", column: fitDone, priority: "LOW" as TaskPriority, sp: 1, completedAt: addDays(now, -14) },
    { title: "Perfil de usuario", column: fitDone, priority: "MEDIUM" as TaskPriority, sp: 1, completedAt: addDays(now, -21) },
    { title: "Sync con wearables", column: fitPending, priority: "HIGH" as TaskPriority, sp: 2, dueDate: addDays(now, -1) },
    { title: "Export PDF rutina", column: fitPending, priority: "LOW" as TaskPriority, sp: 1, dueDate: addDays(now, -1) },
  ];

  for (const t of fitTasks) {
    await prisma.task.create({
      data: {
        title: t.title,
        priority: t.priority,
        storyPoints: t.sp,
        columnId: t.column.id,
        projectId: fittrack.id,
        sprintId: fitSprint.id,
        createdById: maria.id,
        responsibleId: alex.id,
        dueDate: t.dueDate,
        completedAt: t.completedAt,
      },
    });
  }

  await prisma.meeting.create({
    data: {
      title: "Sprint Planning",
      projectId: fittrack.id,
      createdById: maria.id,
      meetingType: MeetingType.SPRINT_PLANNING,
      status: MeetingStatus.SCHEDULED,
      scheduledAt: addHours(startOfDay(addDays(now, 10)), 10),
    },
  });

  // ── Project 3: Portal Interno RRHH ──
  const rrhh = await prisma.project.create({
    data: {
      name: "Portal Interno RRHH",
      description: "Portal de recursos humanos para empleados",
      status: "ACTIVE",
      createdById: carlos.id,
      members: {
        create: [
          { userId: alex.id, memberRole: "MEMBER" },
          { userId: carlos.id, memberRole: "MEMBER" },
        ],
      },
    },
  });

  const rrhhCols = await createKanbanColumns(prisma, rrhh.id);
  const rrhhDone = rrhhCols[2]!;

  await prisma.sprint.create({
    data: {
      projectId: rrhh.id,
      name: "Sprint 1",
      goal: "Portal básico",
      startDate: addDays(now, -30),
      endDate: addDays(now, -16),
      status: SprintStatus.COMPLETED,
    },
  });

  const rrhhTasks = [
    "Solicitud de vacaciones",
    "Directorio empleados",
    "Políticas internas",
    "Formulario onboarding",
    "Calendario feriados",
    "Boletín mensual",
    "Encuestas clima laboral",
    "Gestión de permisos",
  ];

  for (const title of rrhhTasks) {
    await prisma.task.create({
      data: {
        title,
        priority: TaskPriority.MEDIUM,
        storyPoints: 1,
        columnId: rrhhDone.id,
        projectId: rrhh.id,
        createdById: carlos.id,
        responsibleId: alex.id,
        completedAt: addDays(now, -20),
      },
    });
  }

  await prisma.meeting.create({
    data: {
      title: "Revisión trimestral RRHH",
      projectId: rrhh.id,
      createdById: carlos.id,
      meetingType: MeetingType.REGULAR,
      status: MeetingStatus.SCHEDULED,
      scheduledAt: addHours(startOfDay(addDays(now, 14)), 11),
    },
  });

  // Extra completed tasks for weekly velocity (spread across last 5 weeks)
  const velocityTasks = [
    { daysAgo: 35, projectId: fittrack.id, column: fitDone },
    { daysAgo: 28, projectId: ecommerce.id, column: ecoDone },
    { daysAgo: 21, projectId: fittrack.id, column: fitDone },
    { daysAgo: 14, projectId: ecommerce.id, column: ecoDone },
    { daysAgo: 7, projectId: fittrack.id, column: fitDone },
  ];

  for (const v of velocityTasks) {
    await prisma.task.create({
      data: {
        title: `Tarea completada hace ${v.daysAgo}d`,
        priority: TaskPriority.LOW,
        storyPoints: 1,
        columnId: v.column.id,
        projectId: v.projectId,
        createdById: alex.id,
        completedAt: addDays(now, -v.daysAgo),
      },
    });
  }

  console.log("Dashboard demo seed complete:");
  console.log("  Users: alex@example.com / alex, maria@example.com / maria123");
  console.log("  Projects: 3 demo projects with sprints, tasks, and meetings");
}
