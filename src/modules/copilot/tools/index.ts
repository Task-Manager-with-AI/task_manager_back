import { prisma } from "../../../prisma/client";
import { searchKnowledge } from "../retrieval.service";
import type { KnowledgeSourceType } from "../indexing/knowledge.repository";

/**
 * Tool execution context. Every tool runs scoped to a project the user is a
 * verified active member of (enforced by membershipMiddleware on the route), so
 * project-scoped queries cannot leak across projects.
 */
export interface ToolContext {
  userId: string;
  projectId: string;
}

export interface CopilotTool {
  /** OpenAI-compatible function definition advertised to the LLM. */
  definition: {
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  };
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<unknown>;
}

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

// ── search_knowledge ────────────────────────────────────────────────────────
const searchKnowledgeTool: CopilotTool = {
  definition: {
    type: "function",
    function: {
      name: "search_knowledge",
      description:
        "Búsqueda semántica en el conocimiento del proyecto: documentos, minutas, " +
        "transcripciones de reuniones, acuerdos, descripciones de tareas e historial " +
        "del chat de grupo. Úsala para preguntas sobre CONTENIDO ('¿qué dice el " +
        "documento de arquitectura?', '¿qué se acordó sobre la base de datos?').",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "La consulta en lenguaje natural." },
          source_types: {
            type: "array",
            items: {
              type: "string",
              enum: [
                "DOCUMENT",
                "MINUTE",
                "MEETING_TRANSCRIPT",
                "AGREEMENT",
                "TASK",
                "CHAT_MESSAGE",
              ],
            },
            description: "Opcional: limita la búsqueda a ciertos tipos de fuente.",
          },
        },
        required: ["query"],
      },
    },
  },
  async execute(args, ctx) {
    const query = str(args["query"]) ?? "";
    const sourceTypes = Array.isArray(args["source_types"])
      ? (args["source_types"] as KnowledgeSourceType[])
      : undefined;
    const results = await searchKnowledge({ projectId: ctx.projectId, query, sourceTypes });
    return {
      results: results.map((r) => ({
        title: r.title,
        source_type: r.sourceType,
        url: r.url,
        excerpt: r.content.slice(0, 1200),
        score: Number(r.score.toFixed(3)),
        // citation handle the orchestrator collects for the UI
        _citation: {
          chunkId: r.chunkId,
          sourceType: r.sourceType,
          sourceId: r.sourceId,
          title: r.title,
          url: r.url,
        },
      })),
    };
  },
};

// ── list_tasks ──────────────────────────────────────────────────────────────
const listTasksTool: CopilotTool = {
  definition: {
    type: "function",
    function: {
      name: "list_tasks",
      description:
        "Lista las tareas del proyecto con su estado ACTUAL (columna Kanban), " +
        "responsable y prioridad. Úsala para datos exactos y frescos: '¿qué tareas " +
        "están bloqueadas?', '¿qué tiene asignado Juan?', '¿cuántas tareas hay en progreso?'.",
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description:
              "Filtra por título de columna Kanban (coincidencia parcial, ej. 'progreso', 'bloqueado', 'hecho').",
          },
          responsible_name: {
            type: "string",
            description: "Filtra por nombre del responsable (coincidencia parcial).",
          },
        },
      },
    },
  },
  async execute(args, ctx) {
    const tasks = await prisma.task.findMany({
      where: { projectId: ctx.projectId },
      select: {
        id: true,
        title: true,
        priority: true,
        dueDate: true,
        column: { select: { title: true } },
        responsible: { select: { name: true } },
        sprint: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    const status = str(args["status"])?.toLowerCase();
    const responsible = str(args["responsible_name"])?.toLowerCase();

    const filtered = tasks.filter((t) => {
      if (status && !(t.column?.title ?? "").toLowerCase().includes(status)) return false;
      if (responsible && !(t.responsible?.name ?? "").toLowerCase().includes(responsible))
        return false;
      return true;
    });

    return {
      count: filtered.length,
      tasks: filtered.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.column?.title ?? "—",
        priority: t.priority,
        responsible: t.responsible?.name ?? null,
        sprint: t.sprint?.name ?? null,
        due_date: t.dueDate?.toISOString() ?? null,
      })),
    };
  },
};

