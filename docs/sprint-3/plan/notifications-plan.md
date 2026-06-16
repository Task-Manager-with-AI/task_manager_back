# Plan de Implementación — Sistema de Notificaciones

> Sprint 3 · Notificaciones funcionales, en tiempo real y push
> Objetivo: que cada usuario reciba avisos oportunos y accionables de todo lo
> relevante que ocurre en sus proyectos (mensajería, reuniones, tareas,
> documentos, membresía…), tanto **dentro de la app** como **fuera** (push del
> navegador) cuando no está conectado.

---

## 1. Visión y alcance

Un sistema de notificaciones de **tres canales**, construido sobre la
infraestructura que ya existe:

1. **In-app en tiempo real** — vía el Socket.IO ya montado (`signaling.server.ts`),
   donde cada usuario ya está unido a una sala personal `user:<id>`. Emitimos
   `notification:new` a esa sala y la campana de la cabecera se actualiza al
   instante.
2. **Persistencia / centro de notificaciones** — un modelo `Notification` para
   que el usuario vea su historial, marque leído y reciba el conteo de no
   leídas aunque haya estado desconectado.
3. **Web Push (navegador)** — usando la Push API + Service Worker + VAPID, para
   que lleguen notificaciones del sistema operativo aunque la pestaña esté
   cerrada (canal opt-in, fase 3).

> **Principio:** la **REST/servicio es la fuente de verdad** (igual que el chat):
> primero se persiste la `Notification`, luego se emite el evento de socket y, si
> el usuario está offline y tiene push habilitado, se envía Web Push. El socket
> nunca persiste por su cuenta.

---

## 2. Catálogo de notificaciones (completo)

Cada notificación tiene un **tipo**, un **disparador** (dónde se genera), los
**destinatarios** y un **deep-link** de destino. Se generan con *hooks* en los
servicios existentes (mismo patrón que `enqueueSafe` del Copilot RAG).

| # | Tipo (`NotificationType`) | Disparador | Destinatarios | Deep-link |
| --- | --- | --- | --- | --- |
| 1 | `PROJECT_MEMBER_ADDED` | Te agregan a un proyecto (`projects.service.addMember`) | El usuario agregado | `/projects/:id` |
| 2 | `PROJECT_ROLE_CHANGED` | Cambian tu rol en un proyecto | El usuario afectado | `/projects/:id` |
| 3 | `PROJECT_MEMBER_REMOVED` | Te quitan de un proyecto | El usuario removido | `/projects` |
| 4 | `MEETING_SCHEDULED` | Alguien programa una reunión (`meetings.service.createMeeting`) | Participantes (menos el creador) | `/projects/:id/meetings/:mid` |
| 5 | `MEETING_STARTED` | Una reunión inicia (`meetings.service` start / `meeting:started` socket) | Participantes (menos quien inicia) | `…/meetings/:mid/room` |
| 6 | `MEETING_REMINDER` | X min antes de una reunión programada (job) | Participantes | `…/meetings/:mid` |
| 7 | `MEETING_MINUTES_READY` | La IA terminó de procesar la minuta | Participantes | `/meetings/:mid` |
| 8 | `TASK_ASSIGNED` | Te asignan como responsable (`tasks.service.create/update`) | El nuevo responsable | `/projects/:id?task=:tid` |
| 9 | `TASK_STATUS_CHANGED` | Cambia el estado/columna de una tarea (`changeTaskColumn`) | Responsable + creador (menos quien la mueve) | `/projects/:id?task=:tid` |
| 10 | `TASK_DUE_SOON` | Una tarea tuya vence pronto (job) | Responsable | `/projects/:id?task=:tid` |
| 11 | `TASK_OVERDUE` | Una tarea tuya está vencida (job) | Responsable | `/projects/:id?task=:tid` |
| 12 | `TASK_COMMENT` / `TASK_UPDATED` | Editan una tarea de la que eres responsable/creador | Responsable + creador | `/projects/:id?task=:tid` |
| 13 | `DOCUMENT_CREATED` | Suben/crean un documento en tu proyecto (`documents.service`) | Miembros del proyecto (menos el autor) | `/projects/:id/documents/:docId` |
| 14 | `DOCUMENT_SHARED` | Te dan permiso sobre un documento | El usuario | `/projects/:id/documents/:docId` |
| 15 | `DOCUMENT_COMMENT` / `DOCUMENT_MENTION` | Te mencionan o comentan en un doc tuyo | Mencionado / autor del hilo | `…/documents/:docId` |
| 16 | `CHAT_MESSAGE` | Mensaje nuevo en un chat donde participas y NO lo tienes abierto | Participantes ausentes | `/chats?chatId=:cid` |
| 17 | `CHAT_MENTION` | Te mencionan (`@nombre`) en un chat | El mencionado | `/chats?chatId=:cid` |
| 18 | `CHAT_DIRECT_MESSAGE` | Mensaje directo (1:1) nuevo | El destinatario | `/chats?chatId=:cid` |
| 19 | `TASK_SUGGESTION_CREATED` | La IA generó sugerencias de tareas de una reunión | Creador de la reunión / responsables sugeridos | `/meetings/:mid` |
| 20 | `SUGGESTION_RESOLVED` | Aceptan/rechazan una sugerencia que te involucra | Responsable sugerido | `/projects/:id` |
| 21 | `MENTION_IN_MINUTE` | Apareces en los acuerdos/minuta | El mencionado | `/meetings/:mid` |
| 22 | `COPILOT_DIGEST` *(opcional)* | Resumen proactivo semanal del proyecto (job + IA) | Miembros | `/projects/:id/copilot` |

