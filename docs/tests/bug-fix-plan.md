# Plan de Solución de Bugs

**Fecha:** 2026-06-26  
**Repositorio:** task_manager_project  
**Prioridad:** Alta — todos los bugs afectan la experiencia de usuario en producción

---

## Índice

1. [BUG-01 — People: muestra todos los usuarios del sistema](#bug-01--people-muestra-todos-los-usuarios-del-sistema)
2. [BUG-02 — Agregar miembro: reemplazar selector de usuarios por invitación](#bug-02--agregar-miembro-reemplazar-selector-de-usuarios-por-invitación)
3. [BUG-03 — Reuniones: link de invitación para unirse](#bug-03--reuniones-link-de-invitación-para-unirse)
4. [BUG-04 — Videollamada: diseño no responsivo en móvil](#bug-04--videollamada-diseño-no-responsivo-en-móvil)
5. [BUG-05 — WebRTC: falla al entrar si mic/cámara no disponibles](#bug-05--webrtc-falla-al-entrar-si-miccámara-no-disponibles)

---

## BUG-01 — People: muestra todos los usuarios del sistema

### Descripción
La página `/people` muestra todos los usuarios activos de la plataforma (`isActive: true`), independientemente de si el usuario autenticado comparte algún proyecto con ellos. Esto expone datos de usuarios no relacionados.

### Causa raíz

**Backend** — `src/modules/users/users.repository.ts`, función `findAll()`:
```ts
// ACTUAL — devuelve TODOS los usuarios activos
export async function findAll() {
  return prisma.user.findMany({ where: { isActive: true }, select: safeSelect });
}
```

**Backend** — `src/modules/users/users.routes.ts`:
```
GET /users → listUsersController → listUsers() → findAll()
```
El controlador no recibe el `userId` del token para filtrar.

### Solución propuesta

#### Backend

**1. Nueva query en `users.repository.ts`:**
```ts
// Retorna usuarios que comparten al menos un proyecto activo con `requesterId`
export async function findUsersSharedWithMe(requesterId: string) {
  const myProjectIds = await prisma.projectMember.findMany({
    where: { userId: requesterId, isActive: true },
    select: { projectId: true },
  });
  const ids = myProjectIds.map((m) => m.projectId);

  return prisma.user.findMany({
    where: {
      isActive: true,
      id: { not: requesterId },         // excluir al propio usuario
      memberships: {
        some: {
          projectId: { in: ids },
          isActive: true,
        },
      },
    },
    select: safeSelect,
    orderBy: { name: "asc" },
  });
}
```

**2. Actualizar `users.service.ts`:**
```ts
export async function listUsers(requesterId: string) {
  return findUsersSharedWithMe(requesterId);
}
```

**3. Actualizar `users.controller.ts`:**
```ts
export async function listUsersController(req, res, next) {
  try {
    const users = await listUsers(req.user!.id);   // pasar userId del token
    sendSuccess(res, users);
  } catch (err) { next(err); }
}
```

#### Frontend
No requiere cambios. El hook `useUsers()` ya hace `GET /users`; la respuesta simplemente contendrá la lista filtrada.

### Archivos a modificar
| Archivo | Cambio |
|---|---|
| `src/modules/users/users.repository.ts` | Reemplazar `findAll` por `findUsersSharedWithMe` |
| `src/modules/users/users.service.ts` | Recibir y pasar `requesterId` |
| `src/modules/users/users.controller.ts` | Pasar `req.user!.id` al servicio |

### Criterio de aceptación
- La página `/people` solo muestra usuarios que comparten al menos un proyecto activo con el usuario autenticado.
- El propio usuario no aparece en la lista.
- Un usuario sin proyectos ve la lista vacía.

---

## BUG-02 — Agregar miembro: reemplazar selector de usuarios por invitación

### Descripción
El diálogo "Agregar miembro" en la página de proyecto presenta un `<Select>` con la lista de todos los usuarios registrados en la plataforma. Esto es abrumador y expone información de usuarios no relacionados. Se requiere un flujo de invitación mediante **link** y/o **correo electrónico**.

### Causa raíz

**Frontend** — `app/(dashboard)/projects/[projectId]/page.tsx`:  
El diálogo hace `useUsers()` para poblar el selector, exponiendo todos los usuarios del sistema.

**Backend** — `POST /projects/:id/members` requiere un `userId` ya existente, sin soporte de invitación por token o email.

### Solución propuesta

#### Nuevo modelo Prisma

```prisma
model ProjectInvite {
  id          String    @id @default(uuid())
  projectId   String
  project     Project   @relation(fields: [projectId], references: [id])
  createdById String
  createdBy   User      @relation("InviteCreator", fields: [createdById], references: [id])
  email       String?           // null = invite por link genérico
  token       String    @unique @default(uuid())
  memberRole  String    @default("MEMBER")
  expiresAt   DateTime
  acceptedAt  DateTime?
  acceptedBy  String?           // userId quien aceptó
  createdAt   DateTime  @default(now())
}
```

#### Nuevos endpoints backend

```
POST /projects/:projectId/invites/link
  → Genera un link de invitación (token UUID, expira en 7 días)
  → Body: { memberRole?: "MEMBER" | "GUEST" | "ADMIN" }
  → Devuelve: { inviteUrl: "https://app.com/invite/project/<token>" }
  → Solo admins/owners del proyecto

POST /projects/:projectId/invites/email
  → Genera el token + envía email de invitación via nodemailer (reutilizar email.service.ts)
  → Body: { email: string, memberRole?: string }
  → Guarda email en ProjectInvite para pre-verificar al aceptar

GET /invite/project/:token  (público — sin authMiddleware)
  → Devuelve info del proyecto (nombre) y validez del invite (sin exponer datos sensibles)
  → Respuesta: { projectName, memberRole, valid: boolean, reason?: "expired"|"used" }

POST /invite/project/:token/accept  (requiere authMiddleware)
  → Verifica: token válido, no vencido, no usado
  → Si el invite tiene email → verifica que req.user.email coincida
  → Llama al repositorio addMember existente
  → Marca acceptedAt y acceptedBy en ProjectInvite
  → Devuelve el proyecto para redirigir al frontend
```

#### Lógica del servicio de invites

```ts
// invites.service.ts (nuevo módulo src/modules/invites/)
export async function createInviteLink(projectId, createdById, memberRole) {
  // Verificar que createdById sea ADMIN del proyecto
  // Crear ProjectInvite con expiresAt = now + 7d, email = null
  // Retornar { inviteUrl: `${env.FRONTEND_URL}/invite/project/${token}` }
}

export async function sendInviteEmail(projectId, createdById, email, memberRole) {
  // Igual que createInviteLink pero guarda email y llama sendInviteEmailMail()
}

export async function acceptInvite(token, userId, userEmail) {
  // Buscar invite activo (not expired, not used)
  // Si tiene email → verificar que userEmail === invite.email
  // Verificar usuario no sea ya miembro
  // addMember(projectId, userId, memberRole)
  // Marcar invite como usado
}
```

#### Frontend

**Nueva página:** `app/(dashboard)/invite/project/[token]/page.tsx`
- Muestra nombre del proyecto y rol de invitación
- Botón "Unirse al proyecto" → `POST /invite/project/:token/accept`
- Si está expirado o ya usado → mensaje de error
- Si no está logueado → redirige a `/login?from=/invite/project/{token}`

**Nuevo diálogo en la página de proyecto** (reemplaza el selector actual):
```
┌─ Invitar al proyecto ──────────────────────────┐
│                                                 │
│  ╔═══════════════════════════════════════════╗  │
│  ║  Link de invitación (válido 7 días)       ║  │
│  ║  https://app.com/invite/project/abc123    ║  │
│  ║                            [Copiar link]  ║  │
│  ╚═══════════════════════════════════════════╝  │
│                                                 │
│  ─── o invita por correo ───────────────────── │
│  Email: [________________]  Rol: [Miembro ▼]   │
│                              [Enviar invitación]│
└─────────────────────────────────────────────────┘
```

### Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `prisma/schema.prisma` | Agregar modelo `ProjectInvite` |
| `src/modules/invites/invites.repository.ts` | Nuevo — CRUD de invites |
| `src/modules/invites/invites.service.ts` | Nuevo — lógica createLink, sendEmail, accept |
| `src/modules/invites/invites.controller.ts` | Nuevo — 4 controllers |
| `src/modules/invites/invites.routes.ts` | Nuevo — 4 rutas |
| `src/shared/email.service.ts` | Agregar `sendInviteEmail(to, projectName, inviteUrl)` |
| `src/app.ts` | Montar `invitesRouter` |
| `task_manager_front/features/projects/projects.api.ts` | Agregar `createInviteLink`, `sendInviteEmail`, `acceptInvite` |
| `task_manager_front/features/projects/projects.hooks.ts` | Agregar hooks correspondientes |
| `task_manager_front/app/(dashboard)/projects/[projectId]/page.tsx` | Reemplazar diálogo actual |
| `task_manager_front/app/(dashboard)/invite/project/[token]/page.tsx` | Nuevo — página de aceptación |
| `task_manager_front/middleware.ts` | Agregar `/invite/*` a rutas públicas (mostrar la página sin login, pero aceptar requiere login) |

### Criterio de aceptación
- El diálogo de proyecto no muestra lista de usuarios.
- El admin puede copiar un link de invitación en un clic.
- El admin puede ingresar un email y enviar una invitación.
- El link de invitación expira en 7 días y solo puede usarse una vez.
- Si el invite tiene email, solo el usuario con ese email puede aceptarlo.
- Al aceptar, el usuario queda como miembro del proyecto y del chat grupal.

---

## BUG-03 — Reuniones: link de invitación para unirse

### Descripción
No existe una forma rápida de compartir el acceso a una reunión en curso. Se requiere un link similar a Google Meet que permita a miembros del proyecto unirse directamente, verificando que sean miembros activos.

### Causa raíz
- No existe endpoint ni UI para compartir el link de una sala.
- El acceso a `GET /meetings/:meetingId` ya verifica membresía de proyecto, pero no hay un flujo de UI para distribuir ese link.
- La URL actual de la sala (`/projects/:projectId/meetings/:meetingId/room`) es suficiente para usuarios que ya tienen acceso, pero no hay forma de copiarla fácilmente ni se muestra al host.

### Solución propuesta

#### Backend — Verificación de acceso (ya funciona)

El endpoint `GET /meetings/:meetingId` ya verifica:
```ts
Meeting where id = meetingId AND project.members.some({ userId, isActive: true })
```
No se requieren cambios en el backend para el flujo básico.

**Opcional — Link con token de meeting (para invitados no miembros):**  
Si se quiere invitar a alguien que aún no es miembro, se puede reutilizar el flujo de `ProjectInvite` del BUG-02: crear un invite al proyecto y compartirlo junto con el link de la reunión.

#### Frontend

**1. Botón "Copiar link de reunión" en la pantalla de la sala:**

En `features/video-call/VideoCallRoom.tsx`, agregar en el `<header>`:
```tsx
<button onClick={() => navigator.clipboard.writeText(window.location.href)}>
  <Copy className="h-4 w-4" /> Copiar link
</button>
```

**2. Botón "Compartir reunión" en la página de detalle de reunión:**

En `app/(dashboard)/projects/[projectId]/meetings/[meetingId]/page.tsx`, agregar:
```tsx
<Button variant="outline" onClick={copyMeetingLink}>
  <Link2 className="h-4 w-4 mr-2" /> Copiar link de sala
</Button>
```

**3. Página de acceso denegado (`app/(dashboard)/meetings/access-denied/page.tsx`):**

Cuando un usuario autenticado intenta entrar a una sala de reunión sin ser miembro del proyecto, mostrar:
```
╔══════════════════════════════════════╗
║  Sin acceso a esta reunión            ║
║  No eres miembro del proyecto que    ║
║  organiza esta reunión.               ║
║                                       ║
║  [Ir al inicio]                       ║
╚══════════════════════════════════════╝
```

**4. Manejo del error en la sala:**

En `app/(dashboard)/projects/[projectId]/meetings/[meetingId]/room/page.tsx`, si `getMeeting` devuelve 403/404, redirigir a la página de acceso denegado en vez de mostrar un error genérico.

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `task_manager_front/features/video-call/VideoCallRoom.tsx` | Agregar botón "Copiar link" en el header |
| `task_manager_front/app/(dashboard)/projects/[projectId]/meetings/[meetingId]/page.tsx` | Agregar botón "Copiar link de sala" |
| `task_manager_front/app/(dashboard)/projects/[projectId]/meetings/[meetingId]/room/page.tsx` | Redirigir a access-denied si 403 |
| `task_manager_front/app/(dashboard)/meetings/access-denied/page.tsx` | Nuevo — página de acceso denegado |

### Criterio de aceptación
- El host puede copiar el link de la sala con un clic, tanto desde la sala como desde la página de detalle de la reunión.
- Si un usuario sin membresía en el proyecto intenta acceder al link → ve la página de acceso denegado.
- El link compartido lleva directamente a la sala sin pasos adicionales para usuarios miembros.

---

## BUG-04 — Videollamada: diseño no responsivo en móvil

### Descripción
En dispositivos móviles, los botones de micrófono, cámara y finalizar llamada no son visibles o quedan cortados. El footer de controles puede quedar oculto detrás de la barra de direcciones del navegador o fuera del viewport.

### Causa raíz

**`features/video-call/CallControls.tsx`:**
```tsx
// ACTUAL — el botón "End Meeting"/"Leave" tiene texto largo que ocupa espacio
<Button variant="destructive" onClick={onLeave} disabled={leaving} className="gap-2">
  <PhoneOff className="h-5 w-5" />
  {leaving ? t("videoCall.processing") : isHost ? t("videoCall.endMeeting") : t("videoCall.leave")}
</Button>
```
En pantallas `< 375px` el texto del botón rojo empuja el layout y puede salir del viewport.

**`features/video-call/VideoCallRoom.tsx`:**
```tsx
// ACTUAL — sin min-height en el footer, sin safe-area para notch de iPhone
<div className="fixed inset-0 z-50 flex h-screen flex-col bg-gray-950 text-white">
```
`h-screen` en iOS Safari no descuenta la barra de navegación inferior, causando que el footer quede detrás de ella. Se debe usar `h-dvh` (dynamic viewport height).

**`features/video-call/VideoCallRoom.tsx` — header:**
```tsx
<header className="flex items-center justify-between border-b border-gray-800 px-6 py-3">
```
`px-6` es demasiado en pantallas `< 375px`.

### Solución propuesta

#### `VideoCallRoom.tsx` — contenedor principal

```tsx
// ANTES
<div className="fixed inset-0 z-50 flex h-screen flex-col bg-gray-950 text-white">

// DESPUÉS — h-dvh descuenta la barra de navegación en iOS Safari
<div className="fixed inset-0 z-50 flex h-dvh flex-col bg-gray-950 text-white">
```

#### `VideoCallRoom.tsx` — header responsivo

```tsx
// ANTES
<header className="flex items-center justify-between border-b border-gray-800 px-6 py-3">
  <h1 className="text-lg font-semibold">{meetingTitle}</h1>
  ...
</header>

// DESPUÉS
<header className="flex items-center justify-between border-b border-gray-800 px-3 py-2 sm:px-6 sm:py-3">
  <h1 className="truncate text-sm font-semibold sm:text-lg">{meetingTitle}</h1>
  ...
</header>
```

#### `CallControls.tsx` — controles responsivos

```tsx
// ANTES — texto visible siempre, botones pueden salirse en móvil
<div className="flex items-center justify-center gap-3 border-t border-gray-800 bg-gray-900 p-4">
  <Button size="icon" ...>...</Button>
  <Button size="icon" ...>...</Button>
  <Button variant="destructive" className="gap-2">
    <PhoneOff className="h-5 w-5" />
    {labelText}
  </Button>
</div>

// DESPUÉS — en móvil solo iconos; en sm+ aparece el texto del botón rojo
<div className="flex shrink-0 items-center justify-center gap-3 border-t border-gray-800 bg-gray-900 p-3 pb-safe sm:p-4">
  <Button size="icon" ...>...</Button>
  <Button size="icon" ...>...</Button>
  <Button
    variant="destructive"
    size="icon"           // icono solo en móvil
    className="sm:w-auto sm:px-4 sm:gap-2"
    onClick={onLeave}
    disabled={leaving}
  >
    <PhoneOff className="h-5 w-5" />
    <span className="hidden sm:inline">{labelText}</span>
  </Button>
</div>
```

**Nota:** `pb-safe` requiere configurar `tailwind.config.js` con el plugin `tailwindcss-safe-area` o usar `pb-[env(safe-area-inset-bottom)]` para respetar el notch inferior en iPhone X+.

#### `VideoGrid.tsx` — área de video

```tsx
// Asegurar que el área de video no desborde cuando el footer existe
// ANTES
<div className="flex-1 overflow-auto">

// DESPUÉS — no cambia, pero verificar que flex-col en el padre hace que
// flex-1 tome el espacio restante correctamente con h-dvh
```

#### `tailwind.config.js` — soporte safe-area

```js
// Agregar al config de Tailwind para soportar notch en iPhone
theme: {
  extend: {
    padding: {
      'safe': 'env(safe-area-inset-bottom)',
    }
  }
}
```

Alternativamente, agregar en `globals.css`:
```css
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom, 0px);
}
```

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `features/video-call/VideoCallRoom.tsx` | `h-screen` → `h-dvh`; reducir padding del header en móvil |
| `features/video-call/CallControls.tsx` | Ocultar texto en móvil (`hidden sm:inline`); agregar `pb-safe` al footer |
| `app/globals.css` | Agregar clase `.pb-safe` para safe-area-inset-bottom |

### Criterio de aceptación
- En iPhone SE (375px) y móviles Android (360px) los tres botones de control son visibles y pulsables.
- La barra de controles no queda oculta detrás de la barra de navegación del navegador en iOS Safari.
- El header no desborda en pantallas pequeñas.
- En desktop/tablet, la UI es idéntica a la actual.

---

## BUG-05 — WebRTC: falla al entrar si mic/cámara no disponibles

### Descripción
Usuarios no pueden entrar a una reunión cuando el micrófono o la cámara están en uso por otra aplicación, no disponibles, o cuando el usuario deniega el permiso. El error `"device in use"` o `"not connected"` impide el acceso completo a la sala. El sistema debería permitir entrar con dispositivos apagados y activarlos después.

### Causa raíz

**`features/video-call/useWebRTC.ts`:**

```ts
// BUG 1 — getSingleMedia con audio + video falla si CUALQUIERA no está disponible
navigator.mediaDevices!
  .getUserMedia({ audio: true, video: true })
  .then((stream) => { setLocalStream(stream) })
  .catch((err) => {
    setError(err.message || "Could not access camera/microphone")
    // ← NO hay fallback; el usuario se queda con error y sin stream
  })

// BUG 2 — signaling SOLO conecta si hay localStream
const signaling = useSignaling({
  meetingId,
  enabled: enabled && Boolean(localStream),  // ← si no hay stream, no conecta
  ...
})
```

Si `getUserMedia` falla, `localStream` queda en `null` → `enabled` pasa `false` a `useSignaling` → el usuario nunca se conecta al servidor de señalización → aparece "no conectado".

### Solución propuesta

#### `useWebRTC.ts` — adquisición de medios con fallback gradual

```ts
// NUEVO — intenta audio+video, luego solo audio, luego solo video, luego sin medios
async function acquireMedia(): Promise<MediaStream | null> {
  // 1. Intentar ambos
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
  } catch {}

  // 2. Solo audio (cámara en uso o no disponible)
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
  } catch {}

  // 3. Solo video (mic no disponible)
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video: true })
  } catch {}

  // 4. Sin medios — el usuario entra como oyente
  return null
}
```

#### `useWebRTC.ts` — desacoplar signaling de localStream

```ts
// ANTES — signaling depende de localStream
const signaling = useSignaling({
  enabled: enabled && Boolean(localStream),  // ← falla si no hay stream
  ...
})

// DESPUÉS — signaling conecta en cuanto enabled=true, con o sin stream
const signaling = useSignaling({
  enabled: enabled,   // ← conectar inmediatamente
  ...
})
```

#### `useWebRTC.ts` — estado de dispositivos disponibles

Agregar estado para informar a la UI qué dispositivos están disponibles:

```ts
const [deviceState, setDeviceState] = useState({
  hasAudio: false,
  hasVideo: false,
  mediaError: null as string | null,
})
```

Después de intentar adquirir medios:
```ts
const stream = await acquireMedia()
setLocalStream(stream)
setDeviceState({
  hasAudio: stream ? stream.getAudioTracks().length > 0 : false,
  hasVideo: stream ? stream.getVideoTracks().length > 0 : false,
  mediaError: stream === null ? "No se pudo acceder a cámara ni micrófono. Entrando como oyente." : null,
})
```

#### `VideoCallRoom.tsx` — estado inicial de controles

Inicializar `audioEnabled` y `videoEnabled` según lo que realmente esté disponible:

```ts
// ANTES — siempre inicia con true aunque no haya dispositivos
const [audioEnabled, setAudioEnabled] = useState(true)
const [videoEnabled, setVideoEnabled] = useState(true)

// DESPUÉS — sincronizar con lo que devuelve el hook
const [audioEnabled, setAudioEnabled] = useState(false)
const [videoEnabled, setVideoEnabled] = useState(false)

useEffect(() => {
  setAudioEnabled(deviceState.hasAudio)
  setVideoEnabled(deviceState.hasVideo)
}, [deviceState.hasAudio, deviceState.hasVideo])
```

#### `VideoCallRoom.tsx` — mostrar advertencia (no error bloqueante)

```tsx
// ANTES — el error de medios es un banner rojo que confunde al usuario
{error && (
  <div className="... bg-red-900/40 text-red-200">
    {resolveMediaError(error)}
  </div>
)}

// DESPUÉS — si hay deviceState.mediaError, mostrar como advertencia amarilla (no error crítico)
// Los errores críticos (INSECURE_CONTEXT) siguen siendo rojos
{deviceState.mediaError && (
  <div className="... bg-amber-900/40 text-amber-200">
    {deviceState.mediaError} — puedes escuchar la reunión.
  </div>
)}
{criticalError && (
  <div className="... bg-red-900/40 text-red-200">
    {resolveCriticalError(criticalError)}
  </div>
)}
```

#### `useWebRTC.ts` — retornar deviceState

```ts
return {
  localStream,
  remoteStreams: Object.values(remoteStreams),
  connected: signaling.connected,
  error: criticalError ?? signaling.error,
  deviceState,                                // ← nuevo
}
```

### Archivos a modificar

| Archivo | Cambio |
|---|---|
| `features/video-call/useWebRTC.ts` | Función `acquireMedia()` con fallback; desacoplar `signaling.enabled` de `localStream`; exponer `deviceState` |
| `features/video-call/VideoCallRoom.tsx` | Inicializar controles según `deviceState`; separar advertencia de error crítico |

### Criterio de aceptación
- Un usuario con cámara en uso por otra app puede entrar a la reunión con audio solamente.
- Un usuario con micrófono y cámara denegados puede entrar como oyente (recibe audio/video de otros).
- Al entrar sin dispositivos, aparece una advertencia amarilla "Entrando como oyente" — no un error rojo bloqueante.
- El indicador "no conectado" desaparece en todos los casos; la señalización funciona independientemente de si hay dispositivos disponibles.
- Los botones de mic y cam están desactivados automáticamente si el dispositivo no estuvo disponible al entrar.

---

## Resumen de archivos por bug

| Bug | Backend | Frontend |
|---|---|---|
| BUG-01 | `users.repository.ts`, `users.service.ts`, `users.controller.ts` | — |
| BUG-02 | `schema.prisma`, nuevo módulo `src/modules/invites/`, `email.service.ts`, `app.ts` | `projects.api.ts`, `projects.hooks.ts`, `projects/[id]/page.tsx`, nueva página `invite/project/[token]/page.tsx` |
| BUG-03 | — | `VideoCallRoom.tsx`, `meetings/[id]/page.tsx`, `meetings/[id]/room/page.tsx`, nueva página `access-denied` |
| BUG-04 | — | `VideoCallRoom.tsx`, `CallControls.tsx`, `globals.css` |
| BUG-05 | — | `useWebRTC.ts`, `VideoCallRoom.tsx` |

## Orden de implementación recomendado

```
BUG-05  →  BUG-04  →  BUG-01  →  BUG-03  →  BUG-02
```

- **BUG-05 y BUG-04 primero** — son los que más impactan la capacidad de los usuarios de entrar a reuniones (bloqueo total en algunos casos).
- **BUG-01** — mejora de privacidad, no es bloqueante pero es urgente.
- **BUG-03** — mejora de UX, depende del estado estable de la sala de reunión.
- **BUG-02** — el más complejo (nuevo módulo + Prisma + emails), implementar al final para no bloquear los demás.
