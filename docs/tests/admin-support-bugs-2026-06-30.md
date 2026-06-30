# Plan de corrección de bugs — Panel Admin (`/admin/support`)

> **Fecha:** 2026-06-30  
> **Flujo analizado:** Login Google → `/admin` → `/admin/users` → `/admin/feedback` → `/admin/support`  
> **Herramienta:** análisis estático de código + Playwright CLI (sesión bloqueada por restricción de Google OAuth en browsers automatizados; bugs confirmados por lectura de árbol de componentes)

---

## Resumen ejecutivo

Se identificaron **5 bugs** distribuidos entre críticos, moderados y menores. El problema reportado por el usuario (no poder hacer scroll en el sidebar de chats ni en la ventana de mensajes de `/admin/support`) tiene una causa raíz CSS confirmada en `ChatList.tsx`, con un segundo defecto en la cadena de alturas que afecta a `ChatWindow`. Un tercer bug de navegación hace que el administrador sea expulsado del panel al abrir un chat de soporte desde `/admin/users`.

| ID | Severidad | Componente | Descripción corta |
|----|-----------|------------|-------------------|
| BUG-01 | 🔴 Crítico | `ChatList.tsx` | Sidebar de chats no hace scroll |
| BUG-02 | 🔴 Crítico | `ChatWindow.tsx` | Ventana de mensajes no hace scroll |
| BUG-03 | 🟠 Moderado | `admin/users/page.tsx` | "Abrir chat de soporte" expulsa del panel admin |
| BUG-04 | 🟡 Menor | `ChatLayout.tsx` | Sidebar div sin `h-full` explícito (riesgo latente) |
| BUG-05 | 🟡 Menor | `(admin)/layout.tsx` | Sidebar mobile sin botón de cierre interno |

---

## BUG-01 🔴 — ChatList sidebar no hace scroll en `/admin/support`

### Descripción

El panel lateral de la lista de conversaciones en `/admin/support` no permite hacer scroll hacia abajo. Cuando hay más chats de los que caben en la pantalla, el contenido excedente queda oculto (cortado por `overflow-hidden` del contenedor padre) y es inaccesible para el administrador.

### Causa raíz

**Archivo:** `task_manager_front/features/chats/ChatList.tsx`, línea 52

El div raíz de `ChatList` carece de restricción de altura (`h-full`):

```tsx
// ❌ ACTUAL — sin altura delimitada
<div className="flex w-full flex-col">
  <div className="border-b border-gray-200 p-4 ...">   {/* header fijo */}
    ...
  </div>
  <div className="flex-1 overflow-y-auto">             {/* NUNCA scrollea */}
    {/* lista de chats */}
  </div>
</div>
```

**Por qué falla:** En un contenedor flex-column, `flex-1 overflow-y-auto` en el div interior necesita que su **padre tenga una altura delimitada**. Sin `h-full` en el div raíz, el contenedor crece a la altura natural de su contenido (todos los ítems sin límite), haciendo que `overflow-y-auto` nunca alcance un estado de desbordamiento → sin scrollbar → sin scroll.

**Cadena de alturas afectada:**

```
<main class="flex-1 overflow-y-auto">                ← altura acotada via flex-1 ✓
  AdminSupportPage: "flex flex-col h-full"            ← h-full de main ✓
    chat-container: "flex-1 overflow-hidden"          ← altura restante ✓ (clips overflow)
      ChatLayout: "flex h-full"                       ← h-full del container ✓
        sidebar-div: "flex flex-col border-r ..."     ← h-full via align-self:stretch ✓
          ChatList: "flex w-full flex-col"            ← ❌ SIN h-full → crece infinito
            list: "flex-1 overflow-y-auto"            ← ❌ overflow nunca dispara
```

El contenido desbordante queda **clippeado** por el `overflow-hidden` del `chat-container`, haciéndolo invisible e inaccesible.

### Fix

```tsx
// ✅ CORREGIDO — ChatList.tsx línea 52
<div className="flex h-full w-full flex-col">
  <div className="border-b border-gray-200 p-4 ...">
    ...
  </div>
  <div className="flex-1 overflow-y-auto">   {/* ahora scrollea correctamente */}
    ...
  </div>
</div>
```

