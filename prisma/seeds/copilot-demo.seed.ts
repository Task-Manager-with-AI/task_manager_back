/**
 * Rich, idempotent seed for end-to-end testing of the RAG Copilot.
 *
 * Creates the user `alex@example.com` and a single project ("InsightHub")
 * populated with content across EVERY knowledge source type the agent can
 * retrieve from: documents (with plain-text versions), meetings + minutes +
 * agreements + transcripts, tasks across Kanban columns (incl. BLOCKED), an
 * active sprint, and a project group chat with realistic messages.
 *
 * It then enqueues indexing jobs for every created source, so the running
 * backend worker embeds them automatically (requires the AI backend up with
 * EMBEDDING_PROVIDER=local). Safe to run multiple times.
 *
 *   npm run seed:copilot
 */
import {
  PrismaClient,
  RoleName,
  TaskPriority,
  SprintStatus,
  MeetingType,
  MeetingStatus,
  DocumentPermissionRole,
  type KnowledgeSourceType,
} from "@prisma/client";
import * as argon2 from "argon2";
import { createYjsStateFromPlainText } from "../../src/collaboration/prosemirror-plain-text";

const PROJECT_NAME = "InsightHub – Plataforma de Analítica";

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function at(date: Date, hour: number): Date {
  const d = new Date(date);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export async function seedCopilotDemo(prisma: PrismaClient) {
  const memberRole = await prisma.role.findUniqueOrThrow({
    where: { name: RoleName.MEMBER },
  });

  // ── Users ────────────────────────────────────────────────────────────────
  const userDefs = [
    { email: "alex@example.com", name: "Alex", password: "string123" },
    { email: "maria@example.com", name: "María", password: "string123" },
    { email: "carlos@example.com", name: "Carlos", password: "string123" },
  ];
  const users: Record<string, { id: string }> = {};
  for (const u of userDefs) {
    const passwordHash = await argon2.hash(u.password);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, passwordHash },
      create: { email: u.email, name: u.name, passwordHash, roleId: memberRole.id },
    });
    users[u.email] = { id: user.id };
  }
  const alex = users["alex@example.com"]!;
  const maria = users["maria@example.com"]!;
  const carlos = users["carlos@example.com"]!;

  // ── Idempotency: wipe any previous run of this demo project ────────────────
  const prev = await prisma.project.findMany({
    where: { name: PROJECT_NAME, members: { some: { userId: alex.id } } },
    select: { id: true },
  });
  for (const p of prev.map((x) => x.id)) {
    const minutes = await prisma.minute.findMany({
      where: { meeting: { projectId: p } },
      select: { id: true },
    });
    const chat = await prisma.chat.findUnique({ where: { projectId: p }, select: { id: true } });
    const docs = await prisma.document.findMany({ where: { projectId: p }, select: { id: true } });

    await prisma.knowledgeChunk.deleteMany({ where: { projectId: p } });
    await prisma.indexingJob.deleteMany({ where: { projectId: p } });
    await prisma.conversationThread.deleteMany({ where: { projectId: p } });
    // Children first to respect FKs.
    await prisma.task.deleteMany({ where: { projectId: p } });
    await prisma.sprint.deleteMany({ where: { projectId: p } });
    if (minutes.length) {
      await prisma.agreement.deleteMany({ where: { minuteId: { in: minutes.map((m) => m.id) } } });
      await prisma.minute.deleteMany({ where: { id: { in: minutes.map((m) => m.id) } } });
    }
    await prisma.meeting.deleteMany({ where: { projectId: p } });
    if (docs.length) {
      await prisma.documentVersion.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
      await prisma.documentPermission.deleteMany({ where: { documentId: { in: docs.map((d) => d.id) } } });
      await prisma.document.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } });
    }
    if (chat) {
      await prisma.message.deleteMany({ where: { chatId: chat.id } });
      await prisma.chatParticipant.deleteMany({ where: { chatId: chat.id } });
      await prisma.chat.delete({ where: { id: chat.id } });
    }
    await prisma.kanbanColumn.deleteMany({ where: { projectId: p } });
    await prisma.projectMember.deleteMany({ where: { projectId: p } });
    await prisma.project.delete({ where: { id: p } });
  }

  const now = new Date();
  // Track every source we create so we can enqueue indexing at the end.
  const sources: { projectId: string; sourceType: KnowledgeSourceType; sourceId: string }[] = [];

  // ── Project ────────────────────────────────────────────────────────────────
  const project = await prisma.project.create({
    data: {
      name: PROJECT_NAME,
      description:
        "SaaS de analítica de negocio con dashboards, reportes exportables y alertas.",
      status: "ACTIVE",
      createdById: alex.id,
      members: {
        create: [
          { userId: alex.id, memberRole: "ADMIN" },
          { userId: maria.id, memberRole: "MEMBER" },
          { userId: carlos.id, memberRole: "MEMBER" },
        ],
      },
    },
  });

  // ── Kanban columns (includes a BLOCKED column) ─────────────────────────────
  const colDefs = [
    { title: "Por hacer", color: "slate" },
    { title: "En progreso", color: "blue" },
    { title: "Bloqueado", color: "red" },
    { title: "Hecho", color: "emerald" },
  ];
  const cols: Record<string, string> = {};
  for (let i = 0; i < colDefs.length; i++) {
    const c = await prisma.kanbanColumn.create({
      data: { projectId: project.id, title: colDefs[i]!.title, position: i, color: colDefs[i]!.color },
    });
    cols[colDefs[i]!.title] = c.id;
  }

  // ── Sprints ────────────────────────────────────────────────────────────────
  await prisma.sprint.create({
    data: {
      projectId: project.id,
      name: "Sprint 4 – Dashboards",
      goal: "Entregar los dashboards de métricas en tiempo real",
      startDate: addDays(now, -28),
      endDate: addDays(now, -14),
      status: SprintStatus.COMPLETED,
    },
  });
  const sprint5 = await prisma.sprint.create({
    data: {
      projectId: project.id,
      name: "Sprint 5 – Reportes",
      goal: "Entregar el módulo de reportes exportables (PDF/CSV/Excel) y dejar listo el SSO con Google",
      startDate: addDays(now, -7),
      endDate: addDays(now, 7),
      status: SprintStatus.ACTIVE,
    },
  });

  // ── Tasks ──────────────────────────────────────────────────────────────────
  const taskDefs: {
    title: string;
    description?: string;
    col: string;
    priority: TaskPriority;
    sp: number;
    responsible: { id: string };
    dueDate?: Date;
    completedAt?: Date;
  }[] = [
    {
      title: "Exportar reportes a PDF",
      description: "Generar PDF del reporte con encabezado, tabla y gráficos. Es la prioridad del sprint.",
      col: "En progreso", priority: "HIGH", sp: 5, responsible: alex, dueDate: addDays(now, 3),
    },
    {
      title: "Exportar reportes a CSV y Excel",
      description: "Exportadores CSV y XLSX reutilizando el pipeline de datos del reporte.",
      col: "Por hacer", priority: "MEDIUM", sp: 3, responsible: maria, dueDate: addDays(now, 6),
    },
    {
      title: "Programar envío de reportes por correo",
      description: "Cron + plantilla de email para enviar reportes en PDF de forma programada.",
      col: "Por hacer", priority: "MEDIUM", sp: 3, responsible: alex, dueDate: addDays(now, 6),
    },
    {
      title: "Migración a PostgreSQL 16",
      description: "Actualizar el motor y validar extensiones. Bloqueada: falta ventana de mantenimiento aprobada por infraestructura.",
      col: "Bloqueado", priority: "HIGH", sp: 5, responsible: carlos,
    },
    {
      title: "Integrar autenticación SSO con Google",
      description: "Login con Google Workspace. Bloqueada: esperando las credenciales OAuth del cliente.",
      col: "Bloqueado", priority: "HIGH", sp: 3, responsible: maria,
    },
    {
      title: "Implementar caché con Redis para sesiones",
      description: "Mover sesiones y resultados de consultas pesadas a Redis.",
      col: "En progreso", priority: "MEDIUM", sp: 2, responsible: carlos,
    },
    {
      title: "Diseñar dashboard de métricas en tiempo real",
      col: "Hecho", priority: "HIGH", sp: 5, responsible: maria, completedAt: addDays(now, -16),
    },
    {
      title: "Configurar CI/CD con GitHub Actions",
      col: "Hecho", priority: "MEDIUM", sp: 3, responsible: carlos, completedAt: addDays(now, -18),
    },
    {
      title: "Modelo de datos de reportes",
      col: "Hecho", priority: "MEDIUM", sp: 2, responsible: alex, completedAt: addDays(now, -5),
    },
    {
      title: "Filtros avanzados en el dashboard",
      col: "Por hacer", priority: "LOW", sp: 2, responsible: maria, dueDate: addDays(now, 10),
    },
  ];
  for (const t of taskDefs) {
    const task = await prisma.task.create({
      data: {
        title: t.title,
        description: t.description ?? null,
        priority: t.priority,
        storyPoints: t.sp,
        columnId: cols[t.col]!,
        projectId: project.id,
        sprintId: sprint5.id,
        createdById: alex.id,
        responsibleId: t.responsible.id,
        dueDate: t.dueDate ?? null,
        completedAt: t.completedAt ?? null,
      },
    });
    sources.push({ projectId: project.id, sourceType: "TASK", sourceId: task.id });
  }

  // ── Documents (with plain-text versions for RAG) ───────────────────────────
  const docDefs = [
    {
      title: "Documento de Arquitectura – InsightHub",
      text: `# Arquitectura de InsightHub

## Visión general
InsightHub es una plataforma SaaS de analítica de negocio. La arquitectura sigue un enfoque modular con un frontend, un backend de API y servicios de soporte.

## Stack tecnológico
- Frontend: Next.js 14 (App Router) con TailwindCSS.
- Backend: Node.js con Express y TypeScript.
- Base de datos principal: PostgreSQL 16.
- Caché: Redis, usado para sesiones de usuario y para cachear consultas analíticas pesadas.
- Infraestructura: contenedores Docker desplegados en AWS ECS detrás de un API Gateway.

## Decisiones clave
1. Toda la API está versionada bajo /api/v1 y devuelve respuestas con el formato { success, data }.
2. La autenticación usa JWT en cookies httpOnly. Se añadirá SSO con Google en el Sprint 5.
3. Los reportes se generan de forma asíncrona mediante una cola de trabajos.
4. Las métricas en tiempo real se transmiten por WebSocket.

## Seguridad
El acceso a cada proyecto está aislado por membresía. Los datos sensibles se cifran en reposo.`,
    },
    {
      title: "PRD – Módulo de Reportes Exportables",
      text: `# PRD: Módulo de Reportes Exportables

## Objetivo
Permitir a los usuarios generar y exportar reportes de sus métricas de negocio.

## Requisitos funcionales
- Los reportes deben poder exportarse en tres formatos: PDF, CSV y Excel (XLSX).
- El usuario puede programar el envío automático de un reporte por correo electrónico (diario, semanal o mensual).
- Los reportes respetan los permisos: un usuario solo ve datos de los proyectos a los que pertenece.
- Cada reporte incluye un encabezado con el logo, el rango de fechas y un resumen ejecutivo.

## Requisitos no funcionales
- La generación de un reporte de hasta 50.000 filas no debe superar los 30 segundos.
- El PDF debe ser accesible y legible en impresión A4.

## Fuera de alcance (v1)
- Edición colaborativa de plantillas de reporte.
- Dashboards embebidos en sitios externos.`,
    },
    {
      title: "Catálogo de Reportes Disponibles – InsightHub",
      text: `# Catálogo de Reportes Disponibles

Este documento lista los reportes que InsightHub ofrece a los usuarios. Todos se pueden exportar en PDF, CSV y Excel, y programar para envío por correo.

## 1. Reporte de Ventas Mensual
Muestra los ingresos totales, el número de pedidos y el ticket promedio por mes. Incluye comparación contra el mes anterior y contra el mismo mes del año pasado. Responsable: equipo Comercial.

## 2. Reporte de Retención de Usuarios
Analiza la retención por cohortes: qué porcentaje de usuarios sigue activo a los 7, 30 y 90 días desde el registro. Útil para medir el impacto de cambios de producto.

## 3. Reporte de Embudo de Conversión
Detalla el funnel desde visita → registro → activación → compra, con la tasa de conversión y el punto de mayor abandono en cada etapa.

## 4. Reporte de Uso de Funcionalidades
Indica qué funcionalidades se usan más y cuáles menos, con número de usuarios únicos y frecuencia de uso. Ayuda a priorizar el roadmap.

## 5. Reporte de Rendimiento Técnico
Resume latencia de la API (p50, p95, p99), tasa de errores 5xx y disponibilidad mensual del servicio. Responsable: equipo de Plataforma.

## 6. Reporte Ejecutivo (KPIs)
Una página con los KPIs principales del negocio: usuarios activos mensuales (MAU), ingresos recurrentes mensuales (MRR), churn y NPS. Pensado para la dirección.

## Frecuencia y entrega
Cada reporte puede generarse bajo demanda o programarse de forma diaria, semanal o mensual. Los reportes programados se envían por correo en PDF a las 8:00.`,
    },
  ];
  for (const d of docDefs) {
    const contentState = createYjsStateFromPlainText(d.text);
    const doc = await prisma.document.create({
      data: {
        projectId: project.id,
        createdById: alex.id,
        title: d.title,
        contentState,
        permissions: {
          create: [
            { userId: alex.id, role: DocumentPermissionRole.EDITOR },
            { userId: maria.id, role: DocumentPermissionRole.EDITOR },
            { userId: carlos.id, role: DocumentPermissionRole.COMMENTER },
          ],
        },
        versions: {
          create: {
            createdById: alex.id,
            source: "seed",
            contentState,
            plainText: d.text,
          },
        },
      },
    });
    sources.push({ projectId: project.id, sourceType: "DOCUMENT", sourceId: doc.id });
  }

  // ── Meetings + minutes (past) and scheduled (future) ───────────────────────
  // Past: Sprint Planning with a full minute (summary, key points, agreements, transcript).
  const planning = await prisma.meeting.create({
    data: {
      title: "Sprint Planning – Sprint 5",
      description: "Planificación del módulo de reportes y del SSO.",
      projectId: project.id,
      createdById: alex.id,
      meetingType: MeetingType.SPRINT_PLANNING,
      status: MeetingStatus.PROCESSED,
      scheduledAt: at(addDays(now, -7), 10),
      startedAt: at(addDays(now, -7), 10),
      endedAt: at(addDays(now, -7), 11),
      participants: {
        create: [{ userId: alex.id }, { userId: maria.id }, { userId: carlos.id }],
      },
    },
  });
  const planningMinute = await prisma.minute.create({
    data: {
      meetingId: planning.id,
      language: "es",
      transcript:
        "Alex: El objetivo del Sprint 5 es entregar el módulo de reportes exportables y dejar listo el SSO con Google. " +
        "María: Yo me encargo de los exportadores CSV y Excel, pero el SSO depende de que el cliente nos envíe las credenciales OAuth de Google. " +
        "Carlos: La migración a PostgreSQL 16 sigue bloqueada porque infraestructura no ha aprobado la ventana de mantenimiento. Mientras tanto avanzo con la caché de Redis. " +
        "Alex: Perfecto. La prioridad número uno es la exportación a PDF, debe estar lista antes del 30 de junio. " +
        "María: De acuerdo. También deberíamos programar el envío de reportes por correo. " +
        "Alex: Sí, lo dejamos como tarea del sprint. Cerramos con esos acuerdos.",
      summary:
        "El equipo planificó el Sprint 5, centrado en el módulo de reportes exportables (PDF, CSV, Excel) y en habilitar el SSO con Google. " +
        "La exportación a PDF es la máxima prioridad con fecha límite el 30 de junio. El SSO y la migración a PostgreSQL 16 están bloqueados por dependencias externas.",
      keyPoints: [
        "La exportación de reportes a PDF es la prioridad #1 del sprint.",
        "El SSO con Google está bloqueado esperando credenciales OAuth del cliente.",
        "La migración a PostgreSQL 16 está bloqueada por falta de ventana de mantenimiento.",
        "Carlos avanza con la caché de Redis mientras tanto.",
      ],
      agreements: {
        create: [
          { order: 1, text: "Priorizar la exportación de reportes a PDF y entregarla antes del 30 de junio." },
          { order: 2, text: "María coordinará con el cliente las credenciales OAuth para el SSO con Google." },
          { order: 3, text: "Carlos solicitará a infraestructura la ventana de mantenimiento para la migración a PostgreSQL 16." },
          { order: 4, text: "Añadir una tarea para programar el envío de reportes por correo." },
        ],
      },
    },
  });
  sources.push({ projectId: project.id, sourceType: "MINUTE", sourceId: planningMinute.id });
  sources.push({ projectId: project.id, sourceType: "MEETING_TRANSCRIPT", sourceId: planningMinute.id });

  // Past: a Daily Scrum with a short minute.
  const daily = await prisma.meeting.create({
    data: {
      title: "Daily Scrum",
      projectId: project.id,
      createdById: alex.id,
      meetingType: MeetingType.DAILY,
      status: MeetingStatus.PROCESSED,
      scheduledAt: at(addDays(now, -1), 9),
      startedAt: at(addDays(now, -1), 9),
      endedAt: at(addDays(now, -1), 9),
      participants: { create: [{ userId: alex.id }, { userId: maria.id }, { userId: carlos.id }] },
    },
  });
  const dailyMinute = await prisma.minute.create({
    data: {
      meetingId: daily.id,
      language: "es",
      transcript:
        "Alex: Ayer avancé el exportador PDF, hoy sigo con los gráficos. Sin bloqueos. " +
        "María: Estoy esperando las credenciales de Google para el SSO, sigue bloqueado. " +
        "Carlos: Terminé la base de la caché de Redis; la migración a Postgres sigue esperando aprobación.",
      summary:
        "Daily Scrum: Alex avanza el exportador PDF sin bloqueos; María sigue bloqueada esperando credenciales de Google para el SSO; Carlos terminó la base de Redis y la migración a Postgres sigue bloqueada.",
      keyPoints: [
        "Alex avanza la exportación a PDF sin bloqueos.",
        "El SSO sigue bloqueado por las credenciales de Google.",
        "La migración a PostgreSQL sigue esperando aprobación.",
      ],
      agreements: {
        create: [
          { order: 1, text: "Escalar la solicitud de credenciales de Google al cliente." },
        ],
      },
    },
  });
  sources.push({ projectId: project.id, sourceType: "MINUTE", sourceId: dailyMinute.id });
  sources.push({ projectId: project.id, sourceType: "MEETING_TRANSCRIPT", sourceId: dailyMinute.id });

  // Future: Sprint Review + Retrospective (scheduled, for calendar/upcoming queries).
  await prisma.meeting.create({
    data: {
      title: "Sprint Review – Sprint 5",
      projectId: project.id,
      createdById: alex.id,
      meetingType: MeetingType.REGULAR,
      status: MeetingStatus.SCHEDULED,
      scheduledAt: at(addDays(now, 6), 15),
      participants: { create: [{ userId: alex.id }, { userId: maria.id }, { userId: carlos.id }] },
    },
  });
  await prisma.meeting.create({
    data: {
      title: "Retrospectiva – Sprint 5",
      projectId: project.id,
      createdById: alex.id,
      meetingType: MeetingType.REGULAR,
      status: MeetingStatus.SCHEDULED,
      scheduledAt: at(addDays(now, 7), 16),
      participants: { create: [{ userId: alex.id }, { userId: maria.id }, { userId: carlos.id }] },
    },
  });

  // ── Project group chat with messages ───────────────────────────────────────
  const chat = await prisma.chat.create({
    data: {
      type: "PROJECT",
      projectId: project.id,
      participants: {
        create: [{ userId: alex.id }, { userId: maria.id }, { userId: carlos.id }],
      },
    },
  });
  const chatMsgs: { sender: { id: string }; content: string; minsAgo: number }[] = [
    { sender: alex, content: "Equipo, recordatorio: la exportación de reportes a PDF es la prioridad del sprint. ¿Cómo vamos?", minsAgo: 600 },
    { sender: maria, content: "El SSO con Google sigue bloqueado, estoy esperando que el cliente nos envíe las credenciales OAuth.", minsAgo: 580 },
    { sender: carlos, content: "La migración a PostgreSQL 16 también está bloqueada, infraestructura no aprueba la ventana de mantenimiento. Avanzo con Redis mientras tanto.", minsAgo: 560 },
    { sender: alex, content: "Ok. Subí el PRD del módulo de reportes al espacio de documentos, revísenlo cuando puedan.", minsAgo: 500 },
    { sender: maria, content: "Lo vi, gracias. Confirmo que exportaremos en PDF, CSV y Excel.", minsAgo: 480 },
    { sender: carlos, content: "El exportador a PDF debería usar la cola de trabajos asíncrona que ya tenemos.", minsAgo: 300 },
    { sender: maria, content: "¿Qué reportes incluimos en la v1? Yo voto por Ventas Mensual, Retención de Usuarios y el Reporte Ejecutivo de KPIs.", minsAgo: 240 },
    { sender: alex, content: "De acuerdo. Sumemos también el Embudo de Conversión, es el que más pide el equipo comercial.", minsAgo: 220 },
    { sender: carlos, content: "El Reporte de Rendimiento Técnico lo dejo listo yo, ya tengo las métricas de latencia y errores.", minsAgo: 200 },
    { sender: alex, content: "Exacto. La fecha límite del PDF es el 30 de junio, no la perdamos de vista.", minsAgo: 120 },
  ];
  for (const m of chatMsgs) {
    await prisma.message.create({
      data: {
        chatId: chat.id,
        senderId: m.sender.id,
        type: "TEXT",
        content: m.content,
        createdAt: new Date(now.getTime() - m.minsAgo * 60_000),
      },
    });
  }
  sources.push({ projectId: project.id, sourceType: "CHAT_MESSAGE", sourceId: chat.id });

  // ── Enqueue indexing for every source (worker embeds them) ─────────────────
  for (const s of sources) {
    const existing = await prisma.indexingJob.findFirst({
      where: { sourceType: s.sourceType, sourceId: s.sourceId, status: "PENDING" },
      select: { id: true },
    });
    if (!existing) {
      await prisma.indexingJob.create({ data: { ...s, status: "PENDING" } });
    }
  }

  console.log("✅ Copilot RAG demo seed complete:");
  console.log(`   Project: ${PROJECT_NAME} (${project.id})`);
  console.log(`   Login:   alex@example.com / string123`);
  console.log(`   Sources enqueued for indexing: ${sources.length}`);
  console.log(`   (documents, minutes, transcripts, tasks, project chat)`);
}
