# Sprint 2 — Extensión: Videoconferencia Integrada con Generación Automática de Minutas

**Fecha:** 2026-05-18  
**Complementa:** `sprint_2.md` (flujo base de minutas por texto/audio subido)

---

## Motivación

El Sprint 2 base permite subir un archivo de audio o texto de una reunión para que la IA genere minutas y sugiera tareas. Esta extensión elimina ese paso manual: el equipo realiza la videollamada **dentro de la aplicación**, el audio se extrae automáticamente al terminar, y el pipeline de IA se lanza sin intervención del usuario.

---

## Flujo Completo

```
Usuario crea reunión
       │
       ▼
Invita miembros del proyecto
       │
       ▼
Abre sala de videollamada (WebRTC peer-to-peer)
       │   MediaRecorder graba el audio durante toda la llamada
       ▼
Host termina la llamada
       │
       ▼
Audio blob se sube automáticamente al backend
       │
       ▼
Backend guarda audio en AWS S3 privado
       │   fallback local: public/uploads/audio/
       ▼
Backend → AI Service (FastAPI)
   1. Whisper API  →  transcripción de texto completa
   2. GPT-4o-mini  →  minutas estructuradas (resumen + puntos clave + acuerdos)
   3. GPT-4o-mini  →  sugerencias de tareas con responsable y prioridad
       │
       ▼
Socket.IO emite "meeting:minutes-ready" → frontend redirige automáticamente
       │
       ▼
Página de revisión: usuario acepta / rechaza / edita sugerencias
       │
       ▼
Sugerencias aceptadas → Tareas reales en el tablero Kanban del proyecto
```

---

## Tecnologías Clave

| Componente | Tecnología | Justificación |
|---|---|---|
| Videollamada | WebRTC (nativo del browser) | Sin dependencia de servicios externos |
| Señalización | Socket.IO (mismo backend Express) | Reutiliza infraestructura existente |
| Grabación de audio | MediaRecorder API (nativo del browser) | Sin librerías adicionales en frontend |
| Transcripción | OpenAI Whisper API (`whisper-1`) | Alta precisión, soporta español |
| Generación de minutas | OpenAI GPT-4o-mini | Bajo costo, suficiente para este caso |
| Extracción de tareas | OpenAI GPT-4o-mini con JSON mode | Salida estructurada confiable |

---

## Cambios por Servicio

### 1. Base de Datos — Nuevos modelos Prisma

**Archivo:** `task_manager_back/prisma/schema.prisma`

Nuevos enums:
- `MeetingStatus`: `SCHEDULED | IN_PROGRESS | ENDED | PROCESSED`
- `SuggestionStatus`: `PENDING | ACCEPTED | REJECTED | EDITED`

Nuevos modelos:

| Modelo | Descripción |
|---|---|
| `Meeting` | Reunión: título, proyecto, estado, audioUrl, timestamps |
| `MeetingParticipant` | Join table Meeting ↔ User con joinedAt / leftAt |
| `Minute` | Minuta generada: transcript, summary, keyPoints[] |
| `Agreement` | Acuerdo individual extraído de la minuta (ordenado) |
| `TaskSuggestion` | Sugerencia de tarea con estado y link opcional a Task creada |

Back-relations en modelos existentes (solo declaraciones, sin columnas nuevas):
- `User`: `meetingsCreated`, `meetingParticipations`, `suggestedTasks`
- `Project`: `meetings`
- `Task`: `taskSuggestion`

Migración: `npx prisma migrate dev --name add_meetings_minutes_suggestions`

---

### 2. Backend Node.js — Nuevos módulos y servicios

**Nuevos módulos en** `src/modules/`:

```
meetings/   → routes, controller, service, repository, schema
minutes/    → routes, controller, service, repository
suggestions/→ routes, controller, service, repository, schema
```

**Nuevos servicios en** `src/services/`:
- `ai-client.service.ts` — llama a los 3 endpoints del AI service via `fetch`
- `audio-storage.service.ts` — guarda blobs de audio/video en AWS S3 privado cuando esta configurado, o en disco local (`public/uploads/audio/`) como fallback de desarrollo

**Servidor Socket.IO en** `src/signaling/signaling.server.ts`:
- Se adjunta al `http.Server` en `src/server.ts` (único archivo existente modificado)
- Sala por reunión: `"meeting:{meetingId}"`
- Solo actúa como relay de SDP/ICE — no inspecciona el contenido

