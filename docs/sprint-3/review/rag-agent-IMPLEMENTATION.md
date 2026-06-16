# Estado de implementación — Agente RAG ("Project Copilot")

> Acompaña a [`rag-agent-plan.md`](./rag-agent-plan.md). Resume **qué se construyó**,
> las **desviaciones** respecto al plan y **cómo ejecutarlo**.

## Resumen

Las fases 0–3 del plan están implementadas: infraestructura, ingesta + retrieval,
agente conversacional con tool-calling y SSE, herramientas estructuradas en vivo, e
indexación incremental event-driven. Backend (`tsc --noEmit`) y frontend
(`tsc --noEmit`) compilan sin errores; los tests unitarios de chunking pasan; la
migración fue aplicada a la BD y las tablas son consultables.

## Desviación clave: `pgvector` → `Float[]` nativo

La BD objetivo (`agile_ai_db`, Postgres local) **no tiene la extensión `vector`
disponible** (`CREATE EXTENSION vector` fallaría). Por eso:

- `KnowledgeChunk.embedding` se almacena como **`Float[]` nativo de Postgres**.
- La **similitud coseno se calcula en la capa de aplicación** (`knowledge.repository.ts`),
  escaneando los chunks del proyecto (filtrados por `projectId`). Es simple, sin
  dependencias y adecuado para corpus por-proyecto.
- **pgvector + HNSW queda como optimización futura** (ver plan §3.2): basta volver a
  `embedding vector(1536)` + índice HNSW y cambiar `retrieve()` a `<=>` cuando la
  extensión esté disponible y el volumen lo exija.

El resto del diseño se mantiene fiel al plan: orquestación en el backend Express,
FastAPI como motor de IA sin estado, aislamiento por `projectId`, citas verificables.

## Qué se construyó

### AI backend (FastAPI)
- `app/services/embedding_service.py` — embeddings provider-driven (`openai` | `local`).
- `app/services/agent_service.py` — un paso de tool-calling (DeepSeek/Ollama).
- `app/api/v1/embeddings.py` → `POST /api/v1/embeddings`.
- `app/api/v1/agent.py` → `POST /api/v1/agent/step`.
- `app/core/config.py` — `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIM`, etc.

### Backend (Express / Prisma)
- Modelos Prisma: `KnowledgeChunk`, `IndexingJob`, `ConversationThread`,
  `ConversationMessage` (+ enums) y migración `20260615160000_add_rag_copilot`.
- `src/modules/copilot/`:
  - `indexing/` — `chunking.ts`, `knowledge.repository.ts`, `indexing.service.ts`,
    `indexing.worker.ts`, `sources/` (document, minute, meeting-transcript, task, chat).
  - `retrieval.service.ts` — embed query + búsqueda semántica.
  - `tools/index.ts` — 8 herramientas: `search_knowledge`, `list_tasks`,
    `list_meetings`, `get_meeting_minute`, `list_documents`, `get_sprint_status`,
    `get_chat_messages`, `get_calendar`.
  - `copilot.{routes,controller,service,repository,schema}.ts` — bucle del agente + SSE.
- Hooks event-driven: minutas (`meetings.service`), tareas (`tasks.service`),
  documentos (`documents.service`). El chat se indexa por backfill/reindex.
- Worker de indexación arrancado en `server.ts`.
- Script idempotente `prisma/index-knowledge.ts` (`npm run copilot:index[:sync]`).

### Frontend (Next.js)
- `features/copilot/` — `copilot.{api,hooks,types}.ts`, `CopilotPanel.tsx`,
  `CopilotMessage.tsx` (citas clicables), `CopilotComposer.tsx`.
- Página `app/(dashboard)/projects/[projectId]/copilot/page.tsx`.
- Entrada en el sidebar (sub-item "Copiloto IA" por proyecto) + i18n es/en.

### API nueva
```
POST   /api/v1/projects/:projectId/copilot/ask            (SSE)
GET    /api/v1/projects/:projectId/copilot/threads
GET    /api/v1/copilot/threads/:threadId
DELETE /api/v1/copilot/threads/:threadId
POST   /api/v1/projects/:projectId/copilot/reindex
GET    /api/v1/projects/:projectId/copilot/index-status
```

## Configuración requerida

El **agente** usa el proveedor LLM existente (DeepSeek ya configurado). Los
**embeddings** necesitan uno de:

- `EMBEDDING_PROVIDER=openai` + `OPENAI_API_KEY` (por defecto, `text-embedding-3-small`), **o**
- `EMBEDDING_PROVIDER=local` + `pip install sentence-transformers` (CPU, multilingüe, sin costo).

`EMBEDDING_DIM` (AI backend) debe coincidir entre indexación y consulta (cambiar el
modelo implica reindexar). El backend no fija la dimensión en la columna (`Float[]`),
así que cambiar de modelo solo requiere `reindex`.

## Cómo ejecutarlo

```bash
# 1. (ya hecho) migración aplicada:  npx prisma migrate deploy
# 2. Configurar embeddings en task_manager_ai_back/.env (ver arriba)
# 3. Arrancar servicios:
cd task_manager_ai_back && uvicorn app.main:app --reload
cd task_manager_back   && npm run dev
cd task_manager_front  && npm run dev
# 4. Construir el índice de conocimiento (una vez):
cd task_manager_back && npm run copilot:index        # encola; el worker procesa
#   o, para indexar inline sin servidor:
cd task_manager_back && npm run copilot:index:sync
# 5. Abrir un proyecto → "Copiloto IA" en el sidebar y preguntar.
```

> Nota: tras los cambios de schema, reinicia el dev server del backend para que cargue
> el cliente Prisma regenerado.

## Seguridad / aislamiento (implementado)
- `membershipMiddleware` en todas las rutas project-scoped del copiloto.
- `projectId` obligatorio en todo retrieval y en cada tool.
- Chats directos **excluidos** del corpus; `get_chat_messages` solo accede al chat de
  grupo del proyecto y verifica que el usuario sea participante.
- Hilos de conversación accesibles solo por su dueño (`userId`).
- Rate limiting (20/min) en `/copilot/ask`.
- El contenido recuperado se trata como datos (mitigación de prompt-injection en el
  system prompt).

## Pendiente (Fase 4 / futuro)
- Búsqueda híbrida (vector + full-text) y re-ranking.
- pgvector + HNSW cuando esté disponible.
- Indexación de adjuntos (extracción de texto de PDFs/docx).
- Tools de acción con confirmación; digests proactivos.
- Tests de aislamiento e2e y conjunto dorado de evaluación.
