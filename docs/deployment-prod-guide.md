# Guía de despliegue a producción — Sprint OAuth + Super Admin

Guía paso a paso para subir a producción los cambios de la rama `development` (backend Node + frontend Next.js desplegados en Render), incluyendo la migración de base de datos, seeders y scripts operativos.

> **Fecha de elaboración:** 2026-06-27
> **Ramas implicadas:** `development` (backend y frontend)
> **Commit clave (backend):** `b412331` — SUPER_ADMIN, feedback, invitaciones, verificación de email, Google OAuth, backfill de chats de soporte.
> **Migración nueva:** `20260626212409_add_super_admin_and_feedback`

---

## 0. Resumen ejecutivo y orden recomendado

Tu instinto de orden **BD → back → front** es correcto. La razón técnica: la migración nueva es **puramente aditiva** (columnas nuevas con defaults, tablas nuevas, nuevo valor de enum, `passwordHash` pasa a ser nullable). Eso significa que se puede aplicar a la BD **mientras el backend antiguo sigue corriendo** sin romperlo, y cuando subas el backend nuevo el esquema ya coincide.

```
0) Backup + checklist de entorno
1) BASE DE DATOS  →  prisma migrate deploy  +  prisma:seed   (idempotente)
2) BACKEND        →  deploy en Render (con GOOGLE_CLIENT_ID, SMTP, FRONTEND_URL…)
3) FRONTEND       →  commitear verify-email, pnpm build, deploy, redirect URIs de Google
4) OPERATIVO      →  login Google del super admin → set-super-admin → backfill-support-chats
5) VERIFICACIÓN   →  smoke tests + plan de rollback
```

> ⚠️ **Asimetría entre repos (importante):**
> - **Backend:** `development` ≈ `main` (solo 2 commits adelante: un merge y un `.gitignore`). El commit `b412331` **ya está en `main`**, así que el código probablemente ya está desplegado en Render, **pero la migración `20260626212409` aún no se aplicó a la BD de producción** (el `Dockerfile` no ejecuta migraciones). Ese es el riesgo #1.
> - **Frontend:** `development` está **muy por delante** de `main` (OAuth Google, verificación de email, colaboración, diagramas, copilot, chat, documentos, dashboard, S3). Además tienes **un cambio sin commitear** en `app/(auth)/verify-email/page.tsx`.

---

## 1. Pre-requisitos y checklist (Fase 0)

### 1.1 Backup de la BD de producción (OBLIGATORIO antes de migrar)

```bash
# Usa pg_dump contra la conexión DIRECTA (no la pooler) de tu BD de prod
pg_dump "<DIRECT_DATABASE_URL_de_prod>" \
  --format=custom --file=backup_prod_$(date +%Y%m%d_%H%M).dump
```

Si usas **Supabase**, también puedes restaurar desde un snapshot del dashboard (Project → Database → Backups).

### 1.2 Variables de entorno nuevas/obligatorias que necesitarás

El backend **cae (exit)** si faltan estas variables al arranque (validación Zod). Verifícalas en Render **antes** de desplegar:

| Variable | Valor en prod | Notas |
|---|---|---|
| `JWT_SECRET` | ≥ 32 caracteres | Obligatoria, validada al inicio |
| `FRONTEND_URL` | `https://tu-dominio-frontend.com` | URL válida (CORS `credentials: true`) |
| `GOOGLE_CLIENT_ID` | Tu client ID de Google Cloud | **NUEVA** — OAuth con Google |
| `SMTP_USER` / `SMTP_PASS` | Credenciales SMTP | **NUEVA** — verificación de email (obligatoria al arranque aunque no la uses) |
| `DATABASE_URL` | URL **pooler** (app) | Si usas Supabase: puerto 6543, `?pgbouncer=true` |
| `DIRECT_DATABASE_URL` | URL **directa** (migraciones) | Supabase: puerto 5432, sin pgbouncer |
| `AI_BACKEND_URL` | URL del AI backend en prod | |
| `EMBEDDING_DIM` | `384` (Ollama) o `1536` (OpenAI) | **Debe coincidir** con la columna pgvector y el AI backend |
| `COPILOT_INDEXING_WORKER_ENABLED` | `true`/`false` | |
| `NODE_ENV` | `production` | |

