# Plan de despliegue — Sprint 3

> Guía para actualizar el entorno de producción con los cambios de Sprint 3:
> chat, copiloto RAG, notificaciones (in-app + Web Push), transcripción Groq y
> embeddings para el índice de conocimiento.

**Arquitectura actual (objetivo):**


| Componente             | Plataforma                 | Rol                                              |
| ---------------------- | -------------------------- | ------------------------------------------------ |
| `task_manager_front`   | Vercel                     | UI Next.js 14                                    |
| `task_manager_back`    | Render                     | API Express + Socket.IO + workers                |
| `task_manager_ai_back` | Render                     | FastAPI (transcripción, LLM, embeddings, agente) |
| PostgreSQL             | Supabase / Render Postgres | Base de datos compartida                         |


---

## 1. Resumen de cambios Sprint 3 a desplegar


| Área                | Cambio                                                                       | Impacto en despliegue                                            |
| ------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Transcripción**   | `TRANSCRIPTION_PROVIDER=groq` (ya no `local`)                                | `GROQ_API_KEY` en AI backend; `WHISPER_PRELOAD_ON_STARTUP=false` |
| **RAG / Copiloto**  | Nuevo módulo + tablas `KnowledgeChunk`, `IndexingJob`, hilos de conversación | Migración Prisma + embeddings en AI backend + reindex            |
| **Chat**            | Módulo de mensajería + Socket.IO                                             | Migración Prisma + `backfill-chats` si hay proyectos antiguos    |
| **Notificaciones**  | Persistencia + socket + Web Push                                             | Migración Prisma + claves VAPID en backend                       |
| **Dashboard Scrum** | Campos extra en sprints                                                      | Migración Prisma (si no estaba desplegada)                       |


---

## 2. Orden recomendado de despliegue

Ejecutar en este orden para evitar ventanas con schema desactualizado o workers sin API keys.

```
1. Base de datos
   └─ npx prisma migrate deploy   (contra DATABASE_URL de producción)

2. AI backend (Render)
   └─ Deploy con env actualizado (Groq + embeddings OpenAI recomendado)
   └─ Verificar GET https://<ai-host>/api/v1/health

3. Backend Node (Render)
   └─ Deploy con env actualizado (AI_BACKEND_URL, VAPID, FRONTEND_URL, …)
   └─ Verificar GET https://<api-host>/api/v1/health (si existe) o /api/docs

4. Seeders + indexación RAG (one-shot, desde tu máquina o shell de Render)
   └─ npm run prisma:seed
   └─ npm run seed:copilot          (demo del copiloto)
   └─ npm run copilot:index         (o copilot:index:sync si el worker no está listo)

5. Frontend (Vercel)
   └─ Redeploy con NEXT_PUBLIC_API_URL y NEXT_PUBLIC_COLLABORATION_URL correctos

6. Smoke test manual (checklist §8)
```

> **Tip:** Si el backend en Render ya está corriendo con `COPILOT_INDEXING_WORKER_ENABLED=true`,
> basta con `npm run seed:copilot` — el seed encola jobs y el worker los procesa. Usa
> `npm run copilot:index:sync` solo si necesitas indexar sin depender del servidor.

---

## 3. Migraciones Prisma

Aplicar **todas** las migraciones pendientes respecto a lo que ya está en producción.
Las de Sprint 3 (y dependencias cercanas) son:


| Migración                                    | Contenido                                           |
| -------------------------------------------- | --------------------------------------------------- |
| `20260614173055_add_sprint_dashboard_fields` | Campos de dashboard / sprints                       |
| `20260615151005_add_chat_module`             | Chat, mensajes, reacciones, participantes           |
| `20260615160000_add_rag_copilot`             | `KnowledgeChunk`, `IndexingJob`, hilos del copiloto |
| `20260616090000_add_notifications`           | `Notification`, `PushSubscription`, enums           |


Si producción nunca recibió el módulo de documentos colaborativos, también pueden faltar
migraciones anteriores (`20260521182546_add_collaborative_documents`, etc.). Revisa el
historial en `prisma/migrations/` y compara con `prisma migrate status`.

### Comando (desde `task_manager_back`, con `DATABASE_URL` de producción)

```bash
cd task_manager_back
npx prisma migrate deploy
npx prisma generate   # en local; en Render suele correr en postinstall
```