**Archivo a modificar:** `task_manager_front/features/chats/ChatList.tsx`  
**Cambio:** Añadir `h-full` al div raíz (línea 52)

```diff
- <div className="flex w-full flex-col">
+ <div className="flex h-full w-full flex-col">
```

**Efecto colateral positivo:** Aunque el bug es más visible en `/admin/support` (por el `overflow-hidden` del admin layout), la misma ausencia de `h-full` afecta a la página `/chats` del usuario, donde el sidebar hace scroll vía el scroll de página en lugar de scroll interno. Este fix corrige ambas páginas simultáneamente.

---

## BUG-02 🔴 — Ventana de mensajes no hace scroll en `/admin/support`

### Descripción

El área de mensajes dentro de `ChatWindow` no permite hacer scroll. En conversaciones con historial largo, los mensajes más antiguos son inaccesibles.

### Causa raíz

**Archivo:** `task_manager_front/features/chats/ChatWindow.tsx`, línea 96 y 150  
**Archivo secundario:** `task_manager_front/features/chats/ChatLayout.tsx`, línea 77

El div de mensajes tiene `flex-1 overflow-y-auto`, que en teoría debería funcionar dado que la cadena de alturas es:

```
ChatLayout "flex h-full"
  chat-panel: "flex flex-1 flex-col"       ← altura = h-full via align-self:stretch
    ChatWindow: "flex flex-1 flex-col"     ← flex-1 en columna → altura acotada (teórico)
      messages: "flex-1 overflow-y-auto"   ← altura restante (teórico)
```

Sin embargo, dos factores combinados producen el fallo en el admin layout:

1. **El desbordamiento de `ChatList` (BUG-01)** puede afectar el layout del row de `ChatLayout`. Si `ChatList` desborda su div contenedor, y ese div no tiene `overflow: hidden`, el overflow se propaga hacia arriba, pudiendo interferir con el cómputo de altura del chat panel en algunos entornos de rendering.

2. **`min-h-0` ausente** en el div `flex-1 overflow-hidden` de `AdminSupportPage` y en el chat panel de `ChatLayout`. En contenedores flex-column, CSS aplica `min-height: auto` por defecto, lo que puede impedir que los ítems flex se reduzcan por debajo de su contenido mínimo. Aunque la spec indica que `overflow: hidden` reset `min-height` a `0`, no todos los navegadores aplican esto de forma consistente en cadenas de anidamiento profundo.

El resultado observable: en el layout del admin (que usa `overflow-hidden` en el contenedor del chat), la altura no se propaga correctamente hacia `ChatWindow`, causando que `overflow-y-auto` en los mensajes nunca se active.

**Nota:** Este bug no aparece en `/chats` del usuario porque el layout usa `overflow-auto` en lugar de `overflow-hidden`, permitiendo que el scroll recaiga sobre el contenedor de la página.

### Fix

**Paso 1:** Corregir BUG-01 (añadir `h-full` a `ChatList`). Esto elimina el desbordamiento que desestabiliza el flex layout del row de `ChatLayout`.

**Paso 2:** Añadir `min-h-0` como defensa a los contenedores flex intermedios.

**`task_manager_front/app/(admin)/admin/support/page.tsx`, línea 24:**
```diff
- <div className="flex-1 overflow-hidden">
+ <div className="flex-1 min-h-0 overflow-hidden">
```

**`task_manager_front/features/chats/ChatLayout.tsx`, línea 77 (chat panel div):**
```diff
- "flex flex-1 flex-col",
+ "flex min-h-0 flex-1 flex-col",
```

**`task_manager_front/features/chats/ChatWindow.tsx`, línea 96:**
```diff
- <div className="flex flex-1 flex-col bg-gray-50 dark:bg-gray-900">
+ <div className="flex min-h-0 flex-1 flex-col bg-gray-50 dark:bg-gray-900">
```

**Archivos a modificar:**
- `task_manager_front/app/(admin)/admin/support/page.tsx`
- `task_manager_front/features/chats/ChatLayout.tsx`
- `task_manager_front/features/chats/ChatWindow.tsx`

