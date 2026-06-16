# Plan de Implementación — Agente de IA con RAG ("Project Copilot")

> Sprint 3 · Módulo de Agente Conversacional con Retrieval-Augmented Generation
> Un asistente que conoce **todo** el contexto de un proyecto: documentos, reuniones,
> minutas, tareas, sprints, chats y eventos futuros — y responde preguntas en lenguaje natural.

---

## 1. Visión y alcance

El objetivo es un **agente conversacional por proyecto** ("Project Copilot") al que cualquier
miembro pueda preguntarle, en español natural, cosas como:

- *"¿De qué se habló en la última reunión de planning?"*
- *"Resúmeme el documento de arquitectura."*
- *"¿Qué tareas están bloqueadas y de quién dependen?"*
- *"¿Qué decidimos sobre la base de datos en el chat del equipo la semana pasada?"*
- *"¿Qué reuniones tengo esta semana y qué debo preparar?"*
- *"¿Quién subió el último archivo al chat y de qué trata?"*
- *"Compara lo acordado en la minuta del lunes con el estado actual del Kanban."*

La clave del diseño: **el agente no es un chatbot genérico**. Es un agente con **RAG sobre
todo el dominio del proyecto** + **herramientas (tool-calling)** para datos estructurados y
en tiempo real (estado de tareas, reuniones futuras), con **aislamiento estricto por proyecto
y por permisos** (un usuario solo "ve" lo que ya puede ver en la app).

### Principio de diseño central: RAG híbrido (semántico + estructurado)

No todo se resuelve con búsqueda vectorial. Adoptamos un enfoque **híbrido**:

| Tipo de pregunta | Mecanismo |
| --- | --- |
| "¿Qué dice el documento X sobre Y?" (contenido no estructurado) | **RAG vectorial** (embeddings + pgvector) |
| "¿Qué tareas están en estado BLOQUEADO?" (datos estructurados, exactos, frescos) | **Tool-calling** → query Prisma en vivo |
| "¿Qué reuniones futuras tengo?" (datos temporales, exactos) | **Tool-calling** → query Prisma en vivo |
| "Resume el chat de hoy" | **Tool-calling** (trae mensajes recientes) + LLM |
| "¿De qué trata el proyecto en general?" | **RAG vectorial** sobre todo el corpus |

