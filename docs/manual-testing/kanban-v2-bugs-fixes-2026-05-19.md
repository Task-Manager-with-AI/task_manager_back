# Kanban v2 — bugs de personalización (Playwright CLI)

**Fecha:** 2026-05-19  
**Herramienta:** `playwright-cli` v0.1.13 (skill `playwright-cli`)  
**Rutas:** `/projects/:projectId/kanban`, `PUT /api/v1/projects/:id/kanban/columns`  
**Entorno:** Frontend `http://localhost:3000`, Backend `http://localhost:4000`

## Resumen ejecutivo

| ID | Severidad | Título | Estado |
| --- | ---: | --- | --- |
| [KANBAN-V2-001](#kanban-v2-001--error-500-al-reordenar-columnas-crítico) | Crítica | Error 500 al reordenar columnas | **Resuelto** |
| [KANBAN-V2-002](#kanban-v2-002--agregar-tarea-en-todas-las-columnas-alta) | Alta | Botón «Agregar tarea» en todas las columnas | **Resuelto** |
| [KANBAN-V2-003](#kanban-v2-003--mensaje-500-genérico-al-usuario-media) | Media | Mensaje 500 genérico en UI | **Resuelto** |
| [KANBAN-V2-004](#kanban-v2-004--nombres-de-color-sin-i18n-baja) | Baja | Nombres de color sin i18n | **Resuelto** |
| [KANBAN-V2-005](#kanban-v2-005--sheet-sin-aviso-de-cambios-sin-guardar-baja) | Baja | Sheet sin aviso al cerrar con cambios | **Resuelto** |

**Validación (2026-05-19):** `playwright-cli -s=kanban-qa` — `PUT .../kanban/columns` → **200** tras reordenar; un solo botón «Add task» en la columna izquierda; diálogo «Discard changes?» al cerrar el sheet con cambios sin guardar; colores traducidos en el selector (p. ej. Emerald, Violet).

**Confirmado por API:** cualquier `PUT` que **cambie el orden** de columnas existentes devuelve **500**; renombrar o agregar columna al final con el mismo orden devuelve **200**.

---

## Metodología

1. Registro e inicio de sesión con `playwright-cli -s=kanban-qa`.
2. Proyecto nuevo «Kanban QA Project» → tablero Kanban.
3. **Configurar tablero:** arrastrar columnas (grip) y guardar.
4. Verificación con `curl` autenticado contra `PUT .../kanban/columns`.
5. Revisión de logs del backend (`P2002` en `projectId` + `position`).
6. Trazas: `.playwright-cli/traces/trace-1779217768076.network`

---

## Hallazgos

### KANBAN-V2-001 — Error 500 al reordenar columnas (crítico)

| Campo | Valor |
| --- | --- |
| **Severidad** | Crítica |
| **Tipo** | Backend / base de datos |
| **Archivos** | `task_manager_back/src/modules/kanban/kanban.service.ts`, `prisma/schema.prisma` |

**Descripción:** Al guardar el layout del tablero después de **reordenar** columnas (drag en el sheet o payload con distinto orden), el servidor responde **500** y el orden no se persiste de forma fiable.

**Pasos para reproducir:**

1. Abrir Kanban de un proyecto con 3 columnas default.
2. Clic en **Configurar tablero**.
3. Arrastrar «Pending» debajo de «Done» (o cualquier permutación que cambie posiciones).
4. Clic en **Guardar**.

**Resultado esperado:** `200` y columnas en el nuevo orden.

**Resultado actual:**

- UI: mensaje de error (p. ej. «Internal server error») en el sheet.
- Red: `PUT /api/v1/projects/:id/kanban/columns` → **500**.
- Log backend:

```text
Unique constraint failed on the fields: (`projectId`,`position`)
Prisma error code: P2002
at kanban.service.ts:51 (tx.kanbanColumn.update)
```

**Reproducción mínima (curl):**

```bash
# Tras login y obtener IDs de columnas del proyecto:
curl -b cookies.txt -X PUT "http://localhost:4000/api/v1/projects/{projectId}/kanban/columns" \
  -H "Content-Type: application/json" \
  -d '{"columns":[
    {"id":"<id-done>","title":"Done","color":"emerald"},
    {"id":"<id-in-progress>","title":"In Progress","color":"violet"},
    {"id":"<id-pending>","title":"Pending","color":"amber"}
  ]}'
# → HTTP 500
```

Renombrar **sin** cambiar orden → **200** (comprobado).

**Causa raíz:** Existe `@@unique([projectId, position])` en `KanbanColumn`. En `replaceKanbanLayout`, las actualizaciones hacen `position = 0, 1, 2…` en secuencia. Al mover la columna A de posición 2 a 0, la fila B sigue ocupando posición 0 → violación de unicidad antes de terminar el bucle.

**Solución recomendada (elegir una):**

1. **Dos fases en la misma transacción (recomendada, sin migración):**
   - Fase A: asignar posiciones temporales únicas, p. ej. `position = index + 1000` (o negativas) a todas las columnas del proyecto.
   - Fase B: aplicar posiciones finales `0..n-1` según el array del `PUT`.
2. **Alternativa:** `updateMany` con SQL raw / `prisma.$executeRaw` para swap atómico.
3. **No recomendado solo:** quitar el índice único sin otra garantía de orden consistente.

**Ejemplo de lógica (Fase A + B):**

```typescript
// Dentro de prisma.$transaction, antes del bucle final:
for (let i = 0; i < dto.columns.length; i++) {
  const input = dto.columns[i];
  if (input.id) {
    await tx.kanbanColumn.update({
      where: { id: input.id },
      data: { position: 1000 + i },
    });
  }
}
// Luego crear nuevas columnas y aplicar position 0..n-1 (código actual).
```

**Prueba de regresión:** Reordenar 3 columnas en todas las permutaciones; añadir 4.ª columna y reordenar; recargar y verificar orden en UI y `GET .../kanban/columns`.

---

### KANBAN-V2-002 — Agregar tarea en todas las columnas (alta)

| Campo | Valor |
| --- | --- |
| **Severidad** | Alta |
| **Tipo** | Producto / UX |
| **Archivos** | `task_manager_front/features/kanban/KanbanBoard.tsx`, `kanban/page.tsx` |

**Descripción:** Cada columna muestra el botón **«Agregar tarea»**. El requisito de negocio es que las tareas nuevas solo se creen en la **columna más a la izquierda** (menor `position`, primera del tablero).

**Evidencia Playwright:** En el snapshot del tablero aparecen tres botones `Add task` (refs en listas «Tasks in Pending», «In Progress», «Done»).

**Solución recomendada:**

1. En `KanbanBoard`, pasar `canAddTask={column.id === leftmostColumnId}` a `BoardColumn`, donde `leftmostColumnId` es la columna con menor `position` (o `columns[0]` si ya vienen ordenadas).
2. Renderizar el botón «+ Agregar tarea» solo si `canAddTask === true`.
3. Opcional: CTA en columnas vacías no izquierdas: «Arrastra una tarea aquí» sin abrir el diálogo de creación.
4. Mantener `CreateTaskDialog` con `defaultColumnId` = id de la columna izquierda cuando se abra desde un único punto (cabecera del tablero, opcional).

**i18n:** Añadir clave si hace falta, p. ej. `kanban.addTaskOnlyBacklog` para tooltip en columnas sin botón.

---

### KANBAN-V2-003 — Mensaje 500 genérico al usuario (media)

| Campo | Valor |
| --- | --- |
| **Severidad** | Media |
| **Tipo** | UX / API |
| **Archivos** | `error.middleware.ts`, `KanbanColumnSettingsSheet.tsx` |

**Descripción:** Ante `P2002`, el cliente recibe `message: "Internal server error"` (y en desarrollo, `stack` en JSON). El sheet muestra ese texto sin contexto.

**Solución recomendada:**

1. En `replaceKanbanLayout`, capturar `PrismaClientKnownRequestError` con `code === 'P2002'` y lanzar `AppError('Could not reorder columns. Please try again.', 409)`.
2. Tras corregir KANBAN-V2-001, este caso debería desaparecer; mantener el mapeo como red de seguridad.
3. No exponer `stack` al frontend en respuestas API (solo logs servidor).

---

### KANBAN-V2-004 — Nombres de color sin i18n (baja)

| Campo | Valor |
| --- | --- |
| **Severidad** | Baja |
| **Tipo** | i18n |
| **Archivos** | `KanbanColumnSettingsSheet.tsx`, `lib/i18n/messages/*.json` |

**Descripción:** En el selector de color del sheet aparecen tokens en inglés (`amber`, `violet`, …) sin traducir.

**Solución:** Claves `kanban.colors.amber`, etc., y usar `t()` en `SelectItem`.

---

### KANBAN-V2-005 — Sheet sin aviso de cambios sin guardar (baja)

| Campo | Valor |
| --- | --- |
| **Severidad** | Baja |
| **Tipo** | UX |
| **Archivos** | `KanbanColumnSettingsSheet.tsx` |

**Descripción:** Cerrar el sheet (overlay, Escape o Cancel) descarta el borrador sin confirmación si hubo drag o edición de títulos.

**Solución:** Flag `isDirty` al comparar draft vs `columns` iniciales; `onOpenChange` intercepta cierre y muestra `AlertDialog` de confirmación.

---

## Comportamiento que sí funciona (regresión)

| Acción | HTTP |
| --- | --- |
| Renombrar columnas sin cambiar orden | 200 |
| Cambiar solo color | 200 |
| Agregar 4.ª columna al final | 200 |
| `GET` columnas / tareas | 200 |
| Crear tarea con `columnId` en API | 201 |

---

## Plan de corrección sugerido (orden)

| Orden | Tarea | Issue |
| ---: | --- | --- |
| 1 | Fase temporal de posiciones en `replaceKanbanLayout` | KANBAN-V2-001 |
| 2 | Mapear P2002 → mensaje claro (409) | KANBAN-V2-003 |
| 3 | Botón «Agregar tarea» solo en columna izquierda | KANBAN-V2-002 |
| 4 | i18n colores + confirmación sheet | KANBAN-V2-004, V2-005 |

---

## Comandos Playwright (reproducir)

```bash
cd task_manager_project
playwright-cli -s=kanban-qa open http://localhost:3000/login
# Registrar / login → proyecto → Kanban → Configure board → reordenar → Save
playwright-cli -s=kanban-qa requests
playwright-cli -s=kanban-qa close
```

## Referencias

- [kanban-v2-personalization.md](./kanban-v2-personalization.md) — escenarios de prueba originales  
- [kanban-api.md](../kanban-api.md) — contrato API  
- [implementation-plans/kanban-personalization-plan.md](../implementation-plans/kanban-personalization-plan.md) — diseño v2