> **Reglas transversales:**
> - **Nunca te notificas a ti mismo** (se excluye el actor que dispara el evento).
> - **Coalescencia:** ráfagas del mismo tipo+entidad (p. ej. 5 mensajes en el
>   mismo chat) se agrupan en una sola notificación "N mensajes nuevos" hasta que
>   se marque leída.
> - **Respeto de preferencias y presencia:** si el usuario está *online y con el
>   chat abierto*, no se genera `CHAT_MESSAGE` (ya lo ve en vivo).

---

## 3. Arquitectura

```
┌──────────────────────────────────────────────────────────────────┐
│ Servicios de dominio (projects, meetings, tasks, documents, chats) │
│   …mutación exitosa → notify.emit({ type, recipients, payload })   │
└───────────────────────────────┬───────────────────────────────────┘
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│ modules/notifications/notifications.service.ts                     │
│  1. aplica preferencias + reglas (dedupe, no-self, presencia)      │
│  2. persiste Notification (Prisma)                                 │
│  3. emite socket  notification:new → user:<id>  (in-app realtime)  │
│  4. si offline + push habilitado → Web Push (VAPID)               │
└───────────┬───────────────────────────────┬──────────────────────┘
            ▼                                 ▼
   Socket.IO (existente)              Web Push API (navegador)
   user:<id> room                     Service Worker → SO
            ▼
   Frontend: NotificationBell (campana + dropdown + toast + badge)
```

### Reutilización clave
- **Socket.IO ya está montado** y cada usuario ya se une a `user:<id>`
  (`chat.signaling.ts`). Solo añadimos eventos `notification:*` y un helper
  `emitToUsers(userIds, event, payload)` análogo a `emitChatEvent`.
- **Patrón de hooks** idéntico al del Copilot (`enqueueSafe`): los servicios de
  dominio llaman a `notify(...)` tras una mutación exitosa, sin bloquear la
  request (fire-and-forget con captura de errores).

---

## 4. Modelo de datos (Prisma)

```prisma
enum NotificationType {
  PROJECT_MEMBER_ADDED
  PROJECT_ROLE_CHANGED
  PROJECT_MEMBER_REMOVED
  MEETING_SCHEDULED
  MEETING_STARTED
  MEETING_REMINDER
  MEETING_MINUTES_READY
  TASK_ASSIGNED
  TASK_STATUS_CHANGED
  TASK_DUE_SOON
  TASK_OVERDUE
  TASK_UPDATED
  DOCUMENT_CREATED
  DOCUMENT_SHARED
  DOCUMENT_COMMENT
  CHAT_MESSAGE
  CHAT_MENTION
  CHAT_DIRECT_MESSAGE
  TASK_SUGGESTION_CREATED
  SUGGESTION_RESOLVED
  MENTION_IN_MINUTE
  COPILOT_DIGEST
}

enum NotificationCategory { PROJECT  MEETING  TASK  DOCUMENT  CHAT  AI  SYSTEM }

model Notification {
  id         String               @id @default(uuid())
  userId     String               // recipient
  type       NotificationType
  category   NotificationCategory
  title      String
  body       String?
  // Context for grouping + deep-linking, e.g. { projectId, taskId, meetingId, chatId, url }
  data       Json?
  actorId    String?              // who triggered it (for avatar / "X hizo Y")
  projectId  String?              // scope (for filtering / cleanup on project delete)
  // Coalescing key: same (userId, groupKey) updates count instead of inserting.
  groupKey   String?
  count      Int                  @default(1)
  readAt     DateTime?
  createdAt  DateTime             @default(now())
  updatedAt  DateTime             @updatedAt
  user       User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  actor      User?                @relation("NotificationActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([userId, readAt])
  @@index([userId, createdAt])
  @@index([userId, groupKey])
}

/// Per-user, per-category channel preferences. Absent row = defaults (all on).
model NotificationPreference {
  id        String               @id @default(uuid())
  userId    String
  category  NotificationCategory
  inApp     Boolean              @default(true)
  push      Boolean              @default(true)
  email     Boolean              @default(false)   // future channel
  user      User                 @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, category])
}

/// Web Push subscriptions (one per browser/device).
model PushSubscription {
  id        String   @id @default(uuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  auth      String
  userAgent String?
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

`User` gana las back-relations: `notifications`, `notificationsActed @relation("NotificationActor")`, `notificationPrefs`, `pushSubscriptions`.

---

## 5. Backend

### 5.1 Estructura del módulo (patrón del repo)
```
src/modules/notifications/
  notifications.routes.ts
  notifications.controller.ts
  notifications.service.ts        ← notify(), markRead, list, preferences, push fan-out
  notifications.repository.ts     ← Prisma (Notification, Preference, PushSubscription)
  notifications.schema.ts         ← Zod
  notifications.emitter.ts        ← emitToUsers() sobre el io existente
  notifications.catalog.ts        ← plantillas título/cuerpo por tipo (i18n-friendly)
  push.service.ts                 ← Web Push (web-push lib + VAPID)
  jobs/
    meeting-reminders.job.ts      ← recordatorios X min antes (setInterval/cron)
    task-deadlines.job.ts         ← due-soon / overdue diario