> **Por qué híbrido:** los embeddings son malos para "lo más reciente", conteos exactos,
> fechas y estados que cambian. El tool-calling es malo para "comprensión de contenido libre".
> Un agente serio combina ambos: el LLM decide qué herramienta usar (incluida "buscar en el
> índice RAG") y sintetiza la respuesta con citas a las fuentes.

---

## 2. Inventario de fuentes de conocimiento (lo que ya existe)

El proyecto ya tiene un dominio riquísimo en Postgres/Prisma. El agente se alimenta de:

| Fuente | Modelo Prisma | Naturaleza | Estrategia |
| --- | --- | --- | --- |
| Documentos colaborativos | `Document` / `DocumentVersion.plainText` | Texto largo | RAG (chunking + embeddings) |
| Minutas | `Minute` (summary, key_points) | Texto medio | RAG |
| Acuerdos | `Agreement` | Texto corto/estructurado | RAG + tool |
| Transcripciones de reunión | (en `Minute`/audio flow) | Texto muy largo | RAG (chunking agresivo) |
| Análisis Daily | `DailyAnalysis` / `DailyEntry` | Texto + estructura | RAG + tool |
| Tareas | `Task` (título, descripción, estado, responsable) | Estructurado | Tool-calling (vivo) + RAG (descripciones) |
| Sprints | `Sprint` (estado, health, fechas) | Estructurado | Tool-calling |
| Reuniones futuras | `Meeting` (fecha, status SCHEDULED) | Estructurado/temporal | Tool-calling |
| Mensajes de chat | `Message` | Texto corto, alto volumen | Tool-calling (recientes) + RAG (histórico) |
| Adjuntos de chat | `Message` (FILE/IMAGE) | Metadatos + contenido extraído | RAG (texto extraído de PDFs/docs) |
| Sugerencias de tarea | `TaskSuggestion` | Estructurado | Tool-calling |

> **Hallazgo clave:** `DocumentVersion.plainText` **ya guarda el texto plano** de cada versión
> del documento — fuente ideal y lista para chunking. No hace falta parsear el `contentState`
> (Bytes) del editor colaborativo para la v1.

---

## 3. Arquitectura

### 3.1 Vista general

```
┌─────────────────────────────────────────────────────────────────┐
│  FRONTEND (Next.js)                                                │
│  features/copilot/  →  CopilotPanel (chat UI con streaming + citas)│
└───────────────┬───────────────────────────────────────────────────┘
                │  POST /api/v1/projects/:id/copilot/ask  (SSE stream)
                ▼
┌─────────────────────────────────────────────────────────────────┐
│  BACKEND (Express / Prisma)  — Orquestador + control de acceso     │
│  modules/copilot/                                                  │
│   • auth + membership guard (reusa middleware existente)           │
│   • herramientas (tools) ejecutadas con permisos del usuario       │
│   • llama al AI backend para embeddings, retrieval y generación    │
│   • registra conversación (ConversationThread / ConversationMsg)   │
└──────┬───────────────────────────────────┬───────────────────────┘
       │ embeddings + retrieve + generate   │ tool results (Prisma)
       ▼                                     ▼
┌──────────────────────────┐        ┌──────────────────────────────┐
│ AI BACKEND (FastAPI)      │        │ PostgreSQL + pgvector         │
│ services/rag_service.py   │◄──────►│  Embedding (vector(N))        │
│ services/agent_service.py │        │   knowledge_chunk             │
│ services/embedding_svc.py │        └──────────────────────────────┘
└──────────────────────────┘
```

### 3.2 ¿Dónde vive cada cosa? (decisión arquitectónica)

- **El orquestador del agente vive en el backend Express**, no en FastAPI. Razón: el backend
  ya tiene Prisma, los middlewares de auth/membership y el conocimiento de permisos. Las
  *tools* (consultas a tareas, reuniones, chats) deben ejecutarse **con el contexto del usuario**
  para no filtrar datos. FastAPI no tiene acceso a Prisma ni a la sesión.
- **FastAPI es el "motor de IA"**: expone endpoints sin estado para (a) generar embeddings,
  (b) hacer retrieval semántico, (c) ejecutar el bucle de generación con tool-calling
  (recibe el catálogo de tools y devuelve "qué tool llamar" o el texto final). Reusa el patrón
  OpenAI-compatible que ya usa `llm_service.py` con DeepSeek.
- **pgvector sobre el Postgres existente** (no una BD vectorial aparte). Ya tenemos Postgres en
  docker-compose; añadir la extensión `pgvector` evita un servicio nuevo y permite **filtrar
  por `projectId` en el mismo WHERE** que la búsqueda vectorial (crítico para el aislamiento).

> **Alternativa considerada y descartada para v1:** Qdrant/Chroma como servicio aparte. Mejor
> rendimiento a gran escala, pero añade infra, sincronización y complejidad de permisos. Con el
> volumen de un proyecto académico/PyME, pgvector + un índice IVFFlat/HNSW sobra. Se deja como
> ruta de escalado futura.

### 3.3 Modelo de embeddings

- **Provider configurable**, igual que `AI_PROVIDER`/`TRANSCRIPTION_PROVIDER`:
  - `EMBEDDING_PROVIDER=openai` → `text-embedding-3-small` (1536 dims, barato, multilingüe).
  - `EMBEDDING_PROVIDER=local` → `sentence-transformers` (`paraphrase-multilingual-MiniLM-L12-v2`, 384 dims) o `bge-m3` vía Ollama/`fastembed`. Sin costo, corre en CPU.
- La dimensión del vector se fija al crear la columna `vector(N)`; un cambio de modelo implica
  re-indexar. Guardamos `model` y `dim` en cada fila para detectar inconsistencias.

---

## 4. Modelo de datos nuevo (Prisma + pgvector)

> pgvector no tiene tipo nativo en Prisma; se declara la tabla vía migración SQL y se mapea con
> `Unsupported("vector(1536)")` o se consulta con `prisma.$queryRaw`. Patrón estándar.

```prisma
model KnowledgeChunk {
  id           String   @id @default(uuid())
  projectId    String
  sourceType   KnowledgeSourceType   // DOCUMENT | MINUTE | MEETING | TASK | CHAT_MESSAGE | AGREEMENT | DAILY
  sourceId     String                // id de la entidad origen (documentId, minuteId, ...)
  chunkIndex   Int                   // orden dentro del documento fuente
  content      String                // texto del chunk (para mostrar como cita)
  tokenCount   Int
  // embedding   Unsupported("vector(1536)")   // gestionado vía SQL raw
  embeddingModel String
  metadata     Json?                 // { title, authorId, createdAt, url, sprintId, ... }
  contentHash  String                // para dedupe / detección de cambios
  createdAt    DateTime @default(now())

  project      Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId, sourceType])
  @@index([sourceType, sourceId])
  @@unique([sourceType, sourceId, chunkIndex])
}

enum KnowledgeSourceType {
  DOCUMENT
  MINUTE
  MEETING_TRANSCRIPT
  AGREEMENT
  TASK
  CHAT_MESSAGE
  DAILY_ANALYSIS
  ATTACHMENT
}

model ConversationThread {
  id         String   @id @default(uuid())
  projectId  String
  userId     String
  title      String?              // autogenerado del primer mensaje
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  messages   ConversationMessage[]
  project    Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user       User     @relation(fields: [userId], references: [id])

  @@index([projectId, userId])
}

model ConversationMessage {
  id         String   @id @default(uuid())
  threadId   String
  role       String               // "user" | "assistant" | "tool"
  content    String
  citations  Json?                // [{ sourceType, sourceId, title, chunkId, url }]
  toolCalls  Json?                // trazas de tools usadas (auditoría)
  createdAt  DateTime @default(now())
  thread     ConversationThread @relation(fields: [threadId], references: [id], onDelete: Cascade)

  @@index([threadId, createdAt])
}
```

Migración SQL adicional (no expresable en Prisma):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
ALTER TABLE "KnowledgeChunk" ADD COLUMN embedding vector(1536);
CREATE INDEX knowledge_chunk_embedding_idx
  ON "KnowledgeChunk" USING hnsw (embedding vector_cosine_ops);
-- El filtro por projectId va en el WHERE de cada query (aislamiento).
```

---

## 5. Pipeline de ingesta (indexing)

### 5.1 Estrategia de chunking

| Fuente | Chunking | Notas |
| --- | --- | --- |
| Documentos (`DocumentVersion.plainText`) | ~500–800 tokens, solapamiento 80, por párrafos | Re-indexar solo la última versión publicada |
| Minutas | summary completo + 1 chunk por key_point | Texto ya resumido, chunks pequeños |
| Transcripciones | ~800 tokens, solapamiento 120 | Incluir timestamps/hablante en metadata si existen |
| Acuerdos | 1 chunk por acuerdo | Atómicos |
| Tareas | 1 chunk: "título + descripción + estado + responsable" | Re-indexar al actualizar (estado cambia) → o solo título/desc, estado vía tool |
| Mensajes de chat | Agrupar en "ventanas" de N mensajes consecutivos por chat | Evita 1 chunk por mensaje (ruido); agrupar por hilo/tiempo |
| Adjuntos | Extraer texto (PDF/docx/txt) → chunk como documento | Reusar extractores; imágenes → opcional OCR/caption (futuro) |

Metadata por chunk: `{ title, sourceType, sourceId, authorId, authorName, createdAt, url (deep-link), sprintId? }`. El `url` permite que el frontend enlace la cita a la entidad real.

### 5.2 Cuándo se indexa (event-driven + batch)

**Estrategia híbrida:**

1. **Backfill inicial (batch):** script `prisma/index-knowledge.ts` (idempotente, como
   `backfill-chats.ts`) recorre todos los proyectos y entidades y encola su indexación.
2. **Incremental (event-driven):** *hooks* en los servicios existentes que ya mutan datos:
   - Al publicar una `DocumentVersion` → reindexar ese documento.
   - Al crear/cerrar una `Minute` / `Agreement` → indexar.
   - Al crear/editar/borrar `Task` → upsert/borrar chunk.
   - Mensajes de chat: **no** indexar en caliente (alto volumen); job periódico que indexa
     ventanas de mensajes "asentadas" (más de X min de antigüedad).
3. **Cola asíncrona:** la indexación no debe bloquear la request del usuario. Opciones por
   complejidad:
   - **v1 (simple):** tabla `IndexingJob` (status PENDING/DONE/FAILED) + worker en intervalo
     (`setInterval` o cron) — coherente con el patrón `DocumentConversionJob` que ya existe.
   - **futuro:** BullMQ/Redis si el volumen lo exige.

### 5.3 Detección de cambios

`contentHash` (SHA-256 del texto del chunk). Si el hash no cambió, no se re-embebe (ahorra
llamadas/costo). Si el documento fuente se borra (soft delete), se borran sus chunks.

---

## 6. Retrieval

Endpoint FastAPI `POST /api/v1/rag/retrieve`:

```
entrada: { projectId, query, topK, sourceTypes?[], filters? }
proceso:
  1. embed(query) con el mismo modelo de indexación
  2. SELECT ... FROM KnowledgeChunk
     WHERE projectId = $1 [AND sourceType = ANY($types)]
     ORDER BY embedding <=> $queryVec  LIMIT topK*3      (cosine distance)
  3. (opcional) re-ranking híbrido: combinar score vectorial con BM25/keyword
     (full-text search de Postgres) → mejora precisión en nombres propios/IDs
  4. (opcional v2) cross-encoder re-ranker para top resultados
salida: [{ chunkId, content, score, metadata }]
```

> **Búsqueda híbrida (vector + keyword):** Postgres ya soporta `tsvector`/`ts_rank`. Combinar
> ambos (Reciprocal Rank Fusion) mejora mucho preguntas con términos exactos (nombres de
> personas, IDs de tarea, siglas) donde el embedding solo falla. Recomendado desde v1 si el
> tiempo lo permite; si no, fase 2.

**El `projectId` en el WHERE es la barrera de seguridad principal.** Nunca se hace retrieval
sin él. Para chats directos / documentos con permisos restringidos, ver §8.

---

## 7. El agente: orquestación con tool-calling

El núcleo es un **bucle ReAct / tool-calling** (función `agent_service.run`). El LLM recibe:

- El **system prompt** (rol, idioma español, formato con citas, instrucción de citar fuentes).
- El **historial** del thread (memoria conversacional).
- El **catálogo de herramientas** (JSON schema, estilo OpenAI function-calling — DeepSeek lo
  soporta vía API compatible).

### 7.1 Catálogo de herramientas (tools)

Cada tool se **ejecuta en el backend Express con los permisos del usuario**:

| Tool | Descripción | Implementación |
| --- | --- | --- |
| `search_knowledge` | Búsqueda semántica en docs/minutas/transcripciones/chats | → FastAPI `/rag/retrieve` |
| `list_tasks` | Tareas del proyecto filtrables por estado/responsable/sprint | Prisma (tasks.service) |
| `get_task` | Detalle de una tarea | Prisma |
| `list_meetings` | Reuniones pasadas/futuras, filtrables por fecha/tipo | Prisma (meetings.service) |
| `get_meeting_minute` | Minuta + acuerdos de una reunión | Prisma |
| `list_documents` | Documentos del proyecto (títulos, fechas, autor) | Prisma |
| `get_chat_messages` | Mensajes recientes de un chat (group/direct accesible) | Prisma (respeta ChatParticipant) |
| `get_sprint_status` | Sprint actual, health, progreso | Prisma + dashboard.service |
| `get_calendar` | Próximos eventos (reusa `/dashboard/calendar`) | Prisma |

> **Outside the box:** el agente no solo *lee*. Se pueden añadir tools de **acción** (con
> confirmación humana): `create_task_from_conversation`, `schedule_meeting`,
> `draft_message_to_chat`. Reusan la lógica ya existente (`convert-to-task`, creación de
> meetings). Para v1 se dejan en modo "propuesta" (el agente sugiere, el usuario confirma en UI)
> para evitar acciones no deseadas.

### 7.2 Bucle del agente

```
1. Usuario pregunta → backend crea/continúa ConversationThread.
2. Backend arma payload: system + historial + tools + pregunta → POST FastAPI /agent/run.
3. FastAPI llama al LLM con tool-calling:
   a. Si el LLM pide una tool → FastAPI responde al backend "ejecuta tool X(args)".
   b. Backend ejecuta la tool con Prisma (permisos del usuario) → devuelve resultado.
   c. Se repite (multi-turn tool use) hasta que el LLM produce respuesta final.
4. Respuesta final + citas (chunkIds/sourceIds usados) → se guarda y se transmite (SSE).
```

> Para mantener FastAPI sin estado y el control de permisos en el backend, el **bucle de
> orquestación vive en el backend Express**; FastAPI expone una llamada "single-step" del LLM
> (`/agent/step`: dado mensajes+tools, devuelve el siguiente mensaje del LLM o la tool a
> llamar). El backend ejecuta tools y vuelve a llamar a `/agent/step`. Esto es lo más limpio
> dado dónde viven los permisos.

### 7.3 Streaming

Respuesta vía **SSE** (`text/event-stream`) desde el backend al frontend para experiencia tipo
ChatGPT. El backend hace streaming del texto final del LLM; las trazas de tools se emiten como
eventos de estado ("Buscando en documentos…", "Consultando tareas…").

---

## 8. Seguridad y aislamiento (crítico)

El mayor riesgo de un RAG empresarial es **filtración de datos entre proyectos/usuarios**.

1. **Filtro por `projectId` obligatorio** en todo retrieval y toda tool. El endpoint
   `/copilot/ask` pasa por el `membership.middleware` existente: el usuario debe ser miembro
   activo del proyecto.
2. **Permisos a nivel de fuente:**
   - Documentos con `DocumentPermission` restrictivo → al indexar, guardar el nivel de acceso
     en metadata; al hacer retrieval, filtrar por los permisos del usuario que pregunta.
   - Chats directos (`ChatType.DIRECT`) → **no** se indexan en el corpus de proyecto, o se
     indexan con `participantIds` en metadata y se filtran por el usuario. Por privacidad,
     recomendación v1: **excluir chats directos** del corpus; el agente solo accede a chats de
     grupo del proyecto vía tool `get_chat_messages` (que ya respeta `ChatParticipant`).
3. **Las tools ejecutan con la identidad del usuario** (no con un service account), reusando los
   guards existentes — imposible que el agente devuelva algo que el usuario no podría ver en la
   UI.
4. **Prompt-injection:** el contenido recuperado puede contener instrucciones maliciosas
   ("ignora tus reglas…"). Mitigación: delimitar claramente el contexto recuperado en el prompt,
   instruir al LLM a tratarlo como datos (no instrucciones), y no dar tools destructivas sin
   confirmación.
5. **Auditoría:** `ConversationMessage.toolCalls` + un `DocumentAuditLog`-style log registran
   qué se consultó. Reusa el patrón de auditoría ya presente en documentos.
6. **Rate limiting** en `/copilot/ask` (las llamadas LLM cuestan) — reusar `express-rate-limit`.

---

## 9. API nueva

### Backend (Express, bajo `/api/v1`)

```
POST   /api/v1/projects/:projectId/copilot/ask          — pregunta (SSE stream); crea/continúa thread
GET    /api/v1/projects/:projectId/copilot/threads      — historial de conversaciones del usuario
GET    /api/v1/copilot/threads/:threadId                — mensajes de un thread
DELETE /api/v1/copilot/threads/:threadId                — borrar conversación
POST   /api/v1/projects/:projectId/copilot/reindex      — (admin) forzar re-indexación
GET    /api/v1/projects/:projectId/copilot/index-status — estado del índice (#chunks, última sync)
```

Estructura del módulo (sigue el patrón del repo `routes → controllers → services → repositories`):

```
src/modules/copilot/
  copilot.routes.ts
  copilot.controller.ts        (Zod schemas para validar)
  copilot.service.ts           (orquestación del bucle agente + tools)
  copilot.repository.ts        (ConversationThread/Message via Prisma)
  copilot.schema.ts
  tools/                        (una función por tool, reusan services existentes)
    index.ts                    (catálogo + JSON schemas)
  indexing/
    indexing.service.ts         (chunking + llamadas a embeddings)
    indexing.worker.ts          (cola IndexingJob)
    sources/                    (un adaptador por fuente: document, minute, task, chat, ...)
```

### AI backend (FastAPI, bajo `/api/v1`)

```
POST /api/v1/embeddings        — { texts[] } → { vectors[], model, dim }
POST /api/v1/rag/retrieve      — búsqueda semántica (recibe queryVec o texto) 
POST /api/v1/agent/step        — un paso del LLM con tool-calling
```

Nuevos servicios FastAPI: `embedding_service.py`, `rag_service.py`, `agent_service.py`. Reusan el
patrón de `llm_service.py` (cliente OpenAI-compatible, provider configurable, parsing JSON).

> Nota: el retrieval puede hacerse **directamente desde el backend** con `$queryRaw` y pgvector
> (el backend ya tiene Prisma), pidiendo solo el embedding de la query a FastAPI. Esto ahorra un
> salto de red y mantiene la query SQL (con su filtro de seguridad `projectId`) en el backend.
> **Decisión recomendada:** embeddings en FastAPI; la query vectorial SQL en el backend.

---

## 10. Frontend

```
features/copilot/
  copilot.api.ts        (fetch SSE a /copilot/ask, threads CRUD)
  copilot.hooks.ts      (useAskCopilot con streaming, useThreads)
  copilot.types.ts
  CopilotPanel.tsx      (panel lateral o página)
  CopilotMessage.tsx    (render markdown + citas clicables → deep-link a doc/tarea/minuta)
  CopilotComposer.tsx
```

- **Punto de entrada:** botón flotante "Pregúntale al proyecto" en `projects/[projectId]`, y/o
  página `app/(dashboard)/projects/[projectId]/copilot`.
- **Citas:** cada respuesta muestra las fuentes ("📄 Documento de arquitectura", "📝 Minuta del
  10/06") enlazadas a la entidad real → confianza y verificabilidad.
- **Streaming** con `EventSource`/fetch-stream para respuesta incremental.
- Reusa shadcn/ui + el estilo del chat existente (`MessageBubble`).

---

## 11. Configuración (env nuevas)

```
# AI backend (config.py)
EMBEDDING_PROVIDER=openai          # openai | local
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=1536
OPENAI_API_KEY=...                 # ya existe para whisper
LOCAL_EMBEDDING_MODEL=paraphrase-multilingual-MiniLM-L12-v2
RAG_TOP_K=8
RAG_HYBRID=true

# Backend (.env)
COPILOT_MAX_TOOL_ITERATIONS=6      # tope del bucle ReAct
COPILOT_RATE_LIMIT_PER_MIN=20
```

`requirements.txt` (AI): añadir `pgvector`, `sentence-transformers`/`fastembed` (si local),
`tiktoken` (conteo de tokens para chunking). `docker-compose`: usar imagen `pgvector/pgvector`
en lugar de `postgres` plano (o instalar la extensión).

---

## 12. Plan por fases (entregables incrementales)

### Fase 0 — Infraestructura (1–2 días)
- [ ] Cambiar Postgres a imagen con `pgvector`; migración `CREATE EXTENSION vector`.
- [ ] Modelos Prisma: `KnowledgeChunk`, `ConversationThread`, `ConversationMessage`, `IndexingJob`, enum.
- [ ] Migración SQL para la columna `vector` + índice HNSW.
- [ ] FastAPI: `embedding_service.py` + endpoint `/embeddings` (provider configurable).

### Fase 1 — Ingesta + retrieval básico (3–4 días)
- [ ] `indexing.service.ts` + adaptadores de **documentos y minutas** (las fuentes de mayor valor).
- [ ] Script backfill idempotente `index-knowledge.ts`.
- [ ] Cola `IndexingJob` + worker.
- [ ] Retrieval vectorial vía `$queryRaw` (filtro `projectId`).
- [ ] **Demo medible:** endpoint de prueba "retrieve" devuelve chunks correctos por proyecto.

### Fase 2 — Agente conversacional (RAG puro) (3–4 días)
- [ ] FastAPI `/agent/step` con tool-calling (solo tool `search_knowledge`).
- [ ] Backend `copilot.service` con el bucle + persistencia de threads.
- [ ] Endpoint `/copilot/ask` con SSE + citas.
- [ ] Frontend `CopilotPanel` con streaming y citas clicables.
- [ ] **Demo:** "¿Qué dice el documento X?", "resume la minuta del lunes".

### Fase 3 — Tools estructuradas (datos en vivo) (3–4 días)
- [ ] Tools: `list_tasks`, `list_meetings` (futuras), `get_sprint_status`, `get_calendar`,
      `get_chat_messages`, `get_meeting_minute`.
- [ ] Indexación incremental event-driven (hooks en tasks/documents/minutes).
- [ ] **Demo:** "¿qué tareas están bloqueadas?", "¿qué reuniones tengo esta semana?", "¿de qué
      se habló en el chat hoy?".

### Fase 4 — Calidad y "outside the box" (continuo)
- [ ] Búsqueda híbrida (vector + full-text RFC) y/o re-ranking.
- [ ] Indexación de **adjuntos de chat** (extracción de texto de PDFs/docx).
- [ ] Tools de acción con confirmación (`create_task`, `schedule_meeting`).
- [ ] Resúmenes proactivos: "digest" semanal del proyecto, alertas de tareas en riesgo.
- [ ] Memoria de usuario entre conversaciones.

---

## 13. Evaluación y calidad

- **Conjunto dorado:** 20–30 preguntas con respuesta esperada por proyecto de prueba.
- **Métricas de retrieval:** recall@k, MRR (¿el chunk correcto está en el top-k?).
- **Métricas de generación:** *faithfulness* (¿la respuesta se apoya en las citas?), ausencia de
  alucinación (el agente debe responder "no encontré información sobre eso" cuando aplique).
- **Tests de aislamiento (seguridad):** verificar que un usuario del proyecto A nunca recibe
  contenido del proyecto B, ni de chats donde no participa. **Test obligatorio.**
- Reusar `pytest` (AI) y los tests del backend.

---

## 14. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Filtración de datos entre proyectos/usuarios | Filtro `projectId` + tools con permisos + tests de aislamiento |
| Costo de embeddings/LLM | `contentHash` (no re-embeber), provider local opcional, rate limiting |
| Latencia (CPU embeddings/transcripción) | Indexación asíncrona; embeddings batch; `text-embedding-3-small` (rápido) |
| Alucinaciones | Prompt con citas obligatorias; "no sé" permitido; faithfulness eval |
| Prompt injection desde contenido | Delimitar contexto como datos; sin tools destructivas autónomas |
| Datos obsoletos en el índice | Indexación event-driven + `index-status` visible; reindex manual |
| Migración pgvector en Postgres existente | Probar en docker; la extensión es estándar y estable |

---

## 15. Resumen ejecutivo

Construimos un **agente híbrido RAG + tool-calling, por proyecto, con aislamiento por permisos**:

- **pgvector** sobre el Postgres existente para el índice semántico (docs, minutas,
  transcripciones, chats históricos, adjuntos).
- **Tools en vivo** (Prisma, con permisos del usuario) para datos exactos y temporales (tareas,
  sprints, reuniones futuras, chats recientes).
- **Orquestación en el backend Express** (donde viven Prisma y los permisos); **FastAPI como
  motor de IA sin estado** (embeddings + pasos del LLM), reusando el patrón provider-configurable
  que ya existe.
- **Frontend** con panel conversacional, streaming y **citas verificables** enlazadas a las
  entidades reales.

Entregable mínimo viable al final de la Fase 2; producto completo al final de la Fase 3; mejoras
"outside the box" (acciones, digests proactivos, adjuntos, híbrido) en la Fase 4.
