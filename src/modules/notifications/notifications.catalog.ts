import type { NotificationCategory, NotificationType } from "@prisma/client";

/**
 * Context passed by callers when raising a notification. Human-readable bits
 * (names/titles) live here so the catalog can compose the message; ids/url are
 * used by the frontend for deep-linking.
 */
export interface NotifyData {
  actorName?: string;
  projectId?: string;
  projectName?: string;
  taskId?: string;
  taskTitle?: string;
  meetingId?: string;
  meetingTitle?: string;
  documentId?: string;
  documentTitle?: string;
  chatId?: string;
  chatName?: string;
  status?: string;
  url?: string;
  [key: string]: unknown;
}

export interface BuiltNotification {
  category: NotificationCategory;
  title: string;
  body?: string;
  url?: string;
  /** Coalescing key: same (userId, groupKey) increments count instead of inserting. */
  groupKey?: string;
}

const CATEGORY: Record<NotificationType, NotificationCategory> = {
  PROJECT_MEMBER_ADDED: "PROJECT",
  PROJECT_ROLE_CHANGED: "PROJECT",
  PROJECT_MEMBER_REMOVED: "PROJECT",
  MEETING_SCHEDULED: "MEETING",
  MEETING_STARTED: "MEETING",
  MEETING_REMINDER: "MEETING",
  MEETING_MINUTES_READY: "MEETING",
  TASK_ASSIGNED: "TASK",
  TASK_STATUS_CHANGED: "TASK",
  TASK_DUE_SOON: "TASK",
  TASK_OVERDUE: "TASK",
  TASK_UPDATED: "TASK",
  DOCUMENT_CREATED: "DOCUMENT",
  DOCUMENT_SHARED: "DOCUMENT",
  DOCUMENT_COMMENT: "DOCUMENT",
  CHAT_MESSAGE: "CHAT",
  CHAT_MENTION: "CHAT",
  CHAT_DIRECT_MESSAGE: "CHAT",
  TASK_SUGGESTION_CREATED: "AI",
  SUGGESTION_RESOLVED: "AI",
  MENTION_IN_MINUTE: "MEETING",
  COPILOT_DIGEST: "AI",
};

export function categoryOf(type: NotificationType): NotificationCategory {
  return CATEGORY[type];
}

const actor = (d: NotifyData) => d.actorName ?? "Alguien";

