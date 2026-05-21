# Guía de pruebas — IA Expandida (Sprint 2 v2)

> **Fecha:** Mayo 2026  
> **Alcance:** Detección de tipo de reunión, análisis de Daily Scrum (bloqueos e impedimentos), análisis de Sprint Planning y actualización automática del Kanban.

---

## Tabla de contenidos

1. [Requisitos previos](#1-requisitos-previos)
2. [Nuevos endpoints del AI backend](#2-nuevos-endpoints-del-ai-backend)
3. [Flujo completo del pipeline](#3-flujo-completo-del-pipeline)
4. [Escenario A — Reunión tipo Daily Scrum](#4-escenario-a--reunión-tipo-daily-scrum)
5. [Escenario B — Reunión tipo Sprint Planning](#5-escenario-b--reunión-tipo-sprint-planning)
6. [Escenario C — Actualización automática del Kanban](#6-escenario-c--actualización-automática-del-kanban)
7. [Sidebar "Reuniones"](#7-sidebar-reuniones)
8. [Pruebas de API (curl)](#8-pruebas-de-api-curl)
9. [Solución de problemas](#9-solución-de-problemas)

---

## 1. Requisitos previos

| Servicio | Puerto | Estado esperado |
|----------|--------|-----------------|
| PostgreSQL | 5432 | Corriendo con `agile_ai_db` |
| Backend Node | 4000 | `npm run dev` en `task_manager_back/` |
| AI Backend FastAPI | 8000 | `uvicorn app.main:app --reload` en `task_manager_ai_back/` |
| Frontend Next.js | 3000 | `npm run dev` en `task_manager_front/` |

**Variables de entorno requeridas** (en `.env` del backend y AI backend):

```env
# task_manager_back/.env
AI_BACKEND_URL=http://localhost:8000

# task_manager_ai_back/.env (elige un proveedor)
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_LLM_MODEL=gpt-4o-mini
# o
AI_PROVIDER=local
OLLAMA_HOST=http://localhost:11434
OLLAMA_LLM_MODEL=llama3.1:8b
```

---

## 2. Nuevos endpoints del AI backend

Accede a la documentación interactiva: `http://localhost:8000/api/docs`

| Método | Ruta | Función |
|--------|------|---------|
| `POST` | `/api/v1/detect-type` | Detecta tipo de reunión: DAILY, SPRINT_PLANNING o REGULAR |
| `POST` | `/api/v1/analyze-daily` | Extrae respuestas de Daily Scrum + bloqueos por participante |
| `POST` | `/api/v1/analyze-sprint` | Extrae objetivo, historias y tareas de un Sprint Planning |
| `POST` | `/api/v1/detect-kanban-updates` | Detecta tareas completadas/bloqueadas mencionadas en la reunión |

### Nuevos endpoints del backend Node

| Método | Ruta | Función |
|--------|------|---------|
| `GET` | `/api/v1/meetings` | Lista todas las reuniones del usuario (todos los proyectos) |
| `GET` | `/api/v1/meetings/:id/daily` | Devuelve el análisis de Daily Scrum |
| `GET` | `/api/v1/meetings/:id/kanban-updates` | Lista actualizaciones de Kanban detectadas |

---

## 3. Flujo completo del pipeline

Cuando se finaliza una reunión (`PATCH /api/v1/meetings/:id/end`), el pipeline ejecuta en orden:

```
1. Transcribir audio (Whisper)
2. Detectar tipo de reunión (LLM)
3. Detectar actualizaciones de Kanban (LLM) → aplica automáticamente las DONE
4. Análisis específico por tipo:
   - DAILY        → analyze-daily → guarda DailyAnalysis + DailyEntry[]
   - SPRINT_PLANNING → analyze-sprint + generate-minutes → guarda Minute con tareas sugeridas
   - REGULAR      → generate-minutes + extract-suggestions → guarda Minute con acuerdos
5. Emite eventos Socket.IO:
   - meeting:kanban-updated
   - meeting:daily-ready      (solo DAILY)
   - meeting:minutes-ready    (SPRINT_PLANNING y REGULAR)
```

---

## 4. Escenario A — Reunión tipo Daily Scrum

### 4.1 Preparación

1. Crea un proyecto con al menos 3 miembros.
2. Crea una reunión con título que incluya "Daily" o "Standup" (ayuda a la detección).
3. Inicia la reunión y simula el audio con una herramienta TTS o grabación real.

### 4.2 Audio de prueba sugerido

Graba o sintetiza el siguiente texto y sube el archivo de audio:

```
Lucy: Buenos días equipo, empecemos el daily.
      Yo ayer terminé la integración del formulario de login.
      Hoy voy a trabajar en la pantalla de proyectos.
      No tengo impedimentos.

Juan: Ayer estuve investigando la librería de drag-and-drop.
       Hoy planeo implementar el Kanban básico.
       Tengo un problema: el entorno de Docker no me levanta correctamente,
       necesito ayuda de alguien del equipo.

Diego: Ayer revisé el diseño del dashboard.
        Hoy voy a conectar la API de tareas al frontend.
        Tengo un impedimento: esperando que María termine el Kanban para poder integrar.

Alvaro: Ayer estuve investigando la librería de drag-and-drop.
        Hoy voy a conectar la API de registro de usuarios al frontend.
        Tengo un impedimento: esperando que Diego termine los modelos de la base de datos.

John: Ayer estuve investigando la librería de Random Forest.
        Hoy voy a conectar la API de login al frontend.
        Tengo un impedimento: esperando que Diego termine el .
```

### 4.3 Verificar resultado

1. Navega a **Reuniones** en el sidebar → selecciona la reunión.
2. El badge de tipo debe mostrar **"Daily Scrum"**.
3. El estado debe cambiar a **"Procesada"** después del pipeline.
4. Debe aparecer la sección **"Detección"** con el botón **"Ver Bloques e Impedimentos"**.
5. Haz clic en el botón → debe llevar a `/projects/:id/meetings/:id/daily`.

### 4.4 Validar la página de Daily

La página debe mostrar:

- **Banner de salud del Sprint:**
  - 🟢 Verde = sin bloqueos
  - 🟡 Amarillo = bloqueos menores
  - 🔴 Rojo = bloqueos críticos
- **Tarjeta por participante** con:
  - Pregunta 1: "¿Qué hice ayer para contribuir al Sprint?"
  - Pregunta 2: "¿Qué voy a hacer hoy para contribuir al Sprint?"
  - Pregunta 3: "¿Veo algún impedimento?" → lista de bloqueos o ✅ sin impedimentos
- **Sección "Actualizaciones automáticas del Kanban"** (si se mencionaron tareas).

**Resultado esperado con el audio de ejemplo:**
- María: bloqueada (Docker no levanta)
- Carlos: bloqueada (esperando a María)
- Salud del Sprint: 🔴 Rojo
- Impedimentos del equipo: 2 bloqueos

---

## 5. Escenario B — Reunión tipo Sprint Planning

### 5.1 Audio de prueba sugerido

```
Lucy: Empecemos con la planificación del Sprint 3.
     El objetivo del sprint es tener el módulo de pagos funcionando al 100%.

Diego: Propongo las siguientes historias de usuario:
      - Como usuario quiero pagar con tarjeta de crédito
      - Como usuario quiero ver mi historial de pagos
      - Como admin quiero gestionar los métodos de pago

Lucy: Para la primera historia, estimo 5 story points. Diego, ¿puedes encargarte?

Diego: Sí, me encargo. También hay que crear la integración con Stripe,
      calculo 8 puntos. Lo haré yo también.

Lucy: Perfecto. La historia del historial la tomo yo, son 3 puntos.
     Duración del sprint: 2 semanas, empezamos el lunes.
```

### 5.2 Verificar resultado

1. El tipo de reunión debe detectarse como **"Planeación de Sprint"**.
2. Al hacer clic en **"Ver minuta y sugerencias"**, la minuta debe mostrar:
   - Resumen que incluye el objetivo del sprint
   - Puntos clave con las historias de usuario listadas
   - Sugerencias de tareas con responsables asignados y story points en descripción

---

## 6. Escenario C — Actualización automática del Kanban

### 6.1 Configuración previa

1. En el proyecto, crea las siguientes tareas en el Kanban:
   - "Integración del formulario de login" → columna "En progreso"
   - "Revisión del diseño del dashboard" → columna "Pendiente"

2. Asegúrate de que el Kanban tenga una columna "Completado" (o similar) como la última columna.

### 6.2 Audio de prueba

Usa el audio del escenario A (Juan menciona que terminó la integración del login).

### 6.3 Verificar resultado

1. Después del pipeline, la tarea **"Integración del formulario de login"** debe haberse movido a la última columna del Kanban automáticamente.
2. En la página del Daily, en la sección **"Actualizaciones automáticas del Kanban"**, debe aparecer:
   - Tarea: "Integración del formulario de login"
   - Estado: **DONE** (Completada)
   - Mencionado por: Juan
   - Badge: **Aplicado** ✅

3. También puedes verificar vía API:
```bash
curl -X GET http://localhost:4000/api/v1/meetings/<meetingId>/kanban-updates \
  -H "Cookie: access_token=<tu_token>"
```

---

## 7. Sidebar "Reuniones"

### 7.1 Verificar acceso

1. En cualquier página del dashboard, el sidebar debe mostrar **"Reuniones"** con un ícono de video (entre "Mis tareas" y "Personas").
2. Al hacer clic, debe navegar a `/meetings`.

### 7.2 Página global de reuniones

La página `/meetings` muestra:
- Todas las reuniones de todos los proyectos del usuario.
- Badge de estado (Programada, En curso, Procesada, etc.).
- Badge de tipo (Daily Scrum, Planeación de Sprint, Reunión regular).
- Indicador de procesamiento cuando `status === "ENDED"`.
- Botón de navegación directo: va a la página apropiada según tipo y estado.

---

## 8. Pruebas de API (curl)

### Detectar tipo de reunión

```bash
curl -X POST http://localhost:8000/api/v1/detect-type \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Buenos días. Yo ayer terminé el login. Hoy haré el Kanban. No tengo impedimentos.",
    "meeting_title": "Daily Sprint 3",
    "participants": ["Juan", "María"],
    "language": "es"
  }'
```

**Respuesta esperada:**
```json
{
  "success": true,
  "message": "OK",
  "data": {
    "meeting_type": "DAILY",
    "confidence": 0.95,
    "reason": "Los participantes responden las 3 preguntas del daily scrum"
  }
}
```

### Analizar Daily

```bash
curl -X POST http://localhost:8000/api/v1/analyze-daily \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Juan: Ayer hice el login. Hoy haré el Kanban. No tengo bloqueos. María: Ayer investigué. Hoy implemento. Tengo un bloqueo: Docker no levanta.",
    "participants": ["Juan", "María"],
    "language": "es"
  }'
```

### Detectar actualizaciones de Kanban

```bash
curl -X POST http://localhost:8000/api/v1/detect-kanban-updates \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Juan terminó la tarea de integración del login ayer.",
    "existing_tasks": [
      {"id": "uuid-1", "title": "Integración del formulario de login", "column_title": "En progreso"},
      {"id": "uuid-2", "title": "Diseño del dashboard", "column_title": "Pendiente"}
    ],
    "language": "es"
  }'
```

### Obtener análisis Daily de una reunión procesada

```bash
curl http://localhost:4000/api/v1/meetings/<meetingId>/daily \
  -H "Cookie: access_token=<token>"
```

### Listar todas las reuniones del usuario

```bash
curl http://localhost:4000/api/v1/meetings \
  -H "Cookie: access_token=<token>"
```

---

## 9. Solución de problemas

| Síntoma | Causa probable | Solución |
|---------|---------------|----------|
| Badge de tipo siempre muestra "Reunión regular" | Proveedor IA no configurado en el AI backend | Configura `AI_PROVIDER=openai` con `OPENAI_API_KEY` o usa `AI_PROVIDER=local` con Ollama |
| No aparece sección "Detección" en la reunión | El tipo no se detectó como DAILY | Verifica el título del meeting o el contenido del audio |
| `GET /meetings/:id/daily` devuelve 400 | Reunión no es tipo DAILY | Verifica que `meetingType === "DAILY"` en la BD |
| Kanban updates aparece vacío | No se mencionaron tareas con nombre coincidente | El match es fuzzy vía LLM; usa nombres de tarea iguales o similares al mencionado en el audio |
| El tipo es REGULAR cuando debería ser DAILY | Transcripción poco clara | Asegúrate de que la transcripción contiene las palabras clave del daily |
| Pipeline falla con error 502 | AI backend no disponible | Verifica que FastAPI corre en puerto 8000 |

---

## Diagrama de flujo del pipeline expandido

```
Audio subido + PATCH /end
        │
        ▼
   Whisper transcribe
        │
        ▼
   LLM detecta tipo ──► REGULAR → minutes + suggestions
        │               SPRINT  → sprint analysis + minutes
        │               DAILY   → daily analysis (entries + blockers)
        │
        ▼
   LLM detecta Kanban updates
        │
        ▼
   Auto-aplica tasks DONE → última columna del Kanban
        │
        ▼
   Socket.IO notifica frontend
```