// ── list_meetings ───────────────────────────────────────────────────────────
const listMeetingsTool: CopilotTool = {
  definition: {
    type: "function",
    function: {
      name: "list_meetings",
      description:
        "Lista reuniones del proyecto. Úsala para preguntas temporales: '¿qué " +
        "reuniones tengo esta semana?', '¿cuándo fue la última planning?'.",
      parameters: {
        type: "object",
        properties: {
          when: {
            type: "string",
            enum: ["upcoming", "past", "all"],
            description: "Filtra por reuniones futuras, pasadas o todas. Por defecto: all.",
          },
          type: {
            type: "string",
            enum: ["DAILY", "SPRINT_PLANNING", "REGULAR"],
            description: "Opcional: filtra por tipo de reunión.",
          },
        },
      },
    },
  },
  async execute(args, ctx) {
    const when = str(args["when"]) ?? "all";
    const type = str(args["type"]);
    const now = new Date();

    const meetings = await prisma.meeting.findMany({
      where: {
        projectId: ctx.projectId,
        ...(type ? { meetingType: type as "DAILY" | "SPRINT_PLANNING" | "REGULAR" } : {}),
        ...(when === "upcoming" ? { scheduledAt: { gte: now } } : {}),
        ...(when === "past" ? { scheduledAt: { lt: now } } : {}),
      },
      select: {
        id: true,
        title: true,
        meetingType: true,
        status: true,
        scheduledAt: true,
        minute: { select: { id: true } },
      },
      orderBy: { scheduledAt: when === "upcoming" ? "asc" : "desc" },
      take: 50,
    });

    return {
      count: meetings.length,
      meetings: meetings.map((m) => ({
        id: m.id,
        title: m.title,
        type: m.meetingType,
        status: m.status,
        scheduled_at: m.scheduledAt?.toISOString() ?? null,
        has_minute: !!m.minute,
        minute_id: m.minute?.id ?? null,
      })),
    };
  },
};

// ── get_meeting_minute ──────────────────────────────────────────────────────
const getMeetingMinuteTool: CopilotTool = {
  definition: {
    type: "function",
    function: {
      name: "get_meeting_minute",
      description:
        "Obtiene la minuta de una reunión (resumen, puntos clave y acuerdos) por meetingId.",
      parameters: {
        type: "object",
        properties: { meeting_id: { type: "string" } },
        required: ["meeting_id"],
      },
    },
  },
  async execute(args, ctx) {
    const meetingId = str(args["meeting_id"]);
    if (!meetingId) return { error: "meeting_id es requerido" };

    const meeting = await prisma.meeting.findFirst({
      where: { id: meetingId, projectId: ctx.projectId },
      select: {
        title: true,
        minute: {
          select: {
            summary: true,
            keyPoints: true,
            agreements: { select: { order: true, text: true }, orderBy: { order: "asc" } },
          },
        },
      },
    });
    if (!meeting) return { error: "Reunión no encontrada en este proyecto" };
    if (!meeting.minute) return { title: meeting.title, has_minute: false };

    return {
      title: meeting.title,
      has_minute: true,
      summary: meeting.minute.summary,
      key_points: meeting.minute.keyPoints,
      agreements: meeting.minute.agreements.map((a) => ({ order: a.order, text: a.text })),
    };
  },
};