```

### 5.2 API
```
GET    /api/v1/notifications?cursor=&filter=unread        — lista paginada
GET    /api/v1/notifications/unread-count                 — { count }
PATCH  /api/v1/notifications/:id/read
PATCH  /api/v1/notifications/read-all
DELETE /api/v1/notifications/:id
GET    /api/v1/notifications/preferences
PUT    /api/v1/notifications/preferences                  — { category, inApp, push, email }[]
POST   /api/v1/notifications/push/subscribe               — { endpoint, keys }
DELETE /api/v1/notifications/push/subscribe               — { endpoint }
GET    /api/v1/notifications/push/vapid-public-key
```

### 5.3 API interna (la usan los demás servicios)
```ts
// notifications.service.ts
export async function notify(input: {
  type: NotificationType;
  recipientIds: string[];          // se filtra el actor y por preferencias
  actorId?: string;
  projectId?: string;
  data?: Record<string, unknown>;  // { taskId, meetingId, chatId, url, ... }
  groupKey?: string;               // para coalescencia
}): Promise<void>;

export function notifySafe(input): void;  // fire-and-forget, nunca lanza
```
Internamente: filtra destinatarios (no-self, preferencias, presencia para chat),
hace **upsert por `groupKey`** (incrementa `count` o crea), emite
`notification:new` por socket y, para destinatarios offline con push, llama a
`push.service`.

### 5.4 Hooks en servicios existentes (qué tocar)
| Servicio | Punto | Llamada |
| --- | --- | --- |
| `projects.service` | `addMember` | `notifySafe(PROJECT_MEMBER_ADDED, [userId])` |
| `meetings.service` | `createMeeting` | `MEETING_SCHEDULED` a participantes |
| `meetings.service` | start meeting | `MEETING_STARTED` |
| `meetings.service` | tras `minutes-ready` | `MEETING_MINUTES_READY`, `TASK_SUGGESTION_CREATED` |
| `tasks.service` | `createNewTask` / `updateExistingTask` (cambia responsable) | `TASK_ASSIGNED` |
| `tasks.service` | `changeTaskColumn` | `TASK_STATUS_CHANGED` (responsable+creador) |
| `documents.service` | `createProjectDocument` | `DOCUMENT_CREATED` a miembros |
| `documents.service` | `updatePermissionsForDocument` | `DOCUMENT_SHARED` |
| `chats.service` | `sendMessage` / `sendAttachment` | `CHAT_MESSAGE` / `CHAT_MENTION` / `CHAT_DIRECT_MESSAGE` |
| `suggestions.service` | accept/reject | `SUGGESTION_RESOLVED` |

### 5.5 Eventos de socket (sobre `io` existente)
```
notification:new          → { id, type, category, title, body, data, createdAt, count }
notification:unread-count → { count }              (al marcar leído / nuevo)
notification:read         → { id }                 (sync multi-pestaña)
```
`registerNotificationHandlers(io)` se llama dentro de `setupSignaling`, igual que
`registerChatHandlers`. No requiere salas nuevas: reutiliza `user:<id>`.

### 5.6 Web Push (canal externo, fase 3)
- Lib `web-push` + claves **VAPID** (`VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` en env).
- El frontend registra un **Service Worker** (`public/sw.js`) y se suscribe con la
  clave pública; la suscripción se guarda en `PushSubscription`.
- `push.service.sendToUser(userId, payload)` itera sus suscripciones; las que
  devuelven 404/410 se eliminan (limpieza de endpoints muertos).
- Política: solo se envía push si el usuario está **offline** (presencia) o la
  pestaña no está enfocada, para no duplicar con el in-app.

---

## 6. Frontend

```
features/notifications/
  notifications.api.ts      — list, unreadCount, markRead, prefs, push subscribe
  notifications.hooks.ts    — useNotifications (infinite), useUnreadCount, mutations
  notifications.types.ts
  useNotificationSocket.ts  — escucha notification:* y parchea la cache (setQueryData)
  NotificationBell.tsx      — icono campana + badge con conteo (en la cabecera)
  NotificationDropdown.tsx  — lista, agrupación, "marcar todo leído", deep-links
  NotificationItem.tsx      — avatar del actor + icono por categoría + tiempo relativo
  NotificationToast.tsx     — toast efímero al recibir notification:new
  NotificationPreferences.tsx — matriz categoría × canal (en /settings)
  push.ts                   — registro del Service Worker + suscripción