Opcionales según features que uses: `AWS_S3_*`, `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (push), `DOCX_CONVERTER_URL`/`DOCX_CONVERTER_CALLBACK_SECRET`.

### 1.3 Google OAuth Console

En **Google Cloud → APIs & Services → Credentials → OAuth client ID**, añade en *Authorized JavaScript origins* y *redirect URIs* las URLs **de producción** (backend y/o frontend, según cómo esté implementado el flujo `POST /api/v1/auth/google`). Sin esto, el login con Google fallará en prod.

---

## 2. FASE 1 — Base de datos: migraciones Prisma

### 2.1 ⚠️ NUNCA uses `prisma migrate dev` en producción

En `package.json` tienes:

```json
"prisma:migrate": "prisma migrate dev"
```

Ese script es **solo para desarrollo**: puede resetear datos si detecta drift y pide input interactivo. En producción usa **siempre**:

```bash
npx prisma migrate deploy
```

`migrate deploy` es **no interactivo** y solo aplica las migraciones pendientes (las que no están en la tabla `_prisma_migrations`). Es idempotente.

### 2.2 Migración pendiente: `20260626212409_add_super_admin_and_feedback`

Qué hace (resumen del SQL):

- `ALTER TYPE "RoleName" ADD VALUE 'SUPER_ADMIN'`
- `User`: añade `emailVerificationCode`, `emailVerificationExpires`, `emailVerified` (default `false`), `googleId`; **`passwordHash` deja de ser NOT NULL** (usuarios de Google no tienen password).
- Crea tablas `ProjectInvite` y `AppFeedback` + índices y FKs.
- Índice único sobre `User.googleId`.

**Riesgos a conocer (todos bajos/controlables):**

1. **`ALTER TYPE ... ADD VALUE`**: PostgreSQL lo permite fuera de transacción. Prisma lo detecta y lo ejecuta sin wrapper transaccional, así que no debería fallar. *(Si tu PG es muy antiguo o usas un proxy raro, vigílalo.)*
2. **Índice único en `googleId`**: la advertencia de Prisma habla de duplicados, pero como la columna es **nueva**, todas las filas existentes tienen `NULL` y Postgres permite múltiples NULLs en índices únicos. **No debería fallar.**
3. **Es aditiva** → compatible con el backend viejo corriendo. Segura para despliegue sin downtime.

> ℹ️ Si tu BD de prod quedó aún más atrás, pueden estar pendientes **otras** migraciones intermedias (notifications, rag copilot, generated diagrams…). Antes de migrar, ejecuta `npx prisma migrate status` para ver exactamente cuántas faltan; `migrate deploy` las aplica todas en orden.

### 2.3 ⚠️ Problema del pooler de Supabase + el Dockerfile de Render

Dos trampas importantes:

**(a) pgbouncer (transaction mode) y DDL no se llevan bien.**
Si `DATABASE_URL` apunta al **pooler** de Supabase (puerto 6543, `?pgbouncer=true`), `prisma migrate deploy` puede fallar en operaciones de DDL. **Para migrar, usa la conexión DIRECTA** (puerto 5432, sin pgbouncer) como `DATABASE_URL` temporal, o configura `directUrl` en `schema.prisma` y pásalo a `migrate deploy`. Como tu `schema.prisma` solo declara `url = env("DATABASE_URL")`, lo más simple es:

```bash
# Para el paso de migración, apunta DATABASE_URL a la conexión DIRECTA
$env:DATABASE_URL = "<DIRECT_DATABASE_URL_de_prod>"   # PowerShell
npx prisma migrate deploy
npx prisma migrate status    # confirmar "Database schema is up to date!"
```

**(b) El contenedor de producción de Render NO tiene `prisma` ni `ts-node`.**
Tu `Dockerfile` ejecuta `npm prune --omit=dev` en la imagen final, y tanto `prisma` como `ts-node` son `devDependencies`. Por eso **dentro del contenedor no puedes correr los seeders ts** ni (de forma limpia) el CLI de Prisma.

### 2.4 ✔️ Forma recomendada: migrar y sembrar desde tu máquina local contra prod

Evitas los dos problemas anteriores (deps completos + control total). Desde la raíz de `task_manager_back`:

```powershell
# 1) Apuntar a la BD de PRODUCCIÓN (conexión DIRECTA, sin pgbouncer)
$env:DATABASE_URL = "<DIRECT_DATABASE_URL_de_prod>"
$env:DIRECT_DATABASE_URL = "<DIRECT_DATABASE_URL_de_prod>"

