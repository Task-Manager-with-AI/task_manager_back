# Kanban — accesibilidad y UI/UX al cambiar modo oscuro

**Fecha:** 2026-05-18  
**Herramienta:** `playwright-cli` v0.1.13 (skill `playwright-cli`)  
**Ruta probada:** `/projects/338d2c37-c792-450a-871d-ba6295dd61ad/kanban`  
**Proyecto:** QA Test Project (1 tarea: “Tarea QA 1”, prioridad MEDIUM)

## Resumen ejecutivo

| Categoría | Hallazgos |
| --- | ---: |
| Críticos (bloquean uso en oscuro) | 1 |
| Accesibilidad (WCAG / teclado / ARIA) | 5 |
| UI/UX (contraste, coherencia visual) | 4 |
| Comportamiento del toggle | 1 positivo |

El problema más grave es que **las columnas del tablero permanecen con fondo claro (`gray-50`) en modo oscuro**, mientras las tarjetas sí adoptan `gray-700`. Eso genera un contraste visual fuerte y sensación de interfaz “rota” al activar el tema oscuro.

## Metodología

1. Login y navegación al Kanban del proyecto de prueba.
2. Mediciones con `page.evaluate()` (ratios de contraste WCAG 2.1 aproximados, colores computados, clases DOM).
3. Alternancia del botón **Toggle theme** (6 ciclos rápidos + recarga en oscuro).
4. Capturas: `docs/manual-testing/screenshots/kanban-light.png`, `kanban-dark.png`.
5. Revisión de código en `features/kanban/` y `tailwind.config.ts`.

## Lo que funciona bien

| Comportamiento | Evidencia |
| --- | --- |
| El toggle persiste en `localStorage` (`theme: dark` / `light`) | Tras 6 clics, `dark` y `stored` siempre coinciden |
| Tras recargar en oscuro, `<html>` mantiene clase `dark` | `darkOnLoad: true`, sin desajuste con `localStorage` |
| Las tarjetas cambian de fondo | Claro: `rgb(255,255,255)` → Oscuro: `rgb(55,65,81)` |
| Textos principales (título, columnas, tarea) cumplen contraste AA en ambos modos | Ratios ≥ 4.5:1 en títulos y cuerpo de tarjeta |
| Botón de arrastre tiene `aria-label` descriptivo | `Drag task Tarea QA 1` |
| Columnas tienen `role="list"` + `aria-label` | p. ej. `Pending tasks`, `In Progress tasks` |
| Icono del toggle muestra estado (Luna / Sol) coherente con el tema activo | Moon en claro, Sun en oscuro |

---

## Hallazgos

### KANBAN-DM-001 — Columnas del tablero no entran en modo oscuro (crítico UI/UX)

| Campo | Valor |
| --- | --- |
| **Severidad** | Crítica |
| **Tipo** | UI/UX · tema oscuro |
| **Archivos** | `features/kanban/KanbanBoard.tsx`, `tailwind.config.ts` |

**Descripción:** Con `<html class="dark">`, las zonas de columna (`[role="list"]`) siguen con fondo `rgb(249, 250, 251)` (`bg-gray-50`), idéntico al modo claro. Las tarjetas sí usan fondo oscuro.

**Pasos para reproducir:**
1. Abrir el Kanban con al menos una tarea.
2. Pulsar **Toggle theme** para activar modo oscuro.
3. Inspeccionar el fondo de las columnas vacías y con tarjetas.

**Resultado esperado:** Columnas con fondo acorde al tema (`dark:bg-gray-800/50` o similar).

**Resultado actual:**

| Elemento | Modo claro | Modo oscuro |
| --- | --- | --- |
| Columna `[aria-label="Pending tasks"]` | `rgb(249, 250, 251)` | `rgb(249, 250, 251)` |
| Tarjeta `[role="listitem"]` | `rgb(255, 255, 255)` | `rgb(55, 65, 81)` |

**Causa probable:** La clase `dark:bg-gray-800/50` solo aparece en `features/kanban/KanbanBoard.tsx`, pero **`./features/**` no está en `content` de `tailwind.config.ts`**. Tailwind no genera esa variante; `bg-gray-50` sí se aplica. En cambio `dark:bg-gray-700` de las tarjetas sí existe en otros archivos bajo `app/` y `components/`.

