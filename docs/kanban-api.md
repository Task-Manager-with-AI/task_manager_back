# Kanban API (v2)

Columnas personalizables por proyecto. Las tareas usan `columnId` en lugar del enum `TaskStatus`.

## Columnas

### `GET /api/v1/projects/:id/kanban/columns`

Lista columnas ordenadas por `position` con conteo de tareas.

### `PUT /api/v1/projects/:id/kanban/columns`

Reemplazo atómico del layout.

```json
{
  "columns": [
    { "id": "uuid-opcional", "title": "Por hacer", "color": "amber" },
    { "title": "En revisión", "color": "blue" }
  ]
}
```

- Mínimo 1, máximo 8 columnas.
- No se puede eliminar una columna con tareas (400).

Colores: `blue`, `violet`, `emerald`, `amber`, `rose`, `slate`.

## Tareas

### `POST /api/v1/projects/:projectId/tasks`

Campo opcional `columnId`. Si falta, se usa la primera columna del proyecto.

### `PATCH /api/v1/tasks/:id/column`

```json
{ "columnId": "uuid" }
```

Sustituye el antiguo `PATCH /tasks/:id/status`.

## Proyectos nuevos

Al crear un proyecto se insertan 3 columnas: Pending, In Progress, Done.