# 2) Generar el cliente con el schema actual (por si acaso)
npx prisma generate

# 3) Ver qué falta
npx prisma migrate status

# 4) Aplicar migraciones pendientes (no interactivo)
npx prisma migrate deploy

# 5) Sembrar roles (idempotente: SUPER_ADMIN, ADMIN, MEMBER, GUEST + demo dashboard)
npm run prisma:seed
```

> Si prefieres hacerlo **dentro de Render**: usa la **Shell** del Web Service (Render → tu servicio → Shell) y ejecuta `npx prisma migrate deploy` (npx descargará el CLI temporalmente; funciona pero es lento y requiere red). Los seeders `ts-node` **no** correrán ahí — hazlos en local contra prod.

### 2.5 (Opcional) Automatizar migraciones en cada deploy de Render

Para que las migraciones se apliquen solas en futuros deploys, pon el **Start Command** del backend en Render como:

```
npx prisma migrate deploy && node dist/server.js
```

`migrate deploy` es idempotente (solo aplica lo pendiente) y Prisma toma un *advisory lock* en la BD, así que es seguro aunque haya varios reinicios. **Cuidado:** sigue usando la conexión correcta (si la app usa el pooler, asegúrate de que las migraciones usen la directa vía `directUrl`). Para el primer despliegue grande, recomiendo hacerlo **manual** (sección 2.4) para capturar errores.

---

## 3. FASE 2 — Backend en Render

Con la BD ya migrada, el código del backend puede desplegarse sin que el esquema le pise los talones.

1. **Rama y commit:** despliega desde `main` (que ya contiene `b412331`) o desde `development` (`45be2fc`). Ambos incluyen la migración nueva en el repo.
2. **Variables de entorno en Render:** completa la tabla de la sección 1.2. Las críticas nuevas son `GOOGLE_CLIENT_ID`, `SMTP_USER`, `SMTP_PASS`, `FRONTEND_URL`, `JWT_SECRET`.
3. **Build command:** `npm ci && npm run build` (el `postinstall` corre `prisma generate` automáticamente; el `Dockerfile` ya lo hace si despliegas por Docker).
4. **Start command:** `node dist/server.js` (o `npx prisma migrate deploy && node dist/server.js` si quieres auto-migrar, ver 2.5).
5. **Arranque:** el servidor valida `JWT_SECRET`, `FRONTEND_URL`, `SMTP_USER`, `SMTP_PASS`, `GOOGLE_CLIENT_ID` al inicio — si falta alguna, el proceso **cae**. Revisa los logs de Render.

> Notas de arquitectura que afectan a Render:
> - **Socket.IO** en `/socket.io` y **WebSocket de colaboración** en `/collaboration` corren sobre el mismo puerto del backend (`BACKEND_PORT`). Asegúrate de que Render permita WebSockets (activado por defecto en Web Services).
> - Si la app corre detrás del pooler, recuerda que las migraciones deben ir por conexión directa.

---

## 4. FASE 3 — Frontend

### 4.1 Commitear el cambio pendiente ⚠️

Tienes una modificación **sin commitear** que no entraría en el deploy:

```bash
git -C task_manager_front status -s
#  M app/(auth)/verify-email/page.tsx
```

```bash
cd task_manager_front
git add app/\(auth\)/verify-email/page.tsx
git commit -m "fix(verify-email): <descripción del cambio>"
git push origin development
```

### 4.2 Verificar tipos ANTES de construir

`next build` **omite** los chequeos de tipos y lint (`next.config.mjs`). Corre typecheck en local para no subir errores a prod:

```bash
cd task_manager_front
pnpm install            # el repo ahora usa pnpm (commit c8b90ee)
pnpm run typecheck      # tsc --noEmit
pnpm run lint
```

### 4.3 Build y Start en Render/Vercel

- **Package manager:** pnpm (hay `pnpm-lock.yaml`). En Render, instala pnpm o usa `corepack enable && pnpm install --frozen-lockfile`.
- **Build command:** `pnpm run build` (`next build`).
- **Start command:** `pnpm run start` → equivale a `NODE_ENV=production node server.js`. **Importante:** el frontend usa un `server.js` custom (Next + proxy de Socket.IO + proxy de colaboración). **No uses `next start`** o se romperán los webhooks de tiempo real en mismo origen.

### 4.4 Variables de entorno del frontend (`NEXT_PUBLIC_*`)

Sincroniza desde `task_manager_front/.env.example`. Como mínimo, en prod deben apuntar a las URLs de producción:

- `NEXT_PUBLIC_API_URL` → `https://api.tu-dominio.com` (backend)
- `NEXT_PUBLIC_SOCKET_URL` → mismo backend (Socket.IO)
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID` → mismo client ID de Google que el backend
- Variables de colaboración (URL del backend `/collaboration`)

### 4.5 Google OAuth Console (redirect URIs)

Añade la URL pública del frontend en *Authorized JavaScript origins* / *redirect URIs*.

---

## 5. FASE 4 — Scripts operativos (post-deploy)

Estos scripts **no están en `package.json`** y deben ejecutarse a mano. Tienen un **orden estricto** por dependencias:

```
(1) prisma:seed            → crea el rol SUPER_ADMIN (idempotente, ya hecho en Fase 1)
(2) backend arriba + Google OAuth funcionando
(3) el usuario fsociety.soporte@gmail.com inicia sesión con Google  ← crea el User
(4) set-super-admin.ts     → promueve a ese User a SUPER_ADMIN
(5) backfill-support-chats.ts  → crea chat DIRECTO entre el super admin y cada usuario activo
(6) backfill-chats.ts      → (existente, idempotente) asegura chat grupal por proyecto
```

### 5.1 `set-super-admin.ts`

Promueve a `fsociety.soporte@gmail.com` a `SUPER_ADMIN`. **Requiere que ese usuario ya exista** (debe haber iniciado sesión con Google al menos una vez). Si no existe, el script hace `process.exit(1)`.

```powershell
$env:DATABASE_URL = "<DIRECT_DATABASE_URL_de_prod>"
npx ts-node prisma/set-super-admin.ts
# → ✅ User fsociety.soporte@gmail.com (id=...) upgraded to SUPER_ADMIN
```

### 5.2 `backfill-support-chats.ts`

Crea un chat `DIRECT` entre el `SUPER_ADMIN` y cada usuario activo (si no existe ya). **Requiere** que el paso 5.1 haya corrido (busca un user con rol `SUPER_ADMIN`).

```powershell
npx ts-node prisma/backfill-support-chats.ts
# → Backfill complete: N support chats created.
```

### 5.3 `backfill-chats.ts` (existente)

Idempotente: garantiza que cada proyecto tenga su chat grupal + miembros.

```powershell
npx ts-node prisma/backfill-chats.ts
```

> Todos estos scripts corren contra la `DATABASE_URL` que tengas en el entorno. **Asegúrate de apuntar a prod** (conexión directa) y revierte la variable cuando termines para no operar por error sobre prod desde tu sesión local.

---

## 6. FASE 5 — Verificación post-deploy (smoke tests)

| Funcionalidad | Cómo verificar |
|---|---|
| Backend vivo | `GET https://api.../api/v1/health` (o Swagger en `/api/docs`) |
| Registro + verificación de email | Registrar un usuario → llega código de 6 dígitos → `POST /auth/verify-email` |
| Login con Google | Botón "Sign in with Google" en el frontend de prod |
| Login con password | Un usuario con email verificado entra correctamente |
| Chat | Crear/enviar mensaje en un chat de proyecto y uno directo |
| Colaboración (documentos) | Abrir un documento y editar (WebSocket `/collaboration`) |
| Dashboard de métricas | Panel de admin (requiere rol `SUPER_ADMIN`) |
| Feedback | Enviar un `AppFeedback` |
| Invitaciones | Generar link de invitación y aceptarlo |