**Recomendación:**
- Añadir `"./features/**/*.{js,ts,jsx,tsx,mdx}"` al `content` de Tailwind, **o**
- Mover estilos del Kanban a un archivo bajo `app/` / `components/`, **o**
- Usar una clase ya presente en el bundle (p. ej. `dark:bg-gray-800/60` como en tablas de proyectos).

---

### KANBAN-DM-002 — Texto “Drop tasks here” con contraste insuficiente en modo claro

| Campo | Valor |
| --- | --- |
| **Severidad** | Alta (accesibilidad) |
| **Tipo** | WCAG 1.4.3 Contraste |
| **Archivo** | `features/kanban/KanbanBoard.tsx` (líneas 49–52) |

**Descripción:** En modo claro, el hint de columnas vacías usa `text-gray-400` sobre `bg-gray-50`.

| Texto | Ratio | WCAG AA (texto normal) |
| --- | ---: | --- |
| “Drop tasks here” | **2.43:1** | No cumple (mín. 4.5:1) |

En modo oscuro el mismo texto pasa a `text-gray-500` y alcanza **~4.63:1** (cumple).

**Recomendación:** En claro usar `text-gray-500` o `text-gray-600`, o oscurecer el fondo de columna una vez corregido KANBAN-DM-001.

---

### KANBAN-DM-003 — Icono de arrastre (GripVertical) con bajo contraste en ambos modos

| Campo | Valor |
| --- | --- |
| **Severidad** | Media |
| **Tipo** | WCAG · usabilidad |
| **Archivo** | `features/kanban/TaskCard.tsx` (líneas 45–51) |

**Descripción:** El botón de drag usa `text-gray-400` sin variante `dark:` más clara.

| Modo | Color icono | Ratio aprox. | WCAG AA |
| --- | --- | ---: | --- |
| Claro | `rgb(156, 163, 175)` | **2.54:1** | No |
| Oscuro | `rgb(156, 163, 175)` | **4.06:1** | No (borde 4.5) |

**Recomendación:** `text-gray-500 dark:text-gray-400` o `dark:text-gray-300`; mantener `:hover` visible en ambos temas.

---

### KANBAN-DM-004 — Botón “volver” sin nombre accesible

| Campo | Valor |
| --- | --- |
| **Severidad** | Media |
| **Tipo** | Accesibilidad (ARIA) |
| **Archivo** | `app/(dashboard)/projects/[projectId]/kanban/page.tsx` |

**Descripción:** El botón con icono `ArrowLeft` no tiene `aria-label` ni texto visible. Los lectores de pantalla anuncian solo “button”.

**Pasos:** Enfocar el control anterior al título “Kanban Board” con lector de pantalla o árbol de accesibilidad.

**Recomendación:** `aria-label="Back to project"` / `Volver al proyecto`.

---

### KANBAN-DM-005 — Toggle de tema sin estado programático

| Campo | Valor |
| --- | --- |
| **Severidad** | Media |
| **Tipo** | Accesibilidad |
| **Archivo** | `components/theme-toggle.tsx` |

**Descripción:** El control expone `sr-only` “Toggle theme” pero no indica si el tema activo es claro u oscuro (`aria-pressed`, `aria-checked` o etiqueta dinámica “Activate dark mode” / “Activate light mode”).

**Medición:** `aria-label: null`, `aria-pressed: null` en el botón montado.

**Recomendación:**

```tsx
<Button
  aria-label={theme === "light" ? "Activar modo oscuro" : "Activar modo claro"}
  aria-pressed={theme === "dark"}
  ...
/>
```

---

### KANBAN-DM-006 — Avatar del responsable sin estilos `dark:`

| Campo | Valor |
| --- | --- |
| **Severidad** | Baja |
| **Tipo** | UI/UX · coherencia |
| **Archivo** | `features/kanban/TaskCard.tsx` (líneas 68–75) |

**Descripción:** `AvatarFallback` usa solo `bg-blue-100 text-blue-700`. En tablero oscuro puede quedar demasiado luminoso o con contraste distinto al resto de badges (que sí tienen `dark:` en `PRIORITY_STYLES`).

**Recomendación:** `bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300` (alineado con `page.tsx` del proyecto).

---

### KANBAN-DM-007 — Área principal del Kanban sin fondo explícito