---

## BUG-03 🟠 — "Abrir chat de soporte" expulsa al admin del panel

### Descripción

En la página `/admin/users`, el menú de acciones de cada usuario incluye la opción **"Abrir chat de soporte"**. Al clickear, el administrador es redirigido a `/chats` (panel de usuario) en lugar de permanecer en el panel admin (`/admin/support`). Esto interrumpe el flujo de trabajo del administrador y requiere navegar manualmente de vuelta al panel admin.

### Causa raíz

**Archivo:** `task_manager_front/app/(admin)/admin/users/page.tsx`, línea 81

```tsx
// ❌ ACTUAL — navega al panel de usuario
async function handleOpenChat() {
  try {
    const chat = await chatsApi.direct(user.id)
    router.push(`/chats?chatId=${chat.id}`)   // ← lleva fuera del admin
  } catch { /* ignore */ }
}
```

La URL destino debería ser `/admin/support` ya que:
- `ChatLayout` (reutilizado en `/admin/support`) soporta el parámetro de query `?chatId=<id>` para deep-linking directo a una conversación (líneas 29-35 de `ChatLayout.tsx`)
- El admin debe permanecer en su panel con el contexto correcto

### Fix

**Archivo a modificar:** `task_manager_front/app/(admin)/admin/users/page.tsx`

```diff
  async function handleOpenChat() {
    try {
      const chat = await chatsApi.direct(user.id)
-     router.push(`/chats?chatId=${chat.id}`)
+     router.push(`/admin/support?chatId=${chat.id}`)
    } catch { /* ignore */ }
  }
```

**Resultado esperado:** Al clickear "Abrir chat de soporte", el administrador es redirigido a `/admin/support` con el chat del usuario ya seleccionado y listo para responder.

---

## BUG-04 🟡 — ChatLayout sidebar sin `h-full` explícito (riesgo latente)

### Descripción

El div del sidebar en `ChatLayout.tsx` (líneas 59-63) obtiene su altura via `align-self: stretch` (comportamiento por defecto en contenedores flex-row), pero no declara `h-full` explícitamente. Esto es frágil: si en algún refactor el contenedor padre cambia de `flex` row a `flex` column, el div perdería su altura acotada y `ChatList` dejaría de heredar el contexto correcto.

### Causa raíz

**Archivo:** `task_manager_front/features/chats/ChatLayout.tsx`, líneas 59-63

```tsx
// ❌ ACTUAL — altura implícita via stretch
<div
  className={[
    "flex flex-col border-r border-gray-200 bg-white ...",
    "w-full shrink-0 md:w-80",
    mobileView === "chat" ? "hidden md:flex" : "flex",
  ].join(" ")}
>
```

### Fix

**Archivo a modificar:** `task_manager_front/features/chats/ChatLayout.tsx`

```diff
  className={[
-   "flex flex-col border-r border-gray-200 bg-white ...",
+   "flex h-full flex-col border-r border-gray-200 bg-white ...",
    "w-full shrink-0 md:w-80",
    mobileView === "chat" ? "hidden md:flex" : "flex",
  ].join(" ")}
```

---

## BUG-05 🟡 — Sidebar mobile del panel admin sin botón de cierre interno

### Descripción

En el layout admin (`(admin)/layout.tsx`), el sidebar mobile se abre al presionar el botón hamburguesa del header. Sin embargo, el panel lateral **no contiene un botón de cierre (×)** interno. El único mecanismo de cierre es tocar el backdrop oscuro que aparece detrás. Este patrón es menos intuitivo que incluir un botón visible de cierre dentro del panel, especialmente para nuevos usuarios del panel admin.

La página de dashboard del usuario (`dashboard-layout.tsx`) sí incluye un botón × dentro del sidebar en mobile.

### Causa raíz

**Archivo:** `task_manager_front/app/(admin)/layout.tsx`

`SidebarContent` renderiza el logo, la navegación y el footer, pero ningún botón de cierre.

### Fix

Añadir un botón de cierre al header del sidebar dentro de `SidebarContent`, pasando `onClose` como prop:

