# Revisión de implementación — Módulo de Chat (Sprint 3)

**Estado:** ✅ Implementado y verificado end-to-end
**Fecha:** 2026-06-15
**Plan de referencia:** [`../chat-module-plan.md`](../chat-module-plan.md)

---

## 1. Resumen

Se implementó el módulo de Chat completo según el plan: chat de grupo automático por
proyecto, chats directos 1-a-1, mensajería en tiempo real (Socket.IO), indicadores de
escritura y presencia, recibos de lectura, reacciones, respuestas (reply), adjuntos
(imagen/archivo) detrás de un proxy autenticado, y las dos funcionalidades
diferenciadoras: **"Convertir en tarea"** (HU-CHAT-4) y **"¿Qué me perdí?"** (resumen IA,
HU-CHAT-5).

Verificaciones automáticas:

- `npm run build` (backend) → **OK, sin errores**.
- `npm run typecheck` (frontend) → **OK, sin errores** (además se corrigió un error
  pre-existente de tipos en `features/video-call/useSignaling.ts`).
- `python -m py_compile` sobre los archivos del AI backend → **OK**.
- Migración Prisma aplicada y backfill ejecutado sobre la BD local (15 proyectos).
- Prueba end-to-end con dos usuarios reales vía API (ver §6).

---

## 2. Fases completadas

| Fase | Descripción | Estado |
| --- | --- | --- |
| 1 | Modelo de datos + hooks de auto-creación + backfill | ✅ |
| 2 | API REST completa + adjuntos (file-storage generalizado) | ✅ |
| 3 | Tiempo real (Socket.IO): mensajes, typing, lectura, presencia | ✅ |
| 4 | Frontend core (chat de grupo y directo) | ✅ |
| 5 | Innovadoras: reacciones, reply, convert-to-task, adjuntos, resumen IA | ✅ |
| 6 | Pulido: estados vacíos, reconexión de socket, checklist | ⚠️ Parcial |

---

## 3. Modelo de datos

`prisma/schema.prisma` — nuevos enums `ChatType`, `MessageType`; modelos `Chat`,
`ChatParticipant`, `Message`, `MessageReaction`, `ChatTaskLink`; relaciones añadidas a
`User`, `Project` (`chat Chat?`) y `Task` (`chatLink ChatTaskLink?`).

**Desviaciones respecto al plan:**

- Se añadió `Message.attachmentMime` (no estaba en el plan) para servir el adjunto con su
  `Content-Type` original desde el proxy autenticado sin re-inferirlo.
- La relación inversa en `Message` se llamó `taskLink` (en el plan figuraba
  `taskSuggestion`, nombre confuso porque ya existe `Task.taskSuggestion`).

Migración: `prisma/migrations/20260615151005_add_chat_module/`.
Backfill idempotente: `prisma/backfill-chats.ts` (crea chat + participantes para
proyectos existentes; ejecutado correctamente sobre 15 proyectos).

---

## 4. Backend

### Archivos nuevos
- `src/modules/chats/chats.repository.ts` — queries Prisma + helpers de integración con
  proyectos (`ensureProjectChat`, `upsertParticipant`).
- `src/modules/chats/chats.service.ts` — reglas de negocio, serialización a DTOs, cálculo
  de `status` (sent/delivered/read), convert-to-task, resumen IA.
- `src/modules/chats/chats.controller.ts`, `chats.schema.ts` (Zod), `chats.routes.ts`.
- `src/middlewares/chat-membership.middleware.ts` — valida `ChatParticipant` activo.
- `src/services/file-storage.service.ts` — almacenamiento híbrido genérico (S3 / disco)
  parametrizado por `category` (`meetings/audio` | `chat/attachments`).
- `src/signaling/chat.signaling.ts` — handlers `chat:join/leave/typing`, rooms
  `user:<id>` / `chat:<id>`, emisor `emitChatEvent`.
- `src/signaling/presence.ts` — tracker global de presencia (multi-socket por usuario).

### Archivos modificados
- `src/services/audio-storage.service.ts` → ahora es un wrapper delgado de
  `file-storage.service.ts` (firma `storeAudio`/`readAudio`/`inferExtensionFromMime`
  intacta; el flujo de audio de reuniones no cambia).
- `src/modules/projects/projects.repository.ts` → `createProject` y `addMember` ahora
  crean/poblan el chat de grupo dentro de la misma transacción.
- `src/signaling/signaling.server.ts` → llama `registerChatHandlers(io)`.
- `src/services/ai-client.service.ts` → nuevo `summarizeChat()`.
- `src/config/env.ts` → `CHAT_UPLOAD_DIR`, `AWS_S3_CHAT_PREFIX`.
- `src/app.ts` → monta `chatsRouter` y sirve `/uploads/chat` (solo dev).

### Endpoints (todos bajo `/api/v1`)
`GET /chats`, `GET /chats/:chatId`, `GET|POST /chats/:chatId/messages`,
`PATCH|DELETE /chats/messages/:messageId`, `POST /chats/messages/:messageId/reactions`,
`PATCH /chats/:chatId/read`, `POST /chats/direct`,
`POST /chats/:chatId/attachments`, `GET /chats/attachments/:messageId` (proxy autenticado),
`POST /chats/messages/:messageId/convert-to-task`, `POST /chats/:chatId/summary`,
`GET /projects/:projectId/chat`.