Comando útil para ver el estado de migraciones tras el deploy:

```bash
npx prisma migrate status
# → "Database schema is up to date!"
```

---

## 7. Plan de rollback

- **BD:** restaurar el dump de la sección 1.1 (`pg_restore -d "<DIRECT_URL>" backup_prod_*.dump`). Como la migración es aditiva, normalmente **no hace falta** revertir el esquema — el backend viejo sigue funcionando con las columnas nuevas presentes.
- **Backend:** en Render, despliega el commit anterior (botón *Manual Deploy → Deploy a specific commit*).
- **Frontend:** promueve el commit/SHA anterior (o rollback en Vercel).
- **Super admin:** si asignaste el rol por error, reviértelo con un `UPDATE "User" SET "roleId" = <id_rol_anterior> WHERE email = 'fsociety.soporte@gmail.com';`.

---

## 8. Cheat sheet de comandos

```powershell
# === BD (desde task_manager_back, contra PROD directo) ===
$env:DATABASE_URL     = "<DIRECT_DATABASE_URL_de_prod>"
$env:DIRECT_DATABASE_URL = "<DIRECT_DATABASE_URL_de_prod>"
pg_dump $env:DATABASE_URL -Fc -f backup_prod.dump          # backup previo
npx prisma generate
npx prisma migrate status                                   # ver pendientes
npx prisma migrate deploy                                   # aplicar (NO migrate dev)
npm run prisma:seed                                         # roles + demo

# === BACKEND en Render ===
#  • Completar env vars (GOOGLE_CLIENT_ID, SMTP_USER, SMTP_PASS, FRONTEND_URL, JWT_SECRET…)
#  • Build: npm ci && npm run build
#  • Start: node dist/server.js   (o "npx prisma migrate deploy && node dist/server.js")

# === FRONTEND ===
cd ..\task_manager_front
git add -A; git commit -m "fix: verify-email"; git push origin development
pnpm install
pnpm run typecheck
pnpm run build
# Render/Vercel: Build = pnpm run build, Start = pnpm run start

# === OPERATIVO (después de login Google del super admin) ===
cd ..\task_manager_back
$env:DATABASE_URL = "<DIRECT_DATABASE_URL_de_prod>"
npx ts-node prisma/set-super-admin.ts
npx ts-node prisma/backfill-support-chats.ts
npx ts-node prisma/backfill-chats.ts
```

---

## 9. Riesgos resumidos / cosas que no olvidar

1. **No apliques `prisma migrate dev` en prod** → usa `migrate deploy`.
2. **Migra con la conexión DIRECTA**, no con el pooler de Supabase.
3. El **Dockerfile de producción no tiene `prisma`/`ts-node`** → migra y siembra desde local contra prod (o por Shell de Render con `npx`).
4. **`GOOGLE_CLIENT_ID`, `SMTP_USER`, `SMTP_PASS`, `FRONTEND_URL`, `JWT_SECRET`** son obligatorias al arranque; si falta una, el backend cae.
5. **`EMBEDDING_DIM`** debe coincidir con la columna pgvector y el AI backend.
6. El frontend usa **`server.js` custom** → Start con `node server.js`, no `next start`.
7. **Commitea el cambio de `verify-email/page.tsx`** antes de desplegar el front.
8. Orden de scripts: **login Google → `set-super-admin` → `backfill-support-chats`**.
9. **Haz backup** antes de migrar.
