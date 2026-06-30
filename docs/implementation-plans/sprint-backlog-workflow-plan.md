# Plan: Flujo Product Backlog → Sprint (estilo Jira)

## Contexto y objetivo

Actualmente las tareas se crean directamente sobre el tablero Kanban y se asignan a una columna al momento de crearlas. Esto no permite planificación por iteraciones.

El objetivo es implementar el flujo ágil completo:

```
Product Backlog → Sprint Backlog (Iteración) → Tablero Kanban (sprint activo) → Incremento
```

La tabla `Sprint` ya existe en la BD con campos `id, projectId, name, goal, startDate, endDate, status (PLANNED|ACTIVE|COMPLETED)`. Las tareas ya tienen `sprintId?` y `storyPoints`. Lo que falta es el módulo backend, el frontend y una migración menor de esquema.

---

## Estado actual del código

| Capa | Estado |
|------|--------|
| `prisma/schema.prisma` — `Sprint` | ✅ Existe, no usada |
| `prisma/schema.prisma` — `Task.sprintId` | ✅ Nullable, existe |
| `prisma/schema.prisma` — `Task.columnId` | ❌ NOT NULL — tareas no pueden existir sin columna |
| `src/modules/sprints/` | ❌ No existe |
| `features/sprints/` (frontend) | ❌ No existe |
| Kanban — filtro por sprint activo | ❌ Muestra todas las tareas del proyecto |
| `GET /projects/:id/tasks` | ❌ Sin filtro por sprint / backlog |

---

## Fase 0 — Migración de esquema Prisma

### Cambio necesario

`Task.columnId` debe ser nullable para que las tareas del **Product Backlog** no requieran columna Kanban.

**`prisma/schema.prisma`** — cambiar línea:

```diff
- columnId       String
+ columnId       String?
```

Relacionado: la FK a `KanbanColumn` ya tiene `@relation(...)` — Prisma actualizará la restricción automáticamente.

```bash
# Desde task_manager_back/
npx prisma migrate dev --name make_task_columnId_nullable
```

### Impacto en código existente

- `tasks.repository.ts → createTask()`: el parámetro `columnId` pasa a ser `string | undefined`
- `tasks.service.ts → createNewTask()`: si no hay `columnId` y la tarea es de backlog, no buscar primera columna
- `tasks.repository.ts → updateTaskColumn()`: sin cambio, sigue requiriendo columnId
- Kanban: las queries existentes de `findTasksByProject` ya ignoran tareas sin columna si se filtra por columna

---

## Fase 1 — Módulo Backend: `src/modules/sprints/`

Crear los 5 archivos del patrón del proyecto: `routes`, `controller`, `service`, `repository`, `schema`.

### 1.1 Rutas

```
GET    /api/v1/projects/:projectId/sprints          — listar sprints del proyecto
POST   /api/v1/projects/:projectId/sprints          — crear sprint (PLANNED)
GET    /api/v1/sprints/:sprintId                    — obtener sprint con tareas
PATCH  /api/v1/sprints/:sprintId                    — editar nombre/goal/fechas (solo PLANNED)
POST   /api/v1/sprints/:sprintId/start              — iniciar sprint (PLANNED → ACTIVE)
POST   /api/v1/sprints/:sprintId/complete           — completar sprint (ACTIVE → COMPLETED)
DELETE /api/v1/sprints/:sprintId                    — eliminar sprint (solo PLANNED, sin tareas)
PATCH  /api/v1/sprints/:sprintId/tasks              — asignar/desasignar tareas al sprint en bulk
```

Todas requieren `authMiddleware` + `membershipMiddleware`.

### 1.2 Schema Zod (`sprints.schema.ts`)

```typescript
export const createSprintSchema = z.object({
  name: z.string().min(1),
  goal: z.string().optional(),
  startDate: z.string().datetime({ offset: true }),
  endDate: z.string().datetime({ offset: true }),
})

export const updateSprintSchema = createSprintSchema.partial()

export const assignTasksSchema = z.object({
  taskIds: z.array(z.string().uuid()),
  action: z.enum(["add", "remove"]),
})
```

### 1.3 Lógica de negocio (service)