> **Nota de orden de rutas:** las rutas literales (`/chats/direct`, `/chats/messages/*`,
> `/chats/attachments/*`) se declaran **antes** de `/chats/:chatId` para que el parámetro
> no las capture.

---

## 5. AI backend

- `app/api/v1/chat.py` — endpoint `POST /api/v1/chat-summary`.
- `app/schemas/chat.py` — `ChatSummaryRequest/Response`.
- `app/services/llm_service.py` — `summarize_chat()` (devuelve 3-5 viñetas, mismo patrón
  `_call_llm` + `_safe_parse_json` que el resto del servicio).
- `app/main.py` — registra el router.

---

## 6. Frontend

`features/chats/`: `chats.types.ts`, `chats.api.ts`, `chats.hooks.ts`, `useChatSocket.ts`,
`ChatLayout.tsx`, `ChatList.tsx`, `ChatWindow.tsx`, `MessageBubble.tsx`,
`MessageComposer.tsx`, `ConvertToTaskDialog.tsx`, `ChatSummaryDialog.tsx`.

Otros: `app/(dashboard)/chats/page.tsx` reemplazado por `<ChatLayout/>`;
botón **"Mensaje"** en `app/(dashboard)/people/page.tsx` → `useGetOrCreateDirectChat` +
navegación a `/chats?chatId=…`; namespace `chat.*` en `es.json` / `en.json`.

**Decisiones de diseño:**

- `ChatListItem`, `TypingIndicator` y `ReactionPicker` se integraron dentro de
  `ChatList`/`ChatWindow`/`MessageBubble` en lugar de archivos separados (menos
  superficie, misma funcionalidad).
- El "load older" paginado por cursor está soportado en backend
  (`?cursor=&limit=`) pero el cliente actualmente carga la última página (30) y recibe los
  mensajes nuevos por socket; cargar histórico hacia arriba quedó como mejora pendiente.
- Se mantuvo el lenguaje visual del mockup original (sidebar + burbujas + ✓✓).

---

## 7. Verificación end-to-end (API, 2 usuarios)

Prueba ejecutada contra el servidor real (`node dist/server.js`) con dos usuarios
registrados vía API:

| Caso | Resultado |
| --- | --- |
| Crear proyecto auto-crea su chat `PROJECT` con el creador | ✅ |
| `GET /chats` lista el chat del proyecto | ✅ |
| Enviar mensaje (status inicial `sent`) | ✅ |
| Convertir mensaje en tarea (crea Task + mensaje `SYSTEM`) | ✅ |
| Reacción con emoji | ✅ |
| `GET messages` incluye el mensaje `SYSTEM` | ✅ |
| Chat directo find-or-create + idempotencia (mismo id al repetir) | ✅ |
| El otro usuario ve el chat directo con `unreadCount = 1` | ✅ |
| Control de acceso: no-miembro → `403` en chat ajeno | ✅ |
| `PATCH /read` marca leído | ✅ |
| Agregar miembro al proyecto lo añade al chat de grupo | ✅ |
| Editar mensaje propio (setea `editedAt`) | ✅ |
| Guard de autor: editar mensaje ajeno → `403` | ✅ |
| Soft delete de mensaje propio | ✅ |

El tiempo real (sockets `chat:new-message`, `chat:typing`, `chat:read`,
`chat:presence`) está cableado en ambos extremos; su verificación funcional completa
requiere dos navegadores (prueba manual pendiente de marcar).

---

## 8. Cumplimiento de criterios de aceptación (plan §3)

- [x] Crear proyecto crea su chat de grupo; agregar miembro lo agrega al chat.
- [x] `/chats` lista chats de grupo y directos con último mensaje, hora y no leídos.
- [x] Abrir un chat carga historial y se suscribe a tiempo real.
- [x] Enviar mensaje persiste y emite por socket.
- [x] Indicador "escribiendo…" y presencia vía socket.
- [x] Estado de mensaje `sent → delivered → read`.
- [x] Reacciones y respuestas (reply).
- [x] "Convertir en tarea" crea Task en la primera columna y vincula el mensaje.
- [x] `npm run typecheck` (frontend) y `npm run build` (backend) pasan sin errores.

---

## 9. Pendiente / mejoras (stretch del plan, no bloqueantes)

- Carga de histórico hacia arriba (paginación por cursor en el cliente).
- Menciones `@usuario` con autocompletado.
- Mute por chat (`mutedUntil`) y mensajes fijados (`pinned`).
- Banner "Reconectando…" explícito ante caída del socket.
- Edición de mensaje desde la UI (el endpoint existe; el menú expone reply/convert/delete).
- Prueba manual con dos navegadores para el checklist de tiempo real (plan §11).

---

## 10. Notas operativas

```bash
# Backend
cd task_manager_back
npx prisma migrate dev          # ya aplicada: 20260615151005_add_chat_module
npx ts-node prisma/backfill-chats.ts   # idempotente, para proyectos previos
npm run build && npm start

# AI backend (resumen de chat)
cd task_manager_ai_back
uvicorn app.main:app --reload   # nuevo POST /api/v1/chat-summary

# Frontend
cd task_manager_front
npm run typecheck && npm run dev
```

Variables de entorno nuevas (opcionales, con defaults): `CHAT_UPLOAD_DIR`
(`./public/uploads/chat`), `AWS_S3_CHAT_PREFIX` (`chat/attachments`). Si S3 no está
configurado, los adjuntos van a disco local y se sirven por el proxy autenticado
`/api/v1/chats/attachments/:messageId` (la URL real nunca sale del backend).