```

- **Campana en la cabecera** (`dashboard-layout.tsx` ya tiene un botón `Bell`
  inerte → conectarlo): badge con `unreadCount`, dropdown con las últimas N,
  deep-link al hacer clic (marca leído y navega).
- **Tiempo real:** `useNotificationSocket` se suscribe a `notification:new`
  (reusa el cliente Socket.IO de `features/video-call/useSignaling.ts` / chat),
  incrementa el badge y muestra un toast.
- **Preferencias** en `/settings`: activar/desactivar por categoría y canal +
  botón "Activar notificaciones del navegador" (pide permiso y suscribe push).

---

## 7. Configuración (env nuevas)
```
# Backend
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:soporte@tu-dominio.com
NOTIF_MEETING_REMINDER_MIN=15        # minutos antes para el recordatorio
NOTIF_TASK_DEADLINE_CRON_HOUR=8      # hora del barrido diario de vencimientos
# Frontend
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...     # misma clave pública
```
Dependencias: `web-push` (backend). El Service Worker es estático en `public/`.

---

## 8. Seguridad y reglas
- Las notificaciones se **listan solo por `userId`** del token (nunca se exponen
  las de otros). Marcar leído/borrar valida propiedad.
- Los **destinatarios se calculan en el backend** a partir de membresía real
  (mismas reglas que ya aíslan proyectos/chats) — no se confía en el cliente.
- **No-self**, **dedupe por `groupKey`**, y **respeto de preferencias** antes de
  persistir/emitir.
- Web Push firmado con VAPID; endpoints muertos se purgan automáticamente.
- Rate de seguridad: el fan-out es asíncrono y no bloquea la mutación original.

---

## 9. Plan por fases
**Fase 1 — Núcleo in-app (MVP).**
- Modelos `Notification` + migración; `notifications` module (service/repo/routes).
- `emitToUsers` + evento `notification:new`; campana + dropdown + badge + toast.
- Hooks: `TASK_ASSIGNED`, `TASK_STATUS_CHANGED`, `PROJECT_MEMBER_ADDED`,
  `MEETING_SCHEDULED`, `MEETING_STARTED`, `DOCUMENT_CREATED`, `CHAT_MESSAGE`.
- **Demo:** asignar una tarea / iniciar una reunión → llega aviso en vivo.

**Fase 2 — Cobertura completa + preferencias.**
- Resto del catálogo (minutas, sugerencias, menciones, due-soon/overdue, reminders).
- `NotificationPreference` + UI en `/settings`; coalescencia; jobs (recordatorios
  de reunión y vencimientos de tareas).

**Fase 3 — Web Push.**
- VAPID + `web-push` + Service Worker + `PushSubscription`; envío a usuarios
  offline; gestión de permisos y limpieza de endpoints.

**Fase 4 — Extras.**
- Digest proactivo del Copilot, notificaciones por email (canal `email`),
  agrupación inteligente y "centro de notificaciones" a pantalla completa.

---

## 10. Resumen ejecutivo
Reutilizamos el **Socket.IO existente** (salas `user:<id>`) para entrega en
tiempo real, añadimos un **modelo `Notification`** como fuente de verdad y centro
de historial, **hooks no bloqueantes** en los servicios de dominio (patrón ya
usado por el Copilot), **preferencias por categoría/canal** y, como canal
externo, **Web Push (VAPID)** para alcanzar al usuario con la app cerrada. El
catálogo cubre proyectos, reuniones, tareas, documentos, chat e IA — con reglas
de no-self, dedupe y respeto de presencia/preferencias.