**En Render (shell one-off o pre-deploy):** exporta `DATABASE_URL` del servicio y ejecuta
el mismo `migrate deploy`. No uses `migrate dev` en producción.

---

## 4. Variables de entorno

### 4.1 AI backend (`task_manager_ai_back` — Render)

Referencia: `task_manager_ai_back/.env.example` y `render.yaml`.

#### Obligatorias (flujo actual)


| Variable                     | Valor producción | Notas                                                                        |
| ---------------------------- | ---------------- | ---------------------------------------------------------------------------- |
| `AI_PROVIDER`                | `deepseek`       | LLM para minutas, sugerencias y agente copiloto                              |
| `DEEPSEEK_API_KEY`           | `sk-…`           | [platform.deepseek.com](https://platform.deepseek.com/api_keys)              |
| `TRANSCRIPTION_PROVIDER`     | `groq`           | **Cambio Sprint 3** — ya no `local`                                          |
| `GROQ_API_KEY`               | `gsk_…`          | [console.groq.com](https://console.groq.com/keys) — tier gratuito disponible |
| `WHISPER_PRELOAD_ON_STARTUP` | `false`          | Evita cargar faster-whisper al arrancar (no se usa con Groq)                 |
| `DEFAULT_LANGUAGE`           | `es`             |                                                                              |


#### Embeddings RAG (nuevo — ver §5)


| Variable             | Recomendado en Render    | Notas                                               |
| -------------------- | ------------------------ | --------------------------------------------------- |
| `EMBEDDING_PROVIDER` | `openai`                 | Ver comparación local vs OpenAI en §5               |
| `EMBEDDING_MODEL`    | `text-embedding-3-small` | Con `openai`                                        |
| `EMBEDDING_DIM`      | `1536`                   | Debe coincidir con el backend Express               |
| `OPENAI_API_KEY`     | `sk-…`                   | Solo para embeddings si `EMBEDDING_PROVIDER=openai` |


#### Opcionales / no usar en Render con Groq


| Variable                      | Valor | Notas                                                                        |
| ----------------------------- | ----- | ---------------------------------------------------------------------------- |
| `LOCAL_WHISPER_`*             | —     | Ignoradas con `TRANSCRIPTION_PROVIDER=groq`                                  |
| `EMBEDDING_PROVIDER=local`    | —     | Requiere `sentence-transformers` + RAM/CPU; no recomendado en Render starter |
| `OPENAI_API_KEY` para Whisper | —     | Solo si cambias a `TRANSCRIPTION_PROVIDER=openai`                            |


---

### 4.2 Backend Node (`task_manager_back` — Render)

Referencia: `task_manager_back/.env.example` y `src/config/env.ts`.

#### Obligatorias


| Variable         | Ejemplo                      | Notas                                   |
| ---------------- | ---------------------------- | --------------------------------------- |
| `NODE_ENV`       | `production`                 |                                         |
| `DATABASE_URL`   | `postgresql://…`             | Misma BD que migraciones                |
| `JWT_SECRET`     | ≥ 32 caracteres              | Si cambia, invalida sesiones            |
| `FRONTEND_URL`   | `https://tu-app.vercel.app`  | CORS + cookies cross-origin             |
| `AI_BACKEND_URL` | `https://tu-ai.onrender.com` | URL pública del FastAPI (sin `/api/v1`) |


#### Sprint 3 — Copiloto RAG


| Variable                          | Valor  | Notas                                              |
| --------------------------------- | ------ | -------------------------------------------------- |
| `EMBEDDING_DIM`                   | `1536` | Igual que AI backend cuando usas OpenAI embeddings |
| `COPILOT_INDEXING_WORKER_ENABLED` | `true` | Worker en background al arrancar el servidor       |
| `COPILOT_INDEXING_POLL_MS`        | `5000` | (opcional)                                         |
| `RAG_TOP_K`                       | `8`    | (opcional)                                         |
| `COPILOT_MAX_TOOL_ITERATIONS`     | `6`    | (opcional)                                         |


#### Sprint 3 — Notificaciones


| Variable                     | Valor                           | Notas                                                    |
| ---------------------------- | ------------------------------- | -------------------------------------------------------- |
| `VAPID_PUBLIC_KEY`           | ver §6                          | Sin estas claves, in-app funciona; push del navegador no |
| `VAPID_PRIVATE_KEY`          | ver §6                          |                                                          |
| `VAPID_SUBJECT`              | `mailto:soporte@tu-dominio.com` | Identificador del emisor push                            |
| `NOTIF_JOBS_ENABLED`         | `true`                          | Recordatorios de reuniones / vencimientos                |
| `NOTIF_MEETING_REMINDER_MIN` | `15`                            | (opcional)                                               |


#### Cookies cross-domain (Vercel + Render)

Con frontend y backend en dominios distintos, el backend debe emitir la cookie JWT con
`Secure` y `SameSite=None`. Verifica que tu código de auth en producción ya lo hace
(criterio habitual al desplegar este stack).

#### Almacenamiento de archivos (Render)

El disco de Render es **efímero**. Para audio de reuniones, adjuntos de chat y assets
de documentos en producción, configura S3:


| Variable                                     | Notas               |
| -------------------------------------------- | ------------------- |
| `AWS_REGION`, `AWS_S3_BUCKET`                | Bucket privado      |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` |                     |
| `AWS_S3_AUDIO_PREFIX`, `AWS_S3_CHAT_PREFIX`  | Prefijos opcionales |


#### Colaboración en documentos (Hocuspocus)

El servidor colaborativo arranca en `COLLABORATION_PORT` (por defecto `BACKEND_PORT + 1`).
Render solo expone **un puerto** por servicio web. Opciones:

1. Segundo servicio Render solo para colaboración (mismo repo, distinto start command), **o**
2. Aceptar que la edición colaborativa en tiempo real no esté disponible en prod hasta
  unificar el websocket en el puerto principal.

Configura en Vercel:

```env
NEXT_PUBLIC_COLLABORATION_URL=wss://<host-colaboracion>/collaboration
```

Si no tienes colaboración expuesta, la app sigue funcionando; los documentos se editan
en modo no colaborativo según `NEXT_PUBLIC_USE_PROSEMIRROR_EDITOR`.

---

### 4.3 Frontend (`task_manager_front` — Vercel)

Referencia: `task_manager_front/.env.example` y `README.md`.


| Variable                             | Ejemplo                              | Notas             |
| ------------------------------------ | ------------------------------------ | ----------------- |
| `NEXT_PUBLIC_API_URL`                | `https://tu-api.onrender.com/api/v1` | Incluye `/api/v1` |
| `NEXT_PUBLIC_COLLABORATION_URL`      | `wss://…/collaboration`              | Si aplica         |
| `COOKIE_NAME`                        | `access_token`                       | Igual que backend |
| `NEXT_PUBLIC_USE_PROSEMIRROR_EDITOR` | `true`                               | (opcional)        |


**VAPID:** el frontend **no** necesita `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. La clave pública
se obtiene del backend vía `GET /api/v1/notifications/push/vapid-public-key` cuando el
usuario activa push en ajustes.

---

## 5. Embeddings RAG: local vs OpenAI en producción

En local probablemente usas:

```env
EMBEDDING_PROVIDER=local
```

Eso carga `sentence-transformers` (`paraphrase-multilingual-MiniLM-L12-v2`, **384 dims**)
en CPU. Funciona bien en tu máquina pero en Render starter:

- Aumenta RAM y tiempo de arranque.
- El paquete no está en `requirements.txt` por defecto (línea comentada).
- Los vectores locales (384) **no son compatibles** con los indexados en OpenAI (1536).

### Recomendación para Render: `EMBEDDING_PROVIDER=openai`


| Criterio            | Local (`sentence-transformers`)    | OpenAI (`text-embedding-3-small`)                     |
| ------------------- | ---------------------------------- | ----------------------------------------------------- |
| API key             | No                                 | **Sí** — `OPENAI_API_KEY`                             |
| Velocidad en Render | Lenta (CPU, cold start del modelo) | Rápida (API)                                          |
| Costo               | $0                                 | Bajo (~$0.02 / 1M tokens; indexación demo ≈ centavos) |
| Dimensión           | 384                                | 1536 (`EMBEDDING_DIM=1536`)                           |
| Apto para demo      | Sí en local                        | **Sí en producción**                                  |


**¿Hace falta OpenAI solo para embeddings?** Sí, si eliges `openai` como proveedor de
embeddings. La misma `OPENAI_API_KEY` puede servir también si en el futuro cambias
transcripción a `TRANSCRIPTION_PROVIDER=openai`; hoy la transcripción usa **Groq**
(`GROQ_API_KEY`), independiente de OpenAI.

### Configuración AI backend (producción)

```env
EMBEDDING_PROVIDER=openai
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=1536
OPENAI_API_KEY=sk-...
```

### Configuración backend Express (producción)

```env
EMBEDDING_DIM=1536
```

### Tras cambiar de local → OpenAI

1. Desplegar AI backend con la nueva config.
2. **Reindexar todo** (los vectores antiguos no son intercambiables):

```bash
cd task_manager_back
npm run copilot:index:sync
# o POST /api/v1/projects/:projectId/copilot/reindex por proyecto
```

1. Verificar en UI: proyecto → Copiloto IA → preguntar algo del corpus demo.

---

## 6. Notificaciones Web Push (VAPID)

### Qué funciona sin VAPID

- Notificaciones **in-app** (campana, lista, socket `notification:new`).
- Persistencia y marcar como leídas.

### Qué requiere VAPID

- Push del **sistema operativo** con la pestaña cerrada (opt-in del usuario en Ajustes).

### Generar claves VAPID

Desde `task_manager_back`:

```bash
npx web-push generate-vapid-keys
```

Copia `publicKey` y `privateKey` a las variables del backend en Render:

```env
VAPID_PUBLIC_KEY=B…
VAPID_PRIVATE_KEY=…
VAPID_SUBJECT=mailto:soporte@tu-dominio.com
```

Redeploy del backend. El frontend ya registra `/sw.js` y consulta la clave pública al API.

### Verificación

1. Login en producción.
2. Ajustes → activar notificaciones push (aceptar permiso del navegador).
3. Con otra cuenta, generar un evento (mensaje de chat, asignación de tarea).
4. Con la primera cuenta offline / pestaña cerrada, debe llegar push del SO.

---

## 7. Transcripción con Groq

Configuración mínima en AI backend (alineada con `render.yaml`):

```env
TRANSCRIPTION_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_WHISPER_MODEL=whisper-large-v3-turbo
WHISPER_PRELOAD_ON_STARTUP=false
```

Flujo: frontend/backend sube audio → Express reenvía a FastAPI → Groq Whisper API.

**Backend Express:** mantener `AI_FETCH_TIMEOUT_MS` alto (default 900000 ms = 15 min) para
reuniones largas. Groq es mucho más rápido que Whisper local, pero el timeout generoso
no perjudica.

**Verificación:** iniciar reunión → subir audio → finalizar → minuta y sugerencias generadas.

---

## 8. Seeders para demo

### Scripts disponibles


| Comando                                | Archivo                  | Qué crea                      | Cuándo usarlo                           |
| -------------------------------------- | ------------------------ | ----------------------------- | --------------------------------------- |
| `npm run prisma:seed`                  | `prisma/seed.ts`         | Roles + **dashboard demo**    | Base mínima + demo general              |
| `npm run seed:copilot`                 | `prisma/seed-copilot.ts` | **InsightHub** (copiloto RAG) | Demo del agente IA                      |
| `npx ts-node prisma/backfill-chats.ts` | idempotente              | Chat grupal por proyecto      | Proyectos creados antes del módulo chat |
| `npm run copilot:index`                | encola jobs              | Índice RAG de todo            | Tras seed o datos nuevos                |
| `npm run copilot:index:sync`           | indexa inline            | Índice RAG sin worker         | CI / one-shot                           |


### Usuarios de prueba (ambos seeds)


| Email                | Contraseña  | Rol    |
| -------------------- | ----------- | ------ |
| `alex@example.com`   | `string123` | MEMBER |
| `maria@example.com`  | `string123` | MEMBER |
| `carlos@example.com` | `string123` | MEMBER |


### `prisma:seed` — demo dashboard / Kanban / reuniones

Crea **3 proyectos**:

- **E-commerce MVP** — sprint activo, ~18 tareas en Kanban, dailies y review programadas.
- **App Móvil FitTrack** — segundo proyecto con tareas y reuniones.
- **Portal Interno RRHH** — tercer proyecto.

**Ideal para demostrar:** dashboard, calendario, Kanban, listado de reuniones, asignación
de tareas, notificaciones de tareas/reuniones.

### `seed:copilot` — demo Copiloto RAG

Crea un proyecto **"InsightHub – Plataforma de Analítica"** con contenido en **todas** las
fuentes del RAG:

- Documentos con texto (PRD, arquitectura, etc.)
- Reuniones con minutas, acuerdos y transcripciones
- Tareas en varias columnas (incl. bloqueadas)
- Sprint activo
- Chat grupal del proyecto con mensajes realistas

Al final **encola jobs de indexación** (requiere AI backend con embeddings configurados
y worker del backend activo, o `copilot:index:sync` después).

**Ideal para demostrar:** Copiloto IA, citas verificables, herramientas del agente
(`search_knowledge`, `list_tasks`, `get_sprint_status`, etc.).

### Secuencia recomendada para una demo completa

```bash
cd task_manager_back

# 1. Roles + 3 proyectos (dashboard, kanban, reuniones)
npm run prisma:seed

# 2. Proyecto InsightHub + corpus RAG
npm run seed:copilot

# 3. Chats de proyectos antiguos (si la BD ya tenía proyectos sin chat)
npx ts-node prisma/backfill-chats.ts

# 4. Indexar (elige una opción)
npm run copilot:index          # con backend desplegado y worker ON
npm run copilot:index:sync     # one-shot desde CLI (AI_BACKEND_URL apuntando a prod)
```

**Login demo:** `alex@example.com` / `string123`.

**Rutas útiles en la demo:**


| Feature        | Ruta                                |
| -------------- | ----------------------------------- |
| Dashboard      | `/dashboard`                        |
| Kanban         | `/projects/<id>/kanban`             |
| Reuniones      | `/meetings`                         |
| Chat           | `/chats`                            |
| Copiloto       | `/projects/<insighthub-id>/copilot` |
| Notificaciones | campana en header + Ajustes (push)  |


---

## 9. Checklist de verificación post-despliegue

- [ ] `npx prisma migrate deploy` sin errores; `migrate status` limpio.
- [ ] AI health: `GET <AI_BACKEND_URL>/api/v1/health` → OK.
- [ ] Login desde Vercel con usuario seed.
- [ ] Kanban carga tareas (proyecto E-commerce).
- [ ] Chat en tiempo real entre dos usuarios.
- [ ] Copiloto responde con citas (proyecto InsightHub, tras indexación).
- [ ] Reunión + audio → minuta generada (Groq + DeepSeek).
- [ ] Notificación in-app al asignar tarea.
- [ ] (Opcional) Web Push con VAPID configurado.
- [ ] Subida de adjunto en chat / audio de reunión (S3 si disco local no persiste).

---

## 10. Troubleshooting


| Problema                                       | Causa probable                             | Acción                                                                    |
| ---------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| Copiloto sin resultados / respuestas vacías    | Índice vacío o embeddings fallando         | Revisar logs AI backend; `copilot:index:sync`; verificar `OPENAI_API_KEY` |
| Error 500 al indexar                           | `EMBEDDING_PROVIDER=openai` sin key        | Añadir `OPENAI_API_KEY` o cambiar a local solo en dev                     |
| Vectores incoherentes tras cambio de proveedor | Mezcla local (384) + OpenAI (1536)         | Reindexar completo; no mezclar proveedores                                |
| Transcripción falla                            | Falta `GROQ_API_KEY` o provider incorrecto | `TRANSCRIPTION_PROVIDER=groq` + key válida                                |
| Push no aparece                                | Sin VAPID o usuario no opt-in              | Variables VAPID + permiso navegador + `/sw.js` en Vercel                  |
| CORS / login falla                             | `FRONTEND_URL` incorrecta                  | URL exacta de Vercel (sin barra final)                                    |
| Cookie no persiste                             | Cross-domain sin `Secure`/`SameSite=None`  | Revisar auth cookies en producción                                        |
| Archivos desaparecen tras redeploy             | Disco efímero Render                       | Configurar S3                                                             |
| Edición colaborativa no conecta                | Puerto colaboración no expuesto            | Ver §4.2 colaboración                                                     |


---

## 11. Referencias internas

- RAG implementado: `[review/rag-agent-IMPLEMENTATION.md](../../review/rag-agent-IMPLEMENTATION.md)`
- Plan notificaciones: `[notifications-plan.md](./notifications-plan.md)`
- Guía Sprint 2 (reuniones / audio): `[../../sprint-2/GUIA_EJECUCION.md](../../sprint-2/GUIA_EJECUCION.md)`
- Render AI: `task_manager_ai_back/render.yaml`
- Env AI: `task_manager_ai_back/.env.example`
- Env backend: `task_manager_back/.env.example`

