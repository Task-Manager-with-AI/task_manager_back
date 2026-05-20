# Plan de mejora — Kanban personalizable

**Estado:** Implementado (Sprint Kanban v2)

---

## 1. Objetivo

Por **proyecto**, cada equipo puede:

1. **Renombrar** columnas (ej. "Por hacer" en lugar de "Pendiente").
2. **Agregar, reordenar y eliminar** columnas (mín. 1, máx. 8).
3. **Crear tareas** desde el tablero con los mismos campos que en el detalle del proyecto.
4. Disfrutar de un tablero con **mejor UI/UX** y **fondo en gradiente** en claro y oscuro.

**Persistencia:** backend por proyecto (sincronizado entre usuarios).

---

## 2. Modelo de datos

### `KanbanColumn`

- `id`, `projectId`, `title`, `position`, `color` (token opcional)
- Relación con `Task` vía `columnId`

### `Task`

- `columnId` reemplaza el enum `TaskStatus`
- Migración: 3 columnas default por proyecto (`Pending`, `In Progress`, `Done`)

---

## 3. API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/v1/projects/:id/kanban/columns` | Columnas ordenadas + conteo de tareas |
| `PUT` | `/api/v1/projects/:id/kanban/columns` | Layout atómico (1–8 columnas) |
| `PATCH` | `/api/v1/tasks/:id/column` | Mover tarea a `columnId` |
| `POST` | `/api/v1/projects/:id/tasks` | Acepta `columnId` opcional |

---

## 4. Frontend

- `features/kanban/` — `kanban.api.ts`, `kanban.hooks.ts`, `kanban.types.ts`
- `KanbanBoard` — columnas dinámicas, scroll horizontal, gradiente
- `KanbanColumnSettingsSheet` — configuración de columnas
- `CreateTaskDialog` — creación desde cada columna
- `TaskDetailModal` — detalle al clic en tarjeta

---

## 5. Checklist de pruebas

- [ ] Proyecto nuevo llega con 3 columnas default.
- [ ] Renombrar columna persiste tras recargar.
- [ ] Agregar 4.ª columna; arrastrar tarea; eliminar columna vacía.
- [ ] Eliminar columna con tareas bloquea con mensaje claro.
- [ ] Crear tarea desde columna personalizada aparece en esa columna.
- [ ] Gradiente visible en claro y oscuro.
- [ ] Tabla de tareas en detalle de proyecto muestra nombre de columna.

---

## 6. Referencia de archivos

**Backend:** `prisma/schema.prisma`, `src/modules/kanban/*`, `src/modules/tasks/*`, `src/shared/kanban/defaults.ts`

**Frontend:** `features/kanban/*`, `features/tasks/*`, `app/(dashboard)/projects/[projectId]/kanban/page.tsx`