**`startSprint(sprintId, projectId)`**:
1. Verificar que el sprint está en `PLANNED`
2. Verificar que no hay otro sprint `ACTIVE` en el mismo proyecto → error 400
3. Obtener la primera `KanbanColumn` del proyecto (la de menor `position`)
4. Actualizar todas las tareas del sprint que tengan `columnId = null` → asignarles esa primera columna
5. Actualizar sprint a `ACTIVE`, guardar `startDate` si está en el futuro (usar la fecha actual)

**`completeSprint(sprintId, projectId)`**:
1. Verificar que el sprint está en `ACTIVE`
2. Obtener ID de la columna "Done" (última columna del proyecto por `position`)
3. Las tareas que ya están en la columna Done → dejarlas donde están (`completedAt` ya tiene valor)
4. Las tareas que NO están en Done → `sprintId = null, columnId = null` (vuelven al Product Backlog)
5. Actualizar sprint a `COMPLETED`

**`deleteSprint(sprintId)`**:
1. Solo si `PLANNED`
2. Si tiene tareas asignadas → error 400 (el usuario debe moverlas primero)

### 1.4 Repository — queries clave

```typescript
// Sprints del proyecto con conteo de tareas y puntos
findSprintsByProject(projectId: string)

// Sprint completo con tareas (incluye usuario responsable y columna)
findSprintWithTasks(sprintId: string)

// Sprint activo del proyecto (para Kanban)
findActiveSprint(projectId: string)

// Actualizar sprintId de múltiples tareas
assignTasksToSprint(taskIds: string[], sprintId: string | null)

// Tareas del Product Backlog (sprintId = null, columnId = null)
findBacklogTasks(projectId: string)
```

---

## Fase 2 — Actualizaciones en módulo Tasks (backend)

### 2.1 Crear tarea en Product Backlog

Modificar `createNewTask` en `tasks.service.ts`:

```typescript
// Si no viene columnId Y no viene sprintId → tarea de Product Backlog (columnId = null)
// Si viene sprintId pero no columnId → tarea de Sprint Backlog (columnId = null)
// Si viene columnId → comportamiento actual (tarea directo al Kanban)
```

Modificar `createTaskSchema` en `tasks.schema.ts`:

```diff
+ sprintId: z.string().uuid().optional(),
+ storyPoints: z.number().int().min(1).max(100).default(1),
```

### 2.2 Filtros en listado de tareas

Modificar `GET /projects/:projectId/tasks` para aceptar query params:

| Param | Valor | Significado |
|-------|-------|-------------|
| `scope` | `backlog` | Solo tareas sin sprint y sin columna |
| `scope` | `sprint` + `sprintId=<id>` | Tareas de ese sprint |
| `scope` | `kanban` | Solo tareas con columnId (sprint activo) |
| *(sin param)* | — | Todas las tareas (comportamiento actual) |

### 2.3 Mover tarea entre backlog y sprint

`PATCH /api/v1/tasks/:id` — añadir `sprintId` al `updateTaskSchema`:

```diff
+ sprintId: z.string().uuid().nullable().optional(),
```

---

## Fase 3 — Frontend: `features/sprints/`

Crear el módulo estándar del proyecto (tres archivos).

### 3.1 `sprints.types.ts`

```typescript
export type SprintStatus = "PLANNED" | "ACTIVE" | "COMPLETED"

export interface Sprint {
  id: string
  projectId: string
  name: string
  goal?: string
  startDate: string
  endDate: string
  status: SprintStatus
  createdAt: string
  updatedAt: string
  _count?: { tasks: number }
  totalPoints?: number
  completedPoints?: number
}

export interface SprintWithTasks extends Sprint {
  tasks: Task[]  // Task importado de tasks.types.ts
}
```

### 3.2 `sprints.api.ts`

Endpoints a consumir (usando `apiClient` con paths relativos `/api/v1/...`):

- `getProjectSprints(projectId)` → `GET /projects/:projectId/sprints`
- `getSprint(sprintId)` → `GET /sprints/:sprintId`
- `createSprint(projectId, dto)` → `POST /projects/:projectId/sprints`
- `updateSprint(sprintId, dto)` → `PATCH /sprints/:sprintId`
- `startSprint(sprintId)` → `POST /sprints/:sprintId/start`
- `completeSprint(sprintId)` → `POST /sprints/:sprintId/complete`
- `deleteSprint(sprintId)` → `DELETE /sprints/:sprintId`
- `assignTasks(sprintId, taskIds, action)` → `PATCH /sprints/:sprintId/tasks`