#### Tabla de Rutas Nuevas

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/v1/projects/:projectId/meetings` | Listar reuniones del proyecto |
| `POST` | `/api/v1/projects/:projectId/meetings` | Crear reunión e invitar miembros |
| `GET` | `/api/v1/meetings/:meetingId` | Detalle de reunión |
| `PATCH` | `/api/v1/meetings/:meetingId/start` | Marcar `IN_PROGRESS`, registrar `startedAt` |
| `POST` | `/api/v1/meetings/:meetingId/audio` | Subir blob de audio (multipart) |
| `PATCH` | `/api/v1/meetings/:meetingId/end` | Marcar `ENDED`, lanzar pipeline AI async |
| `GET` | `/api/v1/meetings/:meetingId/minutes` | Obtener minuta con acuerdos |
| `GET` | `/api/v1/minutes/:minuteId/suggestions` | Listar sugerencias de una minuta |
| `PATCH` | `/api/v1/suggestions/:id/accept` | Aceptar → crea `Task` en transacción Prisma |
| `PATCH` | `/api/v1/suggestions/:id/reject` | Rechazar sugerencia |
| `PATCH` | `/api/v1/suggestions/:id` | Editar sugerencia antes de aceptar |

#### Eventos Socket.IO

**Cliente → Servidor:**

| Evento | Payload |
|---|---|
| `meeting:join` | `{ meetingId }` |
| `meeting:leave` | `{ meetingId }` |
| `webrtc:offer` | `{ meetingId, targetUserId, sdp }` |
| `webrtc:answer` | `{ meetingId, targetUserId, sdp }` |
| `webrtc:ice-candidate` | `{ meetingId, targetUserId, candidate }` |
| `meeting:end` | `{ meetingId }` |

**Servidor → Cliente:**

| Evento | Payload |
|---|---|
| `meeting:room-state` | `{ participants: { userId, socketId, name }[] }` |
| `meeting:participant-joined` | `{ userId, socketId, name }` |
| `meeting:participant-left` | `{ userId }` |
| `webrtc:offer` / `webrtc:answer` / `webrtc:ice-candidate` | relay directo |
| `meeting:processing-started` | `{ meetingId }` |
| `meeting:minutes-ready` | `{ meetingId, minuteId }` |

**Nuevas dependencias:**
```
npm install socket.io multer
npm install -D @types/multer
```

**Variables de entorno nuevas:**
```
AI_BACKEND_URL=http://localhost:8000
AUDIO_UPLOAD_DIR=./public/uploads/audio
AWS_REGION=us-east-1
AWS_S3_BUCKET=gestionagil-331145994790-us-east-1-an
AWS_S3_AUDIO_PREFIX=meetings/audio
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Las variables AWS son opcionales. Si `AWS_REGION` y `AWS_S3_BUCKET` existen, el audio se guarda en S3 privado; si faltan, se usa `AUDIO_UPLOAD_DIR` como fallback local.

---

### 3. AI Backend (FastAPI) — Nuevos endpoints

**Nuevos archivos:**

```
app/core/config.py              — pydantic-settings (OPENAI_API_KEY)
app/services/whisper_service.py — transcripción con archivo temporal
app/services/llm_service.py     — generate_minutes() y extract_suggestions()
app/schemas/transcription.py
app/schemas/minutes.py
app/schemas/suggestions.py
app/api/v1/transcription.py     — POST /api/v1/transcribe
app/api/v1/minutes.py           — POST /api/v1/minutes
app/api/v1/suggestions.py       — POST /api/v1/suggestions
```

#### Contrato de Endpoints

**POST `/api/v1/transcribe`**

Input: `multipart/form-data`
```
audio_file: UploadFile   (webm/ogg/mp4 — output de MediaRecorder)
language: str = "es"
```

Output:
```json
{
  "success": true,
  "data": {
    "transcript": "Texto completo de la reunión...",
    "language": "es",
    "duration_seconds": 1842
  }
}
```

**POST `/api/v1/minutes`**

Input:
```json
{
  "transcript": "...",
  "meeting_title": "Sprint Review",
  "participants": ["Alice", "Bob"],
  "language": "es"
}
```

Output:
```json
{
  "success": true,
  "data": {
    "summary": "Resumen ejecutivo de 2-3 párrafos...",
    "key_points": ["Punto clave 1", "Punto clave 2"],
    "agreements": [
      { "order": 1, "text": "Deploy a staging el viernes" },
      { "order": 2, "text": "Alice revisa el PR antes del jueves" }
    ]
  }
}
```

**POST `/api/v1/suggestions`**

Input:
```json
{
  "agreements": ["Deploy a staging el viernes"],
  "project_members": [{ "id": "uuid-1", "name": "Alice" }],
  "language": "es"
}
```

Output:
```json
{
  "success": true,
  "data": {
    "suggestions": [
      {
        "title": "Deploy a staging",
        "description": "Realizar deploy del build actual al servidor de staging.",
        "priority": "HIGH",
        "suggested_responsible_id": "uuid-1"
      }
    ]
  }
}
```

**Nuevas dependencias (`requirements.txt`):**
```
openai==1.40.0
python-multipart==0.0.9
aiofiles==23.2.1
```

**Variable de entorno:** `OPENAI_API_KEY`

---

### 4. Frontend Next.js — Nuevas features y páginas

**Nuevas carpetas de features:**

