# Plan de Implementación — Panel Super Administrador (SaaS Owner View)

> Sprint 4 · Módulo de Administración Global  
> Propietario de la plataforma: `fsociety.soporte@gmail.com`

---

## Índice

1. [Visión y alcance](#1-visión-y-alcance)
2. [Inventario de lo que ya existe](#2-inventario-de-lo-que-ya-existe)
3. [Cambios en el modelo de datos](#3-cambios-en-el-modelo-de-datos)
4. [Backend — nuevos módulos y rutas](#4-backend--nuevos-módulos-y-rutas)
5. [Frontend — panel de administración](#5-frontend--panel-de-administración)
6. [Widget flotante de feedback (lado del usuario)](#6-widget-flotante-de-feedback-lado-del-usuario)
7. [Chat de soporte (reutilizar chat existente)](#7-chat-de-soporte-reutilizar-chat-existente)
8. [Formulario de contacto a soporte](#8-formulario-de-contacto-a-soporte)
9. [Migración del usuario super admin](#9-migración-del-usuario-super-admin)
10. [Seguridad y guards](#10-seguridad-y-guards)
11. [Plan de implementación por fases](#11-plan-de-implementación-por-fases)
12. [Resumen de archivos](#12-resumen-de-archivos)

---

## 1. Visión y alcance

El super administrador (`SUPER_ADMIN`) es el propietario del SaaS. Tiene una vista global de
la plataforma completamente separada de la UI normal de usuario. Sus capacidades son:

| Capacidad | Descripción |
|---|---|
| **Métricas de plataforma** | Usuarios totales/activos, proyectos, reuniones, documentos, uso por período |
| **Gestión de usuarios** | Ver todos los usuarios, activar/desactivar, cambiar rol |
| **Feedback de usuarios** | Ver calificaciones (estrellas 1–5) y comentarios enviados desde el widget flotante |
| **Chat de soporte** | Chatear con cualquier usuario del sistema 1:1 (reutiliza la infraestructura de chats `DIRECT`) |
| **Calificaciones globales** | Promedio de estrellas, distribución, evolución en el tiempo |

### Lo que necesita el usuario regular (nuevo)

| Capacidad | Descripción |
|---|---|
| **Widget de feedback** | Burbuja flotante en toda la app para calificar (⭐ 1–5) y dejar un comentario |
| **Chat de soporte** | Canal de chat directo con el super admin (aparece en su lista de chats como "Soporte") |
| **Formulario de contacto** | Formulario en la página de ayuda que envía email al soporte sin abrir un cliente de correo |

---

## 2. Inventario de lo que ya existe

### Roles actuales
`prisma/schema.prisma` — enum `RoleName`:
```prisma
enum RoleName {
  ADMIN    // administrador de proyecto
  MEMBER   // miembro normal
  GUEST    // invitado de solo lectura
}
```
**Falta:** `SUPER_ADMIN`. Se añadirá como el rol más alto de la plataforma.

### Chat DIRECT
`Chat` con `type = DIRECT` ya existe y soporta mensajes, adjuntos, tiempo real y notificaciones.
El servicio `findOrCreateDirectChat` en `chats.service.ts` ya puede crear/encontrar un chat 1:1.
Solo hay que invocar esto automáticamente cuando se registra un nuevo usuario.

### Email (nodemailer)
`src/shared/email.service.ts` ya tiene `nodemailer` configurado con SMTP y dos funciones:
`sendVerificationEmail` y `sendProjectInviteEmail`. Se añadirá `sendSupportContactEmail`.

### Dashboard de usuario
`src/modules/dashboard/` ya tiene toda la lógica de KPIs, burndown, velocidad, etc., **por usuario**.
El admin panel reutilizará patrones similares pero con **scope de plataforma** (sin filtro por userId).

### JWT y `req.user`
`auth.middleware.ts` pone `{ id, email, roleId }` en `req.user`. El middleware de super admin
consultará si ese `roleId` corresponde al rol `SUPER_ADMIN`.

---

## 3. Cambios en el modelo de datos

### 3.1 Enum `RoleName` — añadir `SUPER_ADMIN`

```prisma
enum RoleName {
  SUPER_ADMIN  // ← nuevo — propietario de la plataforma
  ADMIN
  MEMBER
  GUEST
}
```

### 3.2 Modelo `AppFeedback` — calificaciones y comentarios de usuarios

```prisma
model AppFeedback {
  id        String   @id @default(uuid())
  userId    String
  rating    Int      // 1–5 estrellas
  comment   String?  // texto libre opcional
  page      String?  // contexto: "dashboard", "kanban", "meetings", etc.
  appVersion String? // para correlacionar con releases
  createdAt DateTime @default(now())

  user      User     @relation("UserFeedback", fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([rating])
  @@index([createdAt])
}
```

Añadir en `User`:
```prisma
feedbacks   AppFeedback[] @relation("UserFeedback")
```

### 3.3 Tabla de soporte de email (sin modelo, solo SMTP)

No se persiste el formulario de contacto. El backend simplemente envía el email al soporte y
responde `200`. Si se quiere un historial en el futuro, se puede añadir un modelo `SupportTicket`.

---

## 4. Backend — nuevos módulos y rutas

### 4.1 Estructura de archivos nueva

```
src/modules/admin/
  admin.routes.ts
  admin.controller.ts
  admin.service.ts
  admin.repository.ts

src/modules/feedback/
  feedback.routes.ts
  feedback.controller.ts
  feedback.service.ts
  feedback.repository.ts
  feedback.schema.ts

src/modules/support/
  support.routes.ts
  support.controller.ts
  support.service.ts
  support.schema.ts

src/middlewares/
  super-admin.middleware.ts    ← nuevo guard
```

### 4.2 Middleware `super-admin.middleware.ts`

```ts
import { Request, Response, NextFunction } from "express";
import { AppError } from "../shared/errors/AppError";
import { prisma } from "../prisma/client";

export async function superAdminMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    const role = await prisma.role.findUnique({
      where: { id: req.user!.roleId },
      select: { name: true },
    });
    if (role?.name !== "SUPER_ADMIN") {
      throw new AppError("Access denied", 403);
    }
    next();
  } catch (err) {
    next(err instanceof AppError ? err : new AppError("Access denied", 403));
  }
}
```

> **Optimización:** cachear el roleId del SUPER_ADMIN en memoria al arrancar el servidor
> para evitar una query por request. Alternativamente guardar `role.name` en el JWT.

### 4.3 Rutas del Admin Panel (`admin.routes.ts`)

Todas protegidas por `authMiddleware` + `superAdminMiddleware`.

```
GET  /api/v1/admin/metrics         — métricas globales de la plataforma
GET  /api/v1/admin/users           — lista paginada de todos los usuarios
PATCH /api/v1/admin/users/:id      — activar/desactivar, cambiar rol
GET  /api/v1/admin/feedback        — todos los feedbacks (paginado, filtrable por rating/fecha)
GET  /api/v1/admin/feedback/stats  — promedio, distribución, evolución
GET  /api/v1/admin/support-chats   — chats directos del super admin con usuarios
```

#### `GET /api/v1/admin/metrics` — respuesta esperada

```json
{
  "success": true,
  "data": {
    "users": {
      "total": 120,
      "active": 115,
      "newLast7Days": 8,
      "newLast30Days": 32,
      "byProvider": { "email": 80, "google": 40 }
    },
    "projects": {
      "total": 45,
      "active": 38
    },
    "tasks": {
      "total": 890,
      "completed": 340
    },
    "meetings": {
      "total": 200,
      "withMinutes": 160
    },
    "documents": {
      "total": 95
    },
    "chats": {
      "totalMessages": 4200,
      "directChats": 110
    },
    "feedback": {
      "count": 65,
      "averageRating": 4.2
    },
    "registrationsByDay": [
      { "date": "2026-06-20", "count": 3 },
      { "date": "2026-06-21", "count": 5 }
    ]
  }
}
```

#### `GET /api/v1/admin/users` — query params

```
?page=1&limit=20&search=&role=&isActive=&sortBy=createdAt&order=desc
```

Respuesta incluye: `id`, `name`, `email`, `role.name`, `isActive`, `emailVerified`,
`googleId` (solo booleano: `hasGoogle`), `createdAt`, `_count.memberships`, `_count.tasks`.

#### `PATCH /api/v1/admin/users/:id` — body

```json
{
  "isActive": false,
  "roleId": 2
}
```

El `roleId` del `SUPER_ADMIN` no puede cambiarse ni el super admin puede desactivarse a sí mismo.

#### `GET /api/v1/admin/feedback` — query params

```
?page=1&limit=20&rating=&from=&to=&sortBy=createdAt&order=desc
```

Incluye datos del usuario (`user.name`, `user.email`) para contextualizar el feedback.

#### `GET /api/v1/admin/feedback/stats`

```json
{
  "success": true,
  "data": {
    "count": 65,
    "average": 4.2,
    "distribution": { "1": 2, "2": 3, "3": 5, "4": 20, "5": 35 },
    "byDay": [
      { "date": "2026-06-20", "average": 4.5, "count": 8 }
    ]
  }
}
```

### 4.4 Rutas de Feedback (`feedback.routes.ts`)

Protegidas por `authMiddleware` (cualquier usuario autenticado).

```
POST /api/v1/feedback          — enviar calificación + comentario
GET  /api/v1/feedback/my       — mis propios feedbacks (para evitar spam)
```

#### `POST /api/v1/feedback` — body (Zod schema)

```ts
const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
  page: z.string().max(50).optional(),    // contexto de la página
});
```

Rate limit: 3 feedbacks por usuario por día (anti-spam).

### 4.5 Rutas de Soporte (`support.routes.ts`)

```
POST /api/v1/support/contact   — enviar email de contacto al soporte
```

Protegido por `authMiddleware`.

#### `POST /api/v1/support/contact` — body (Zod schema)

```ts
const contactSchema = z.object({
  subject: z.string().min(5).max(100),
  message: z.string().min(10).max(2000),
  category: z.enum(["bug", "feature", "billing", "other"]).default("other"),
});
```

El servicio llama a `sendSupportContactEmail()` de `email.service.ts`:

```ts
// src/shared/email.service.ts — nueva función
export async function sendSupportContactEmail(params: {
  fromName: string;
  fromEmail: string;
  subject: string;
  message: string;
  category: string;
}): Promise<void> {
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: env.SMTP_USER,           // correo del soporte (fsociety.soporte@gmail.com)
    replyTo: params.fromEmail,   // el usuario puede ser respondido directamente
    subject: `[Soporte][${params.category}] ${params.subject}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>Mensaje de contacto</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td><strong>De:</strong></td><td>${params.fromName} (${params.fromEmail})</td></tr>
          <tr><td><strong>Categoría:</strong></td><td>${params.category}</td></tr>
          <tr><td><strong>Asunto:</strong></td><td>${params.subject}</td></tr>
        </table>
        <hr>
        <p style="white-space:pre-wrap">${params.message}</p>
      </div>
    `,
  });
}
```

### 4.6 Auto-crear chat de soporte al registrarse

En `auth.service.ts`, después de crear un usuario (tanto registro por email como Google OAuth),
llamar a una función auxiliar que crea el chat de soporte:

```ts
// src/modules/chats/chats.service.ts — nueva función auxiliar
export async function ensureSupportChat(userId: string): Promise<void> {
  const superAdmin = await prisma.user.findFirst({
    where: { role: { name: "SUPER_ADMIN" } },
    select: { id: true },
  });
  if (!superAdmin || superAdmin.id === userId) return;

  // Reutiliza find-or-create existente
  await findOrCreateDirectChat(userId, superAdmin.id);
}
```

Llamadas en `auth.service.ts`:
```ts
// Al final de register() y googleAuth() — después de createUser()
import { ensureSupportChat } from "../chats/chats.service";

// En register():
const user = await createUser({ ... });
void ensureSupportChat(user.id).catch(console.error); // fire-and-forget, no bloquea el registro

// En googleAuth():
// Al crear usuario nuevo o primer login con Google
void ensureSupportChat(user.id).catch(console.error);
```

El chat aparece en la lista de chats del usuario como `"Soporte"` (el nombre del super admin
se puede fijar a `"Soporte · Task Manager"` en la UI si el participante es SUPER_ADMIN).

---

## 5. Frontend — panel de administración

### 5.1 Nueva estructura de rutas

```
task_manager_front/app/(admin)/
  layout.tsx                     — sidebar de admin (diferente al de usuario)
  admin/
    page.tsx                     — métricas (dashboard principal)
    users/
      page.tsx                   — tabla de usuarios
    feedback/
      page.tsx                   — calificaciones y comentarios
    support/
      page.tsx                   — chats de soporte (reutiliza ChatLayout)
```

La ruta `/admin` está protegida en `middleware.ts`: solo accesible si `role.name === 'SUPER_ADMIN'`.
El check se hace en el servidor comparando el `roleId` del JWT con el id del rol `SUPER_ADMIN`.

```ts
// middleware.ts — añadir al guard
const ADMIN_PREFIX = "/admin";

if (pathname.startsWith(ADMIN_PREFIX)) {
  // Verificar que el usuario sea SUPER_ADMIN
  // Si no → redirect a /dashboard
}
```

> Como el JWT no guarda `role.name` (solo `roleId`), se puede hacer esto de dos formas:
> - **Opción A (recomendada):** Incluir `roleName` en el payload del JWT. Modificar `issueToken()`.
> - **Opción B:** En el middleware de Next.js, el check es solo superficial (redirect si no es el email correcto); el backend valida con `superAdminMiddleware` en cada request.

### 5.2 Feature module `features/admin/`

```
features/admin/
  admin.api.ts        — GET /admin/metrics, /admin/users, /admin/feedback, /admin/feedback/stats
  admin.hooks.ts      — useAdminMetrics, useAdminUsers, useAdminFeedback, useAdminFeedbackStats
  admin.types.ts      — AdminMetrics, AdminUser, AdminFeedback
```

### 5.3 Layout del admin (`app/(admin)/layout.tsx`)

Sidebar diferente al del usuario normal. Items:

```
┌─────────────────────────────────┐
│  ⬢ Task Manager Admin           │
│  ─────────────────────────────  │
│  📊  Métricas de plataforma     │
│  👥  Usuarios                   │
│  ⭐  Feedback & Calificaciones  │
│  💬  Chats de soporte           │
│  ─────────────────────────────  │
│  🔗  Ver como usuario           │  ← link a /dashboard
│  🚪  Cerrar sesión              │
└─────────────────────────────────┘
```

### 5.4 Página de métricas (`app/(admin)/admin/page.tsx`)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Task Manager · Admin                         Beta v0.1.0           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  KPIs globales (cards)                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ 120      │  │ 45       │  │ 890      │  │ ⭐ 4.2   │            │
│  │ Usuarios │  │ Proyectos│  │ Tareas   │  │ Rating   │            │
│  │ +8 / 7d  │  │ activos  │  │ totales  │  │ (65 resp)│            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
│                                                                       │
│  Registros por día (line chart — últimos 30 días)                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  ^                                                           │   │
│  │  │   ·     ·   ··                                           │   │
│  │  │ ·   · ·   ·    ···    ·····                             │   │
│  │  └─────────────────────────────────────────────────────→   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                       │
│  Distribución de calificaciones           Proveedores de auth        │
│  ┌─────────────────────────────────┐   ┌──────────────────────────┐ │
│  │ ⭐⭐⭐⭐⭐  ████████░░  54%  │   │  Email: 80   Google: 40   │ │
│  │ ⭐⭐⭐⭐   █████░░░░  31%  │   │  ██████████  ████████     │ │
│  │ ⭐⭐⭐    ██░░░░░░░   8%  │   └──────────────────────────┘ │
│  │ ⭐⭐     █░░░░░░░░   5%  │                                   │
│  │ ⭐      ░░░░░░░░░   2%  │   Métricas adicionales             │
│  └─────────────────────────────────┘   ┌──────────────────────────┐ │
│                                         │  Reuniones: 200           │ │
│                                         │  Con minutas: 160 (80%)  │ │
│                                         │  Documentos: 95          │ │
│                                         │  Mensajes chat: 4,200    │ │
│                                         └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

Componentes a crear (bajo `features/admin/`):
- `AdminKpis.tsx` — 4 cards con KPIs globales
- `RegistrationChart.tsx` — Recharts LineChart de registros por día
- `FeedbackDistributionChart.tsx` — Recharts BarChart de distribución de estrellas
- `AuthProviderChart.tsx` — PieChart de email vs Google
- `PlatformStatsCard.tsx` — card con métricas de reuniones/docs/chats

### 5.5 Página de usuarios (`app/(admin)/admin/users/page.tsx`)

```
┌───────────────────────────────────────────────────────────────────┐
│  Usuarios del sistema                                              │
│                                                                     │
│  [🔍 Buscar usuario...]  [Rol: Todos ▼]  [Estado: Todos ▼]       │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ Nombre       │ Email           │ Rol      │ Estado │ Acción │  │
│  ├─────────────────────────────────────────────────────────────┤  │
│  │ Juan García  │ juan@email.com  │ MEMBER   │ ✓ Act. │ [···]  │  │
│  │ Ana López    │ ana@email.com   │ ADMIN    │ ✓ Act. │ [···]  │  │
│  │ Carlos M.    │ carlos@...      │ GUEST    │ ✗ Inac.│ [···]  │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                          [< 1 2 3 4 >]            │
└───────────────────────────────────────────────────────────────────┘
```

Menú `[···]` por usuario:
- Activar / Desactivar cuenta
- Cambiar rol (MEMBER / ADMIN / GUEST)
- Abrir chat de soporte con este usuario

### 5.6 Página de feedback (`app/(admin)/admin/feedback/page.tsx`)

```
┌──────────────────────────────────────────────────────────────────┐
│  Feedback de usuarios                                             │
│                                                                    │
│  Rating promedio: ⭐ 4.2 / 5  (65 respuestas)                   │
│                                                                    │
│  Filtros: [Fecha desde ▼] [Fecha hasta ▼] [★ 1-5 ▼]            │
│                                                                    │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Usuario      │ Rating │ Comentario              │ Página │Fecha│
│  ├─────────────────────────────────────────────────────────────┤ │
│  │ Juan García  │ ⭐⭐⭐⭐⭐ │ "Excelente, fácil de…" │ kanban│06/20│
│  │ Ana López    │ ⭐⭐⭐⭐  │ "Podría mejorar la UI" │ docs  │06/19│
│  │ Carlos M.    │ ⭐⭐⭐   │ (sin comentario)        │ —     │06/18│
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
```

### 5.7 Página de chats de soporte (`app/(admin)/admin/support/page.tsx`)

Reutiliza **exactamente** `ChatLayout` + `ChatList` + `ChatWindow` ya existentes.
El super admin ve todos sus chats directos (que son los chats de soporte con usuarios).
La única diferencia es que el nombre de cada chat muestra el nombre del usuario, no "Usuario desconocido".

En el `ChatList`, para el super admin, el nombre del chat es el nombre del otro participante.
Esto ya funciona con el código existente (`other?.user.name ?? "Usuario"`).

---

## 6. Widget flotante de feedback (lado del usuario)

### 6.1 Componente `FeedbackWidget.tsx`

Ubicación: `task_manager_front/components/FeedbackWidget.tsx`

Se renderiza en `app/(dashboard)/layout.tsx` para que esté disponible en **todas** las páginas del dashboard.

#### Diseño (dos estados)

**Estado cerrado — botón flotante en la esquina inferior derecha:**
```
                              ╔══════╗
                              ║  💬  ║
                              ╚══════╝
```

**Estado abierto — panel emergente (300px × 260px):**
```
╔══════════════════════════════════╗
║  ¿Cómo valorarías la app?    ✕  ║
╠══════════════════════════════════╣
║                                   ║
║      ☆  ☆  ☆  ☆  ☆              ║
║     (click para calificar)        ║
║                                   ║
║  ┌────────────────────────────┐  ║
║  │ Cuéntanos más (opcional)   │  ║
║  │                            │  ║
║  └────────────────────────────┘  ║
║                                   ║
║  [Cancelar]      [Enviar ✓]      ║
╚══════════════════════════════════╝
```

**Estado tras envío exitoso:**
```
╔══════════════════════════════════╗
║       ¡Gracias por tu opinión!  ║
║        Tu feedback nos ayuda     ║
║        a mejorar la plataforma.  ║
║                     [Cerrar]     ║
╚══════════════════════════════════╝
```

### 6.2 Lógica del widget

```tsx
// components/FeedbackWidget.tsx

"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { useMutateFeedback } from "@/features/feedback/feedback.hooks";

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const pathname = usePathname();
  const { mutate, isPending } = useMutateFeedback();

  function handleSubmit() {
    if (!rating) return;
    mutate(
      { rating, comment: comment || undefined, page: getPageContext(pathname) },
      {
        onSuccess: () => setSent(true),
        onError: () => { /* toast de error */ },
      }
    );
  }

  function getPageContext(path: string): string {
    if (path.includes("/kanban")) return "kanban";
    if (path.includes("/meetings")) return "meetings";
    if (path.includes("/documents")) return "documents";
    if (path.includes("/chats")) return "chats";
    if (path.includes("/copilot")) return "copilot";
    if (path.includes("/dashboard")) return "dashboard";
    return "other";
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {open ? (
        <div className="w-80 rounded-xl border bg-background shadow-xl">
          {/* ... UI del panel ... */}
        </div>
      ) : (
        <button
          onClick={() => { setOpen(true); setSent(false); setRating(0); setComment(""); }}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90"
        >
          💬
        </button>
      )}
    </div>
  );
}
```

### 6.3 Feature module `features/feedback/`

```
features/feedback/
  feedback.api.ts       — POST /feedback, GET /feedback/my
  feedback.hooks.ts     — useMutateFeedback, useMyFeedback
  feedback.types.ts     — FeedbackPayload, FeedbackItem
```

```ts
// feedback.api.ts
export async function submitFeedback(payload: {
  rating: number;
  comment?: string;
  page?: string;
}): Promise<void> {
  await apiClient.post("/api/v1/feedback", payload);
}
```

### 6.4 Anti-spam

- Rate limit en el backend: máximo 3 feedbacks por usuario por día.
- En el frontend: tras enviar, el widget no muestra el botón durante 24h (localStorage).
- El super admin no ve el widget de feedback (si `role === SUPER_ADMIN`, no renderizar).

---

## 7. Chat de soporte (reutilizar chat existente)

### 7.1 Auto-creación del chat al registrarse

La función `ensureSupportChat(userId)` (descrita en §4.6) se llama tras crear un usuario en:
- `auth.service.ts` → `register()` (email+password)
- `auth.service.ts` → `googleAuth()` (primera vez con Google)

**Para usuarios ya existentes**: script backfill idempotente:

```ts
// prisma/backfill-support-chats.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const superAdmin = await prisma.user.findFirst({
    where: { role: { name: "SUPER_ADMIN" } },
    select: { id: true },
  });
  if (!superAdmin) {
    console.log("No SUPER_ADMIN found. Skipping.");
    return;
  }

  const users = await prisma.user.findMany({
    where: { id: { not: superAdmin.id }, isActive: true },
    select: { id: true },
  });

  let created = 0;
  for (const user of users) {
    // Verificar si ya existe un chat directo entre los dos
    const existing = await prisma.chat.findFirst({
      where: {
        type: "DIRECT",
        participants: { some: { userId: user.id, isActive: true } },
        AND: { participants: { some: { userId: superAdmin.id, isActive: true } } },
      },
    });
    if (existing) continue;

    // Crear el chat de soporte
    await prisma.chat.create({
      data: {
        type: "DIRECT",
        participants: {
          create: [
            { userId: user.id },
            { userId: superAdmin.id },
          ],
        },
      },
    });
    created++;
  }

  console.log(`Backfill complete: ${created} support chats created.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

Ejecutar con:
```bash
npx ts-node prisma/backfill-support-chats.ts
```

### 7.2 UI del usuario — chat de soporte

En la lista de chats del usuario, el chat con el super admin aparece como `"Soporte"`.
Para lograr esto sin un tipo especial, en `chats.service.ts → listChats()` se puede detectar
si el otro participante tiene rol `SUPER_ADMIN` y retornar `name: "Soporte · Task Manager"`:

```ts
// En chats.service.ts — listChats()
const other = chat.participants.find((p) => p.userId !== userId);
const otherRole = await prisma.user.findUnique({
  where: { id: other?.userId ?? "" },
  select: { role: { select: { name: true } } },
});
const chatName = otherRole?.role.name === "SUPER_ADMIN"
  ? "Soporte · Task Manager"
  : other?.user.name ?? "Usuario";
```

> **Alternativa más eficiente:** incluir `role.name` en el select de `findUserChats()` del repository y manejarlo en una sola query.

---

## 8. Formulario de contacto a soporte

### 8.1 Actualizar `app/(dashboard)/help/page.tsx`

Reemplazar cualquier enlace `mailto:` existente por un formulario integrado:

```
┌──────────────────────────────────────────────────────────────────┐
│  📬 Contactar con soporte                                        │
│                                                                   │
│  Categoría: [Bug ▼] / [Solicitud de función] / [Otro]           │
│                                                                   │
│  Asunto:                                                          │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  (texto libre, max 100 caracteres)                         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  Mensaje:                                                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                                                             │  │
│  │  (texto libre, max 2000 caracteres)                        │  │
│  │                                                             │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  [   Enviar mensaje   ]                                          │
│                                                                   │
│  ✓ Respuesta en 24–48 h a: juan@email.com                        │
└──────────────────────────────────────────────────────────────────┘
```

### 8.2 Feature module `features/support/`

```
features/support/
  support.api.ts      — POST /support/contact
  support.hooks.ts    — useSendSupportContact
  support.types.ts    — ContactPayload
```

---

## 9. Migración del usuario super admin

### 9.1 Script `prisma/set-super-admin.ts`

```ts
// prisma/set-super-admin.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const SUPER_ADMIN_EMAIL = "fsociety.soporte@gmail.com";

async function main() {
  // 1. Crear el rol SUPER_ADMIN si no existe
  const superAdminRole = await prisma.role.upsert({
    where: { name: "SUPER_ADMIN" },
    update: {},
    create: { name: "SUPER_ADMIN" },
  });
  console.log(`Role SUPER_ADMIN: id=${superAdminRole.id}`);

  // 2. Encontrar el usuario
  const user = await prisma.user.findUnique({
    where: { email: SUPER_ADMIN_EMAIL },
    select: { id: true, name: true, roleId: true },
  });

  if (!user) {
    console.error(`User ${SUPER_ADMIN_EMAIL} not found. Has the user signed in via Google yet?`);
    process.exit(1);
  }

  // 3. Actualizar el rol
  await prisma.user.update({
    where: { email: SUPER_ADMIN_EMAIL },
    data: { roleId: superAdminRole.id },
  });

  console.log(`✅ User ${SUPER_ADMIN_EMAIL} (id=${user.id}) upgraded to SUPER_ADMIN`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
```

### 9.2 Ejecutar en orden

```bash
# 1. Añadir SUPER_ADMIN al enum en schema.prisma y migrar
npx prisma migrate dev --name add-super-admin-role-and-feedback

# 2. Promover el usuario al rol más alto
npx ts-node prisma/set-super-admin.ts

# 3. Backfill chats de soporte para usuarios ya existentes
npx ts-node prisma/backfill-support-chats.ts
```

### 9.3 Actualizar `seed.ts`

```ts
// prisma/seed.ts — actualizar lista de roles
const roles: RoleName[] = [RoleName.SUPER_ADMIN, RoleName.ADMIN, RoleName.MEMBER, RoleName.GUEST];
```

---

## 10. Seguridad y guards

### Guard en backend

- `superAdminMiddleware` en **todas** las rutas `/api/v1/admin/*` y `/api/v1/admin/**`.
- El super admin **no puede** cambiar su propio rol ni desactivarse a sí mismo (validado en `admin.service.ts`).
- El endpoint de feedback del usuario tiene rate limiting propio (3/día por usuario).
- El endpoint de contacto a soporte tiene rate limiting (5/hora por usuario).

### Guard en frontend (Next.js middleware)

```ts
// middleware.ts
// Añadir al guard de rutas:
if (pathname.startsWith("/admin")) {
  // Decodificar JWT del cookie — solo verificar claim básico
  // Si roleId no corresponde a SUPER_ADMIN → redirect a /dashboard
  // Esto es una barrera UX; el backend valida siempre
}
```

### El widget de feedback no se muestra al SUPER_ADMIN

```tsx
// app/(dashboard)/layout.tsx
import { useAuth } from "@/features/auth/auth.hooks";

const { user } = useAuth();
const isSuperAdmin = user?.role?.name === "SUPER_ADMIN";

{!isSuperAdmin && <FeedbackWidget />}
```

---

## 11. Plan de implementación por fases

### Fase 0 — Modelo de datos y migración (1 día)
- [ ] Añadir `SUPER_ADMIN` a `RoleName` en `schema.prisma`
- [ ] Añadir modelo `AppFeedback` en `schema.prisma`
- [ ] Ejecutar `prisma migrate dev`
- [ ] Actualizar `seed.ts` con el nuevo rol
- [ ] Ejecutar `set-super-admin.ts` para promover al usuario admin

### Fase 1 — Backend: módulos admin, feedback y soporte (2 días)
- [ ] Crear `super-admin.middleware.ts`
- [ ] Crear `src/modules/admin/` (metrics, users CRUD, feedback listing)
- [ ] Crear `src/modules/feedback/` (submit + rate limit)
- [ ] Crear `src/modules/support/` (contact form → SMTP)
- [ ] Añadir `sendSupportContactEmail` a `email.service.ts`
- [ ] Montar todos los routers en `app.ts`

### Fase 2 — Auto-chat de soporte (1 día)
- [ ] Añadir `ensureSupportChat()` en `chats.service.ts`
- [ ] Invocar en `auth.service.ts` → `register()` y `googleAuth()`
- [ ] Escribir `prisma/backfill-support-chats.ts` y ejecutar
- [ ] Renombrar el chat con super admin como "Soporte · Task Manager" en `listChats()`

### Fase 3 — Frontend: widget de feedback (1 día)
- [ ] Crear `features/feedback/` (api, hooks, types)
- [ ] Crear `components/FeedbackWidget.tsx` con estados: cerrado, abierto, enviado
- [ ] Integrar en `app/(dashboard)/layout.tsx` (excluir para SUPER_ADMIN)
- [ ] Anti-spam: localStorage + rate limit backend

### Fase 4 — Frontend: formulario de contacto (0.5 días)
- [ ] Crear `features/support/` (api, hooks, types)
- [ ] Actualizar `app/(dashboard)/help/page.tsx` con el formulario integrado
- [ ] Reemplazar cualquier `mailto:` existente por el formulario

### Fase 5 — Frontend: panel de administración (3 días)
- [ ] Crear `app/(admin)/layout.tsx` con sidebar de admin
- [ ] Añadir guard en `middleware.ts` para rutas `/admin`
- [ ] Crear `features/admin/` (api, hooks, types)
- [ ] Implementar `app/(admin)/admin/page.tsx` — métricas (KPIs + 4 gráficas)
- [ ] Implementar `app/(admin)/admin/users/page.tsx` — tabla con acciones
- [ ] Implementar `app/(admin)/admin/feedback/page.tsx` — tabla + stats de estrellas
- [ ] Implementar `app/(admin)/admin/support/page.tsx` — reusar ChatLayout

### Fase 6 — Pulido y pruebas (1 día)
- [ ] Verificar que el guard `/admin` en middleware funciona
- [ ] Verificar que `superAdminMiddleware` rechaza requests de usuarios normales
- [ ] Verificar que el widget de feedback envía correctamente
- [ ] Verificar que el formulario de contacto llega al correo de soporte
- [ ] Verificar que el chat de soporte aparece en la lista del usuario como "Soporte"

---

## 12. Resumen de archivos

### Backend — nuevos

| Archivo | Descripción |
|---|---|
| `prisma/schema.prisma` | Añadir `SUPER_ADMIN` a `RoleName`, modelo `AppFeedback` |
| `prisma/set-super-admin.ts` | Script de migración de rol |
| `prisma/backfill-support-chats.ts` | Backfill de chats de soporte |
| `src/middlewares/super-admin.middleware.ts` | Guard SUPER_ADMIN |
| `src/modules/admin/admin.routes.ts` | Rutas del panel admin |
| `src/modules/admin/admin.controller.ts` | Controllers admin |
| `src/modules/admin/admin.service.ts` | Lógica métricas + gestión usuarios |
| `src/modules/admin/admin.repository.ts` | Queries globales de plataforma |
| `src/modules/feedback/feedback.routes.ts` | POST /feedback, GET /feedback/my |
| `src/modules/feedback/feedback.controller.ts` | |
| `src/modules/feedback/feedback.service.ts` | Rate limit + persistencia |
| `src/modules/feedback/feedback.repository.ts` | |
| `src/modules/feedback/feedback.schema.ts` | Zod schema |
| `src/modules/support/support.routes.ts` | POST /support/contact |
| `src/modules/support/support.controller.ts` | |
| `src/modules/support/support.service.ts` | Llama a email.service |
| `src/modules/support/support.schema.ts` | Zod schema |

### Backend — modificados

| Archivo | Cambio |
|---|---|
| `src/shared/email.service.ts` | Añadir `sendSupportContactEmail()` |
| `src/modules/auth/auth.service.ts` | Llamar `ensureSupportChat()` al registrar |
| `src/modules/chats/chats.service.ts` | Añadir `ensureSupportChat()`, renombrar chat de soporte |
| `src/app.ts` | Montar `adminRouter`, `feedbackRouter`, `supportRouter` |
| `prisma/seed.ts` | Añadir `SUPER_ADMIN` al seed de roles |

### Frontend — nuevos

| Archivo | Descripción |
|---|---|
| `app/(admin)/layout.tsx` | Layout del panel admin |
| `app/(admin)/admin/page.tsx` | Dashboard de métricas |
| `app/(admin)/admin/users/page.tsx` | Tabla de usuarios |
| `app/(admin)/admin/feedback/page.tsx` | Calificaciones y comentarios |
| `app/(admin)/admin/support/page.tsx` | Chats de soporte |
| `components/FeedbackWidget.tsx` | Widget flotante de feedback |
| `features/admin/admin.api.ts` | |
| `features/admin/admin.hooks.ts` | |
| `features/admin/admin.types.ts` | |
| `features/feedback/feedback.api.ts` | |
| `features/feedback/feedback.hooks.ts` | |
| `features/feedback/feedback.types.ts` | |
| `features/support/support.api.ts` | |
| `features/support/support.hooks.ts` | |
| `features/support/support.types.ts` | |

### Frontend — modificados

| Archivo | Cambio |
|---|---|
| `app/(dashboard)/layout.tsx` | Añadir `<FeedbackWidget />` (excluido para SUPER_ADMIN) |
| `app/(dashboard)/help/page.tsx` | Reemplazar `mailto:` por formulario de contacto integrado |
| `middleware.ts` | Añadir guard para rutas `/admin` |

---

## Resumen ejecutivo

Este plan implementa un panel super administrador completo para el propietario del SaaS con:

- **Rol `SUPER_ADMIN`** — separado del `ADMIN` de proyecto, con guard propio en backend y frontend.
- **Panel de métricas** — KPIs globales, gráficas de crecimiento, distribución de calificaciones, usando Recharts (ya instalado).
- **Gestión de usuarios** — tabla con búsqueda, filtros, activar/desactivar y cambio de rol.
- **Feedback en tiempo real** — widget flotante para el usuario (⭐ 1–5 + comentario), vista de calificaciones para el admin.
- **Chat de soporte** — 100% reutilizado del módulo `chats` existente. El usuario tiene un chat "Soporte · Task Manager" pre-creado. El admin chatear desde su panel de soporte.
- **Formulario de contacto** — SMTP via nodemailer (ya configurado), sin depender de ningún cliente de correo.
- **Zero nueva infraestructura** — todo reutiliza lo existente: nodemailer, Socket.IO, Recharts, shadcn/ui, TanStack Query.