/** Build the title/body/url/groupKey for a notification, in Spanish. */
export function buildNotification(
  type: NotificationType,
  d: NotifyData
): BuiltNotification {
  const category = CATEGORY[type];
  const taskUrl = d.projectId && d.taskId ? `/projects/${d.projectId}?task=${d.taskId}` : d.url;
  const meetingUrl = d.meetingId ? `/meetings/${d.meetingId}` : d.url;
  const docUrl =
    d.projectId && d.documentId
      ? `/projects/${d.projectId}/documents/${d.documentId}`
      : d.url;
  const chatUrl = d.chatId ? `/chats?chatId=${d.chatId}` : d.url;
  const projectUrl = d.projectId ? `/projects/${d.projectId}` : d.url;

  switch (type) {
    case "PROJECT_MEMBER_ADDED":
      return { category, title: "Te agregaron a un proyecto", body: `${actor(d)} te agregó a «${d.projectName ?? "un proyecto"}».`, url: projectUrl };
    case "PROJECT_ROLE_CHANGED":
      return { category, title: "Tu rol cambió", body: `${actor(d)} cambió tu rol en «${d.projectName ?? "un proyecto"}».`, url: projectUrl };
    case "PROJECT_MEMBER_REMOVED":
      return { category, title: "Saliste de un proyecto", body: `Ya no eres miembro de «${d.projectName ?? "un proyecto"}».`, url: "/projects" };
    case "MEETING_SCHEDULED":
      return { category, title: "Nueva reunión programada", body: `${actor(d)} programó «${d.meetingTitle ?? "una reunión"}».`, url: meetingUrl };
    case "MEETING_STARTED":
      return { category, title: "Reunión iniciada", body: `${actor(d)} inició «${d.meetingTitle ?? "una reunión"}». Únete ahora.`, url: d.meetingId ? `/meetings/${d.meetingId}` : d.url };
    case "MEETING_REMINDER":
      return { category, title: "Reunión próxima", body: `«${d.meetingTitle ?? "Una reunión"}» comienza pronto.`, url: meetingUrl };
    case "MEETING_MINUTES_READY":
      return { category, title: "Minuta lista", body: `La minuta de «${d.meetingTitle ?? "la reunión"}» ya está disponible.`, url: meetingUrl };
    case "TASK_ASSIGNED":
      return { category, title: "Nueva tarea asignada", body: `${actor(d)} te asignó «${d.taskTitle ?? "una tarea"}».`, url: taskUrl };
    case "TASK_STATUS_CHANGED":
      return { category, title: "Tarea actualizada", body: `${actor(d)} movió «${d.taskTitle ?? "una tarea"}» a ${d.status ?? "otro estado"}.`, url: taskUrl, groupKey: `task-status:${d.taskId}` };
    case "TASK_DUE_SOON":
      return { category, title: "Tarea por vencer", body: `«${d.taskTitle ?? "Una tarea"}» vence pronto.`, url: taskUrl, groupKey: `task-due:${d.taskId}` };
    case "TASK_OVERDUE":
      return { category, title: "Tarea vencida", body: `«${d.taskTitle ?? "Una tarea"}» está vencida.`, url: taskUrl, groupKey: `task-overdue:${d.taskId}` };
    case "TASK_UPDATED":
      return { category, title: "Tarea modificada", body: `${actor(d)} actualizó «${d.taskTitle ?? "una tarea"}».`, url: taskUrl, groupKey: `task-updated:${d.taskId}` };
    case "DOCUMENT_CREATED":
      return { category, title: "Nuevo documento", body: `${actor(d)} creó «${d.documentTitle ?? "un documento"}» en ${d.projectName ?? "el proyecto"}.`, url: docUrl };
    case "DOCUMENT_SHARED":
      return { category, title: "Documento compartido", body: `${actor(d)} compartió «${d.documentTitle ?? "un documento"}» contigo.`, url: docUrl };
    case "DOCUMENT_COMMENT":
      return { category, title: "Nuevo comentario", body: `${actor(d)} comentó en «${d.documentTitle ?? "un documento"}».`, url: docUrl, groupKey: `doc-comment:${d.documentId}` };
    case "CHAT_MESSAGE":
      return { category, title: d.chatName ?? "Nuevo mensaje", body: `${actor(d)}: ${truncate(String(d["preview"] ?? ""), 80)}`, url: chatUrl, groupKey: `chat:${d.chatId}` };
    case "CHAT_MENTION":
      return { category, title: "Te mencionaron", body: `${actor(d)} te mencionó en ${d.chatName ?? "el chat"}.`, url: chatUrl };
    case "CHAT_DIRECT_MESSAGE":
      return { category, title: `Mensaje de ${actor(d)}`, body: truncate(String(d["preview"] ?? ""), 80), url: chatUrl, groupKey: `chat:${d.chatId}` };
    case "TASK_SUGGESTION_CREATED":
      return { category, title: "Sugerencias de tareas", body: `La IA generó tareas a partir de «${d.meetingTitle ?? "una reunión"}».`, url: meetingUrl };
    case "SUGGESTION_RESOLVED":
      return { category, title: "Sugerencia resuelta", body: `${actor(d)} resolvió una sugerencia de tarea.`, url: projectUrl };
    case "MENTION_IN_MINUTE":
      return { category, title: "Apareces en una minuta", body: `Se te menciona en la minuta de «${d.meetingTitle ?? "una reunión"}».`, url: meetingUrl };
    case "COPILOT_DIGEST":
      return { category, title: "Resumen del proyecto", body: `Tu resumen de «${d.projectName ?? "el proyecto"}» está listo.`, url: d.projectId ? `/projects/${d.projectId}/copilot` : d.url };
    default:
      return { category, title: "Notificación", url: d.url };
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