// ── list_documents ──────────────────────────────────────────────────────────
const listDocumentsTool: CopilotTool = {
  definition: {
    type: "function",
    function: {
      name: "list_documents",
      description: "Lista los documentos del proyecto (título, autor y fecha de actualización).",
      parameters: { type: "object", properties: {} },
    },
  },
  async execute(_args, ctx) {
    const docs = await prisma.document.findMany({
      where: { projectId: ctx.projectId, deletedAt: null },
      select: {
        id: true,
        title: true,
        updatedAt: true,
        createdBy: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return {
      count: docs.length,
      documents: docs.map((d) => ({
        id: d.id,
        title: d.title,
        author: d.createdBy?.name ?? null,
        updated_at: d.updatedAt.toISOString(),
      })),
    };
  },
};

// ── get_sprint_status ───────────────────────────────────────────────────────
const getSprintStatusTool: CopilotTool = {
  definition: {
    type: "function",
    function: {
      name: "get_sprint_status",
      description:
        "Estado del sprint activo: objetivo, fechas y progreso (tareas por columna).",
      parameters: { type: "object", properties: {} },
    },
  },
  async execute(_args, ctx) {
    const sprint = await prisma.sprint.findFirst({
      where: { projectId: ctx.projectId, status: "ACTIVE" },
      select: { id: true, name: true, goal: true, startDate: true, endDate: true },
    });
    if (!sprint) return { active_sprint: null, message: "No hay un sprint activo." };

    const tasks = await prisma.task.findMany({
      where: { sprintId: sprint.id },
      select: { column: { select: { title: true } } },
    });
    const byColumn: Record<string, number> = {};
    for (const t of tasks) {
      const key = t.column?.title ?? "—";
      byColumn[key] = (byColumn[key] ?? 0) + 1;
    }

    return {
      active_sprint: {
        name: sprint.name,
        goal: sprint.goal,
        start_date: sprint.startDate.toISOString(),
        end_date: sprint.endDate.toISOString(),
        total_tasks: tasks.length,
        tasks_by_status: byColumn,
      },
    };
  },
};

// ── get_chat_messages ───────────────────────────────────────────────────────
const getChatMessagesTool: CopilotTool = {
  definition: {
    type: "function",
    function: {
      name: "get_chat_messages",
      description:
        "Devuelve los mensajes recientes del chat de GRUPO del proyecto. Úsala para " +
        "'¿de qué se habló hoy en el chat?' o 'resume el chat del equipo'. " +
        "Solo accede al chat de grupo del proyecto (no a chats directos).",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Cantidad de mensajes recientes (máx 100). Por defecto 50." },
        },
      },
    },
  },
  async execute(args, ctx) {
    const limit = Math.min(Math.max(Number(args["limit"]) || 50, 1), 100);

    const chat = await prisma.chat.findFirst({
      where: { projectId: ctx.projectId, type: "PROJECT" },
      select: { id: true, participants: { where: { userId: ctx.userId }, select: { id: true } } },
    });
    if (!chat) return { error: "Este proyecto no tiene chat de grupo." };
    // Defense in depth: the asker must be a participant of the project chat.
    if (chat.participants.length === 0) return { error: "No tienes acceso al chat de este proyecto." };

    const messages = await prisma.message.findMany({
      where: { chatId: chat.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        content: true,
        type: true,
        createdAt: true,
        sender: { select: { name: true } },
      },
    });

    return {
      count: messages.length,
      // Return chronological order for readability.
      messages: messages.reverse().map((m) => ({
        sender: m.sender?.name ?? "Sistema",
        type: m.type,
        content: m.content,
        at: m.createdAt.toISOString(),
      })),
    };
  },
};

// ── get_calendar ────────────────────────────────────────────────────────────
const getCalendarTool: CopilotTool = {
  definition: {
    type: "function",
    function: {
      name: "get_calendar",
      description:
        "Próximos eventos del proyecto (reuniones programadas y tareas con vencimiento) " +
        "en una ventana de días. Úsala para '¿qué tengo esta semana?'.",
      parameters: {
        type: "object",
        properties: {
          days: { type: "number", description: "Ventana hacia adelante en días. Por defecto 7." },
        },
      },
    },
  },
  async execute(args, ctx) {
    const days = Math.min(Math.max(Number(args["days"]) || 7, 1), 60);
    const now = new Date();
    const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const [meetings, tasks] = await Promise.all([
      prisma.meeting.findMany({
        where: { projectId: ctx.projectId, scheduledAt: { gte: now, lte: until } },
        select: { id: true, title: true, meetingType: true, scheduledAt: true },
        orderBy: { scheduledAt: "asc" },
      }),
      prisma.task.findMany({
        where: { projectId: ctx.projectId, dueDate: { gte: now, lte: until } },
        select: { id: true, title: true, dueDate: true, responsible: { select: { name: true } } },
        orderBy: { dueDate: "asc" },
      }),
    ]);

    return {
      window_days: days,
      meetings: meetings.map((m) => ({
        id: m.id,
        title: m.title,
        type: m.meetingType,
        at: m.scheduledAt?.toISOString() ?? null,
      })),
      task_deadlines: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        due_date: t.dueDate?.toISOString() ?? null,
        responsible: t.responsible?.name ?? null,
      })),
    };
  },
};

// ── Registry ────────────────────────────────────────────────────────────────
const allTools: CopilotTool[] = [
  searchKnowledgeTool,
  listTasksTool,
  listMeetingsTool,
  getMeetingMinuteTool,
  listDocumentsTool,
  getSprintStatusTool,
  getChatMessagesTool,
  getCalendarTool,
];

export const toolRegistry: Record<string, CopilotTool> = Object.fromEntries(
  allTools.map((t) => [t.definition.function.name, t])
);

export const toolDefinitions = allTools.map((t) => t.definition);