```
features/meetings/
  meetings.types.ts   — Meeting, MeetingParticipant, Minute, Agreement, TaskSuggestion
  meetings.api.ts     — HTTP calls + uploadAudio() con FormData (fetch directo)
  meetings.hooks.ts   — useProjectMeetings, useCreateMeeting, useUploadAudio, ...

features/suggestions/
  suggestions.types.ts
  suggestions.api.ts
  suggestions.hooks.ts — useAcceptSuggestion invalida ["tasks", projectId]

features/video-call/
  useSignaling.ts     — socket.io-client, conecta/desconecta, maneja señalización
  useWebRTC.ts        — Map<userId, RTCPeerConnection>, streams en estado React
  VideoCallRoom.tsx   — composición full-screen
  VideoGrid.tsx       — CSS grid de tiles de video
  VideoTile.tsx       — tile individual con nombre y mute indicator
  CallControls.tsx    — mute audio, mute video, terminar llamada
  AudioRecorder.tsx   — componente oculto, MediaRecorder, sube al terminar
```

**Nuevas páginas:**

```
app/(dashboard)/projects/[projectId]/meetings/
  page.tsx                        — Lista de reuniones del proyecto
  new/
    page.tsx                      — Formulario crear reunión
  [meetingId]/
    page.tsx                      — Lobby: info + botón "Unirse a la llamada"
    room/
      layout.tsx                  — Layout sin sidebar (solo {children})
      page.tsx                    — VideoCallRoomPage
    minutes/
      page.tsx                    — MinutesPage: transcript + acuerdos + sugerencias
```

**Modificación a archivo existente:**  
`app/(dashboard)/projects/[projectId]/page.tsx` — agregar botón "Reuniones" junto al botón "Kanban" ya existente.

**Nueva dependencia:**
```
npm install socket.io-client
```

**Modificación a `next.config.mjs`:**  
Agregar rewrite para proxy Socket.IO:
```javascript
{ source: "/socket.io/:path*", destination: `${apiBase}/socket.io/:path*` }
```

#### Componentes de Revisión de Minutas (en `[meetingId]/minutes/page.tsx`)

```
MinutesSummary      — resumen y puntos clave (read-only)
AgreementsList      — lista ordenada de acuerdos
TaskSuggestionsList
  TaskSuggestionCard
    SuggestionEditForm (inline, react-hook-form + zod)
    AcceptButton     — llama api → invalida ["tasks", projectId] → Kanban se actualiza
    RejectButton
```

Redirect automático: al recibir `meeting:minutes-ready` por Socket.IO, el `room/page.tsx` ejecuta `router.push(`.../minutes`)`.

---

## Fases de Implementación

| Fase | Contenido | Esfuerzo estimado |
|---|---|---|
| 1 | Schema Prisma + módulos backend skeleton + Socket.IO signaling | 3–4 días |
| 2 | AI service endpoints (Whisper + GPT) | 2–3 días |
| 3 | Lógica de negocio backend + pipeline orquestado | 3–4 días |
| 4 | Frontend — feature meetings + páginas | 2–3 días |
| 5 | Frontend — videollamada WebRTC | 3–5 días |
| 6 | Frontend — revisión de minutas y sugerencias | 2–3 días |
| 7 | Integración end-to-end + casos edge | 2 días |

**Total estimado:** 17–24 días/persona

---

## Archivos Críticos

| Archivo | Cambio |
|---|---|
| `task_manager_back/prisma/schema.prisma` | +6 modelos nuevos |
| `task_manager_back/src/server.ts` | `app.listen` → `http.createServer` + Socket.IO |
| `task_manager_back/src/app.ts` | Mount de 3 nuevos routers |
| `task_manager_back/src/services/audio-storage.service.ts` | Storage S3 privado para audios/videos con fallback local |
| `task_manager_front/next.config.mjs` | Rewrite Socket.IO |
| `task_manager_front/app/(dashboard)/projects/[projectId]/page.tsx` | +botón "Reuniones" |
| `task_manager_ai_back/requirements.txt` | +3 dependencias |
| `task_manager_ai_back/app/main.py` | +3 routers registrados |

**Archivos existentes NO modificados:**  
`tasks.repository.ts` (importado desde suggestions.service, sin cambios), `lib/api-client.ts` (uploadAudio usa fetch directo con `credentials: "include"`), toda la feature `kanban/` (se actualiza automáticamente por invalidación de query cache).

---

## Puntos de Integración Críticos

1. **`server.ts`**: el único cambio en el bootstrap existente — `app.listen()` → `http.createServer(app)` para que Socket.IO comparta el mismo puerto.

2. **Sugerencia → Tarea**: `suggestions.service.ts` llama `tasksRepository.createTask()` en una transacción Prisma. El link `TaskSuggestion.taskId` es la trazabilidad.

3. **Kanban auto-update**: `useAcceptSuggestion()` invalida `["tasks", projectId]` — sin tocar nada de `features/kanban/`.

4. **Upload de audio**: usa `fetch` con `FormData` directamente (no `api-client`) porque `api-client` fuerza `Content-Type: application/json`, incompatible con multipart.

5. **Storage de audio**: `audio-storage.service.ts` sube el blob a S3 si existen `AWS_REGION` y `AWS_S3_BUCKET`; si faltan, usa `public/uploads/audio/`. La reunion guarda `audioUrl` como `s3://bucket/key` o `/uploads/audio/file`.

6. **Socket.IO en dev**: el cliente de videollamada conecta con el backend Node para senalizacion y usa cookies JWT con `withCredentials`.