### 3.3 `sprints.hooks.ts`

Hooks TanStack Query:
- `useProjectSprints(projectId)` — lista sprints, `queryKey: ["sprints", projectId]`
- `useSprint(sprintId)` — sprint con tareas
- `useCreateSprint(projectId)` — mutation + invalidate `["sprints", projectId]`
- `useUpdateSprint()` — mutation
- `useStartSprint()` — mutation + invalidate `["sprints", projectId]` + `["tasks", projectId, "kanban"]`
- `useCompleteSprint()` — mutation
- `useDeleteSprint()` — mutation
- `useAssignSprintTasks()` — mutation

---

## Fase 4 — Frontend: Página de Backlog y Planificación

### Ruta nueva

`app/(dashboard)/projects/[projectId]/backlog/page.tsx`

Accesible desde la barra lateral del proyecto (junto a "Kanban", "Documentos", etc.).

### Layout de la página

```
┌─────────────────────────────────────────────────────────────────────┐
│  [Proyecto: Mi Proyecto]  > Backlog                                  │
├────────────────────────────────┬────────────────────────────────────┤
│  PRODUCT BACKLOG               │  ITERACIONES (sprints)             │
│  (tareas sin sprint)           │                                    │
│                                │  ┌─ Sprint 1 [ACTIVE] ──────────┐ │
│  [+ Nueva tarea]               │  │ Meta: Lanzar MVP             │ │
│                                │  │ 01 Jul – 15 Jul · 8 tareas   │ │
│  □ Tarea A          [M] 3pts   │  │ [Completar sprint]           │ │
│  □ Tarea B          [H] 5pts   │  └──────────────────────────────┘ │
│  □ Tarea C          [L] 1pt    │                                    │
│  □ Tarea D          [M] 2pts   │  ┌─ Sprint 2 [PLANNED] ─────────┐ │
│  ...                           │  │ Meta: Mejoras UX             │ │
│                                │  │ 16 Jul – 30 Jul · 3 tareas   │ │
│                                │  │ [Iniciar] [Editar] [Borrar]  │ │
│                                │  └──────────────────────────────┘ │
│                                │                                    │
│                                │  [+ Nueva iteración]              │
└────────────────────────────────┴────────────────────────────────────┘
```

### Interacciones

- **Crear tarea en backlog**: modal con `title, description, priority, storyPoints, responsibleId`. No requiere columnId ni sprintId.
- **Mover tarea al sprint**: checkbox en cada tarea del backlog → botón "Añadir a iteración" → selector de sprint PLANNED. Llama `PATCH /sprints/:id/tasks` con `action: "add"`.
- **Quitar tarea de sprint**: en el panel del sprint, cada tarea tiene botón para devolverla al backlog (`action: "remove"`).
- **Crear iteración**: modal con `name, goal, startDate, endDate`.
- **Iniciar sprint**: `POST /sprints/:id/start`. Solo habilitado si hay al menos 1 tarea en el sprint. Si ya hay un sprint activo → error mostrado al usuario.
- **Completar sprint**: `POST /sprints/:id/complete`. Confirmar con dialog que muestra cuántas tareas volverán al backlog.

### Estado de drag-and-drop (opcional, post-MVP)

Se puede añadir drag-and-drop con `@dnd-kit` (ya instalado) para arrastrar tareas entre backlog y sprint. Para el MVP es suficiente con checkboxes + botón.

---

## Fase 5 — Actualización del Tablero Kanban

El Kanban actualmente carga **todas** las tareas del proyecto con `GET /projects/:projectId/tasks`. Debe cambiar para mostrar solo las tareas del **sprint activo**.

### Cambio en el frontend (`features/kanban/` o página `kanban/page.tsx`)

1. Al cargar la página, primero obtener el sprint activo: `GET /projects/:projectId/sprints?status=ACTIVE`
2. Si hay sprint activo → cargar tareas de ese sprint: `GET /projects/:projectId/tasks?scope=kanban&sprintId=<id>`
3. Si no hay sprint activo → mostrar banner "No hay una iteración activa. Ve al Backlog para iniciar una."