| Campo | Valor |
| --- | --- |
| **Severidad** | Baja |
| **Tipo** | UI/UX |
| **Archivos** | `kanban/page.tsx`, `dashboard-layout.tsx` |

**Descripción:** El contenedor `.p-6` del Kanban tiene `backgroundColor: rgba(0, 0, 0, 0)`; el fondo depende del layout (`gray-50` / `gray-900`). No es un fallo por sí solo, pero junto con KANBAN-DM-001 las columnas claras “flotan” sobre un lienzo oscuro.

**Recomendación:** Tras corregir columnas, valorar `className` en la página Kanban: `bg-transparent` o superficie explícita `dark:bg-gray-900` coherente con el layout.

---

### KANBAN-DM-008 — Arrastre solo por botón; tarjeta sin foco de teclado para mover entre columnas

| Campo | Valor |
| --- | --- |
| **Severidad** | Media |
| **Tipo** | Accesibilidad · operabilidad |
| **Archivos** | `KanbanBoard.tsx`, `TaskCard.tsx` |

**Descripción:** Existe `KeyboardSensor` en dnd-kit, pero la tarjeta (`role="listitem"`) no es tabulable ni ofrece instrucciones para mover con teclado. Solo el botón de drag recibe foco (`tabindex` implícito en `<button>`).

**Impacto:** Usuarios de teclado pueden activar el asa de arrastre, pero no hay flujo documentado (flechas / espacio) visible en la UI.

**Recomendación:** Patrón [dnd-kit keyboard](https://docs.dndkit.com/), menú “Mover a…” en la tarjeta, o instrucciones `aria-keyshortcuts` en columnas.

---

### KANBAN-DM-009 — Estado de foco del asa de arrastre poco distinguible

| Campo | Valor |
| --- | --- |
| **Severidad** | Baja |
| **Tipo** | UI/UX · teclado |
| **Archivo** | `TaskCard.tsx` |

**Descripción:** Al enfocar el botón de drag, el outline es `3px` color `rgb(156, 163, 175)` — similar al icono en modo claro (KANBAN-DM-003).

**Recomendación:** Usar `focus-visible:ring-2 focus-visible:ring-blue-500` acorde al design system.

---

## Matriz de contraste (muestras automáticas)

| Elemento | Modo claro | Modo oscuro |
| --- | ---: | ---: |
| Título “Kanban Board” | 17.74:1 ✓ | 14.68:1 ✓ |
| Encabezado columna “Pending” | 9.86:1 ✓ | 14.33:1 ✓ |
| Título de tarjeta | 17.74:1 ✓ | 10.31:1 ✓ |
| Badge MEDIUM | 4.51:1 ✓ | 6.29:1 ✓ |
| “Drop tasks here” | **2.43:1 ✗** | 4.63:1 ✓ |
| Icono arrastre | **2.54:1 ✗** | **4.06:1 ✗** |
| Subtítulo proyecto | — | 6.99:1 ✓ |

## Capturas

| Archivo | Descripción |
| --- | --- |
| [screenshots/kanban-light.png](./screenshots/kanban-light.png) | Tablero en modo claro |
| [screenshots/kanban-dark.png](./screenshots/kanban-dark.png) | Tablero en modo oscuro (columnas claras visibles) |

## Priorización sugerida

1. **KANBAN-DM-001** — Incluir `features/` en Tailwind o reutilizar clases `dark:` ya compiladas.
2. **KANBAN-DM-002** y **KANBAN-DM-003** — Ajustar tokens de color en columnas vacías y asa de drag.
3. **KANBAN-DM-004** y **KANBAN-DM-005** — Etiquetas ARIA en navegación y toggle.
4. **KANBAN-DM-008** — Flujo teclado para mover tareas.

## Cómo repetir la auditoría

```bash
cd task_manager_project
playwright-cli -s=kanban-a11y open http://localhost:3000/login
# login → proyecto → Kanban
playwright-cli -s=kanban-a11y click "getByRole('button', { name: 'Toggle theme' })"
playwright-cli -s=kanban-a11y screenshot --filename=docs/manual-testing/screenshots/kanban-dark.png
```

Ver también: [README.md](./README.md), [bugs-2026-05-18.md](./bugs-2026-05-18.md).