```tsx
// En SidebarContent — añadir botón × junto al logo
<div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
  <div className="flex items-center gap-2.5">
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-slate-950">
      <Shield className="h-4 w-4" />
    </div>
    <div>
      <p className="text-sm font-semibold leading-tight">Task Manager</p>
      <p className="text-[10px] font-medium uppercase tracking-widest text-amber-400/80">Admin</p>
    </div>
  </div>
  {/* Botón de cierre — solo visible en mobile */}
  {onNavigate && (
    <button
      onClick={onNavigate}
      className="lg:hidden rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
      aria-label="Cerrar menú"
    >
      <X className="h-5 w-5" />
    </button>
  )}
</div>
```

**Archivos a modificar:** `task_manager_front/app/(admin)/layout.tsx`  
(El prop `onNavigate` ya existe y cierra el sidebar cuando se hace click en un item de navegación; puede reutilizarse para el botón ×.)

---

## Plan de implementación

### Orden recomendado

Aplicar los cambios en este orden para minimizar regresiones:

1. **BUG-01** → `ChatList.tsx`: un cambio de una línea, impacto inmediato y visible.
2. **BUG-02** → `support/page.tsx` + `ChatLayout.tsx` + `ChatWindow.tsx`: aplicar `min-h-0` a los tres. Probar que los mensajes hacen scroll antes de continuar.
3. **BUG-03** → `admin/users/page.tsx`: cambio de una línea, verificar navegación a `/admin/support` con chat pre-seleccionado.
4. **BUG-04** → `ChatLayout.tsx`: añadir `h-full` al div del sidebar. Verificar que no rompe el layout en `/chats` del usuario.
5. **BUG-05** → `(admin)/layout.tsx`: añadir botón de cierre. Probar en viewport mobile.

### Verificación manual post-fix

Para cada bug corregido, reproducir los siguientes pasos en `http://localhost:3000`:

| Paso | Acción | Resultado esperado |
|------|--------|-------------------|
| 1 | Login con Google (`fsociety.soporte@gmail.com`) | Redirige a `/dashboard` |
| 2 | Navegar a `/admin/support` | Se muestra el layout de chats |
| 3 | Con más de ~8 chats en el sidebar | Aparece scrollbar; desplazarse hacia abajo funciona |
| 4 | Seleccionar un chat con historial largo | Los mensajes muestran scrollbar y se puede navegar por el historial |
| 5 | Auto-scroll | Al abrir el chat, los mensajes más recientes están visibles sin acción manual |
| 6 | Ir a `/admin/users` → menú de un usuario → "Abrir chat de soporte" | Redirige a `/admin/support?chatId=...` con ese chat seleccionado |
| 7 | Abrir en viewport mobile (< 1024px) | Hamburguesa abre sidebar; botón × dentro del sidebar lo cierra |

### Archivos modificados (resumen)

```
task_manager_front/
├── features/chats/
│   ├── ChatList.tsx           # BUG-01: +h-full en div raíz
│   ├── ChatLayout.tsx         # BUG-02: +min-h-0 en chat panel; BUG-04: +h-full en sidebar div
│   └── ChatWindow.tsx         # BUG-02: +min-h-0 en div raíz
├── app/(admin)/
│   ├── layout.tsx             # BUG-05: botón × en SidebarContent
│   └── admin/
│       ├── support/page.tsx   # BUG-02: +min-h-0 en chat container
│       └── users/page.tsx     # BUG-03: /chats → /admin/support
```

---

## Referencias

- `task_manager_front/features/chats/ChatList.tsx` — componente afectado (BUG-01)
- `task_manager_front/features/chats/ChatWindow.tsx` — componente afectado (BUG-02)
- `task_manager_front/features/chats/ChatLayout.tsx` — layout compartido entre `/chats` y `/admin/support`
- `task_manager_front/app/(admin)/admin/support/page.tsx` — página afectada
- `task_manager_front/app/(admin)/admin/users/page.tsx` — acción con navegación incorrecta (BUG-03)
- `task_manager_front/app/(admin)/layout.tsx` — layout del panel admin
- `task_manager_front/components/dashboard-layout.tsx` — referencia de implementación correcta del botón × en sidebar mobile