### Cabecera del Kanban (nueva banda de información)

```
┌──────────────────────────────────────────────────────────────────┐
│ Iteración 2: "Mejoras UX"  │  15 Jul – 30 Jul  │  5/8 completadas │
└──────────────────────────────────────────────────────────────────┘
```

Componente `SprintBanner` encima del tablero. Muestra nombre, fechas, progreso y botón "Completar iteración" (solo para admins/creadores).

---

## Fase 6 — Página de Proyectos: Product Backlog e Incremento

### En `app/(dashboard)/projects/page.tsx`

Añadir dos botones en cada tarjeta de proyecto:

```
[Abrir]  [Backlog (12)]  [Incremento]
```

- **Backlog (N)**: navega a `/projects/[id]/backlog`. `N` = tareas sin sprint.
- **Incremento**: navega a `/projects/[id]/backlog?tab=increment`.

### Tab "Incremento" en la página de Backlog

Muestra todas las tareas con `completedAt != null` agrupadas por sprint completado:

```
✅ Sprint 1 — Completado el 15 Jun
   · Tarea X  (3pts)
   · Tarea Y  (2pts)
   Total: 5 pts entregados

✅ Sprint 2 — Completado el 30 Jun
   ...
```

---

## Fase 7 — Sidebar del proyecto: nuevo ítem de navegación

En el sidebar lateral de `/projects/[projectId]` (el componente que actualmente muestra Kanban, Documentos, Copilot, etc.) añadir:

```
📋 Backlog
```

Entre "Inicio del proyecto" y "Kanban".

Ruta: `/projects/[projectId]/backlog`

---

## Orden de implementación recomendado

| # | Paso | Archivo(s) clave |
|---|------|-----------------|
| 1 | Migración `columnId` nullable | `prisma/schema.prisma` + migrate |
| 2 | Backend: `sprints` module completo | `src/modules/sprints/*` |
| 3 | Backend: actualizar tasks (filtros + sprintId en create/update) | `tasks.service.ts`, `tasks.repository.ts`, `tasks.schema.ts` |
| 4 | Registrar rutas en `server.ts` | `src/server.ts` |
| 5 | Frontend: `features/sprints/` (types + api + hooks) | `features/sprints/*` |
| 6 | Frontend: página `/backlog` con backlog + panel de sprints | `app/(dashboard)/projects/[projectId]/backlog/page.tsx` |
| 7 | Frontend: actualizar Kanban para filtrar por sprint activo | `app/(dashboard)/projects/[projectId]/kanban/page.tsx` |
| 8 | Frontend: `SprintBanner` en el Kanban | `features/kanban/SprintBanner.tsx` |
| 9 | Frontend: botones en tarjetas de proyectos | `app/(dashboard)/projects/page.tsx` |
| 10 | Frontend: tab Incremento | `app/(dashboard)/projects/[projectId]/backlog/page.tsx` |
| 11 | Frontend: ítem Backlog en sidebar del proyecto | componente de navegación del proyecto |

---

## Consideraciones técnicas

### Reglas de negocio críticas

- Solo puede haber **un sprint ACTIVE por proyecto** a la vez.
- Un sprint no puede iniciarse si está vacío (0 tareas).
- Solo sprints en estado `PLANNED` pueden editarse o eliminarse.
- Al completar un sprint, las tareas sin terminar vuelven al backlog (`sprintId = null, columnId = null`).
- Las tareas del backlog (`columnId = null`) **no aparecen** en el Kanban.
- `storyPoints` se muestran en el backlog y sirven para calcular la velocidad del sprint.

### Sin cambios en el flujo de AI

Las tareas creadas vía `TaskSuggestion` (desde actas de reunión) siguen el flujo actual: se aceptan y van directamente a la primera columna Kanban. No se mueven al backlog automáticamente. Esto es intencional — las sugerencias aceptadas son urgentes y van al sprint activo.

### Compatibilidad hacia atrás

- Las tareas existentes con `columnId != null` y `sprintId = null` seguirán apareciendo en el Kanban (no se rompe nada).
- El endpoint `GET /projects/:projectId/tasks` sin parámetros sigue devolviendo todo (no se rompen llamadas existentes).
