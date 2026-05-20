# Kanban v2 — personalización y UX

**Fecha:** 2026-05-19  
**Ruta:** `/projects/:projectId/kanban`

## Escenarios

1. **Columnas default** — Proyecto nuevo o migrado muestra 3 columnas.
2. **Configurar tablero** — Renombrar, reordenar (drag), cambiar color, agregar hasta 8 columnas.
3. **Eliminar columna vacía** — Se quita del layout al guardar.
4. **Eliminar columna con tareas** — Mensaje de error; mover tareas antes.
5. **Crear tarea desde columna** — Botón "+ Agregar tarea" abre formulario completo; la tarea aparece en esa columna.
6. **Drag tarjeta** — Mueve entre columnas; persiste tras recargar.
7. **Detalle** — Clic en tarjeta abre modal con descripción, fechas y personas.
8. **Gradiente** — Fondo visible en tema claro y oscuro; columnas con contraste legible.
9. **Tabla en proyecto** — Columna "Estado" muestra nombre personalizado de la columna Kanban.

## Regresión

- Login, listado de proyectos, CRUD tareas desde detalle de proyecto.
- Aceptar sugerencia de minuta crea tarea en primera columna.
