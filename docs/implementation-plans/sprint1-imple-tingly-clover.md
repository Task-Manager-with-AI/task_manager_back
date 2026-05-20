# Sprint 1 — Revised Implementation Plan

## Context

The project is an agile task manager web app with AI features (Sprint 2). Sprint 1 scope: auth, projects, tasks, and a Kanban board. The previous plan was too abstract. This revision is precise enough to execute.

**Current state:**
- `task_manager_front/`: Next.js 14 App Router + shadcn/ui + Tailwind. Static mockup from v0.dev. Pages exist but use hardcoded data. No auth pages, no API client. TanStack Query and dnd-kit NOT installed yet.
- `task_manager_back/`: Express generator skeleton in JavaScript (not TypeScript). No Prisma, no auth, no modules. Must be rebuilt.
- `task_manager_ai_back/`: Completely empty.
- No Docker Compose. No `.env.example`. No Prisma schema.

**Clean architecture rule applied throughout:**
- Routes → define endpoints only (no logic)
- Controllers → parse request, call service, send response (no DB access)
- Services → all business logic (no req/res, no Prisma)
- Repositories → only Prisma calls
- Schemas → Zod at controller boundary (never trust req.body)

---

## Phase 0 — DevOps Foundation

**Goal:** All services start with one command. Do this first — it unblocks everyone.

### Files to create:

**`.env.example`** (project root):
```
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agile_ai_db
JWT_SECRET=change_me_minimum_32_characters_long
JWT_EXPIRES_IN=1d
COOKIE_NAME=access_token
BACKEND_PORT=4000
FRONTEND_URL=http://localhost:3000
FASTAPI_PORT=8000
```

**`docker-compose.yml`** (project root): Services: `postgres` (postgres:16-alpine, port 5432), `backend` (build `./task_manager_back`, port 4000), `ai_backend` (build `./task_manager_ai_back`, port 8000), `frontend` (build `./task_manager_front`, port 3000).

**`task_manager_back/Dockerfile`**: Multi-stage — `node:20-alpine` builder runs `npm ci` + `npm run build`, production stage copies `dist/` only.

**`task_manager_ai_back/Dockerfile`**: `python:3.12-slim`, `pip install -r requirements.txt`, `uvicorn app.main:app --host 0.0.0.0 --port 8000`.

**Checkpoint:** `docker-compose up postgres` → PostgreSQL healthy on port 5432.

---

## Phase 1 — Backend: TypeScript Scaffold + Prisma Schema

**Goal:** Fully typed Express project compiles, Prisma schema matches data model, DB is migrated.
**Dependency:** Phase 0 (PostgreSQL running).

### 1.1 — Tear down JavaScript scaffold, install dependencies

Delete: `app.js`, `bin/www`, `routes/index.js`, `routes/users.js`.

**Production deps to install:**
```
express@^4.18  cors  cookie-parser  morgan  helmet  express-rate-limit
zod@^3.22  @prisma/client@^5  jose@^5  argon2@^0.31
swagger-jsdoc@^6  swagger-ui-express@^5
```

**Why `jose` over `jsonwebtoken`**: TypeScript-native, uses Web Crypto API, actively maintained.
**Why `argon2` over `bcrypt`**: argon2id is current OWASP recommendation.

**Dev deps:** `typescript@^5  ts-node@^10  ts-node-dev@^2  @types/express  @types/cors  @types/cookie-parser  @types/morgan  @types/swagger-jsdoc  @types/swagger-ui-express  prisma@^5`

### 1.2 — TypeScript config

**`task_manager_back/tsconfig.json`**:
```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "commonjs", "lib": ["ES2022"],
    "outDir": "./dist", "rootDir": "./src",
    "strict": true, "esModuleInterop": true, "skipLibCheck": true,
    "resolveJsonModule": true, "declaration": true, "sourceMap": true
  },
  "include": ["src/**/*"], "exclude": ["node_modules", "dist"]
}
```

**`package.json` scripts:**
```json
"dev": "ts-node-dev --respawn --transpile-only src/server.ts",
"build": "tsc",
"start": "node dist/server.js",
"prisma:migrate": "prisma migrate dev",
"prisma:seed": "ts-node prisma/seed.ts"
```

### 1.3 — Prisma schema

**`task_manager_back/prisma/schema.prisma`**:
- Enums: `RoleName (ADMIN, MEMBER, GUEST)`, `TaskStatus (PENDING, IN_PROGRESS, DONE)`, `TaskPriority (LOW, MEDIUM, HIGH)`
- Models: `Role (id Int @id autoincrement, name RoleName @unique)`, `User (id uuid, name, email @unique, passwordHash, roleId, isActive=true, timestamps)`, `Project (id uuid, name, description?, status=ACTIVE, createdById, timestamps)`, `ProjectMember (id uuid, userId, projectId, memberRole=MEMBER, joinedAt=now, isActive=true, @@unique([userId,projectId]))`, `Task (id uuid, title, description?, dueDate?, priority=MEDIUM, status=PENDING, projectId, createdById, responsibleId?, timestamps)`

The `@@unique([userId,projectId])` on ProjectMember enforces no duplicate memberships at DB level.

### 1.4 — Seed file

**`task_manager_back/prisma/seed.ts`**: Upsert three roles (ADMIN, MEMBER, GUEST). Add `"prisma": { "seed": "ts-node prisma/seed.ts" }` to package.json.

### 1.5 — Prisma singleton client

**`task_manager_back/src/prisma/client.ts`**: Use `global.__prisma` pattern to prevent connection exhaustion during hot-reload.

**Checkpoint:** `prisma migrate dev --name init` then `prisma db seed` → tables exist, `roles` has 3 rows.

---

## Phase 2 — Backend: Shared Infrastructure Layer

**Goal:** All cross-cutting concerns in place before any business logic. No rework later.
**Dependency:** Phase 1 complete.

### Files to create:

**`src/config/env.ts`**: Zod schema that validates all env vars at startup — process exits with readable error if any required var is missing.

**`src/config/cors.ts`**: `cors({ origin: env.FRONTEND_URL, credentials: true })`. Never wildcard with `credentials: true`.

**`src/shared/utils/response.ts`**: `sendSuccess(res, data, message, 200)` and `sendCreated(res, data, message)`. All controllers use these — no raw `res.json()`.

**`src/shared/errors/AppError.ts`**: `class AppError extends Error { statusCode, errors? }`. Services throw this, never raw errors.

**`src/shared/types/api.types.ts`**: `ApiResponse<T>` interface + Express `Request` augmentation to add `user?: { id, email, roleId }`.

**`src/middlewares/error.middleware.ts`**: Catches `AppError` (returns statusCode), `ZodError` (returns 400 with field errors), unknown errors (returns 500, hides stack in production).

**`src/middlewares/auth.middleware.ts`**: Reads `req.cookies[env.COOKIE_NAME]`, calls `jose.jwtVerify()`, attaches payload to `req.user`. Throws `AppError('Authentication required', 401)` if missing.

**`src/middlewares/membership.middleware.ts`**: Queries `prisma.projectMember.findUnique({ where: { userId_projectId: { userId, projectId } } })`. Throws `AppError('Access forbidden', 403)` if no active membership.

**`src/app.ts`**: Apply `helmet()`, cors, morgan, json parser, cookieParser, health route, `errorMiddleware` last.

**`src/server.ts`**: `await prisma.$connect()` then `app.listen(env.BACKEND_PORT)`.

**`src/config/swagger.ts`**: swagger-jsdoc + swagger-ui-express, mounted at `/api/docs`, reads JSDoc from `./src/modules/**/*.routes.ts`.

**Checkpoint:** `npm run dev` → `GET /api/v1/health` returns 200, `GET /api/docs` loads Swagger UI.

---

## Phase 3 — Backend: Business Modules

**Goal:** All four modules fully implemented and testable via Swagger.
**Dependency:** Phase 2 entirely complete.
**Order:** auth → users → projects → tasks.

### Module structure (repeat for each):
```
src/modules/{module}/
├── {module}.schema.ts      ← Zod schemas + inferred types
├── {module}.repository.ts  ← Prisma calls only
├── {module}.service.ts     ← Business logic only
├── {module}.controller.ts  ← Request parsing + response sending
└── {module}.routes.ts      ← Route definitions + Swagger JSDoc
```

### 3.1 — Auth module

**Schema**: `registerSchema (name min2, email, password min8 max72)`, `loginSchema (email, password)`.

**Repository**: `findUserByEmail(email)` includes role, `createUser(data)` returns safe fields only (no passwordHash).

**Service key rules**:
- `register`: check email uniqueness (409 if taken), hash with `argon2.hash()`, use MEMBER role.
- `login`: same error message for unknown email and wrong password (prevents user enumeration). Generate JWT with `SignJWT({ id, email, roleId }).setExpirationTime(env.JWT_EXPIRES_IN).sign(secret)`.

**Controller**: Sets cookie with `{ httpOnly: true, secure: NODE_ENV==='production', sameSite: 'lax', maxAge: 86400000 }`.

**Routes**: `POST /register`, `POST /login`, `POST /logout (auth)`, `GET /me (auth)`.

**Rate limiting**: Apply `express-rate-limit` (10 req/15min per IP) to `/register` and `/login`.

### 3.2 — Users module

**Schema**: `updateUserSchema (name optional)`.
**Repository**: `findById`, `updateById`, `findAll` — all use `select` to exclude passwordHash.
**Service**: `getMe`, `updateMe`, `listUsers` (returns all active users for task assignment).
**Routes**: `GET /me (auth)`, `PATCH /me (auth)`, `GET / (auth)`.

### 3.3 — Projects module

**Schema**: `createProjectSchema (name, description?)`, `addMemberSchema (userId uuid, memberRole enum)`.

**Service key rules**:
- `createProject`: create project + add creator as ADMIN in a single `prisma.$transaction()`.
- `addMember`: throws 409 if `@@unique` constraint violated (duplicate member).
- `deleteProject`: soft delete — set `status = 'INACTIVE'`, do not delete.

**Routes** (all protected by `authMiddleware`):
- `GET /`, `POST /` — no membership check (list shows user's own projects via join)
- `GET /:id`, `PATCH /:id`, `DELETE /:id`, `POST /:id/members`, `GET /:id/members` — add `membershipMiddleware` (reads `req.params.id`)

### 3.4 — Tasks module

**Schema**: `createTaskSchema (title, description?, dueDate datetime?, priority enum, responsibleId uuid?)`, `updateStatusSchema (status enum)`.

**Service key rules**:
- `createTask`: if `responsibleId` provided, verify they are an active member of the project. Throw 400 if not.
- `updateTaskStatus`: use narrow `updateStatusSchema` — this endpoint accepts only `status`.
- Task access for `GET/PATCH/DELETE /tasks/:id`: verify task's `projectId` has the requesting user as a member (join in repository, not in middleware).

**Routes**:
```
GET  /projects/:projectId/tasks   (auth + membershipMiddleware reads projectId)
POST /projects/:projectId/tasks   (auth + membershipMiddleware)
GET  /tasks/:id                   (auth — service validates ownership via join)
PATCH /tasks/:id                  (auth)
PATCH /tasks/:id/status           (auth)
DELETE /tasks/:id                 (auth)
```

**Mount in app.ts**: `app.use('/api/v1', tasksRouter)` (handles both nested and flat routes).

**Checkpoint**: Test all CRUD flows in Swagger UI:
1. Register → Login → cookie set
2. `POST /projects` → project created, creator is ADMIN member
3. `POST /projects/:id/tasks` → task in PENDING
4. `PATCH /tasks/:id/status` → status updated
5. Cross-user access → 403

---

## Phase 4 — FastAPI Skeleton (parallel with Phase 1-3)

**Goal:** AI service is runnable, structured for Sprint 2.
**Dependency:** None.

**File structure**:
```
task_manager_ai_back/
├── app/
│   ├── __init__.py
│   ├── main.py
│   └── api/v1/health.py
├── requirements.txt
└── .env
```

**`requirements.txt`** (pin exact versions):
```
fastapi==0.115.0
uvicorn[standard]==0.30.0
python-dotenv==1.0.1
pydantic-settings==2.3.4
pytest==8.2.2
httpx==0.27.0
```

**`main.py`**: `FastAPI(title="Task Manager AI Service", version="1.0.0", docs_url="/api/docs")`, includes `health_router` at prefix `/api/v1`.

**`health.py`**: `GET /health` → `{success, message, data: {status: "ok"}}`, `GET /info` → `{name, version, description, timestamp}`.

**Checkpoint**: `uvicorn app.main:app --reload --port 8000` → `/api/v1/health` returns 200.

---

## Phase 5 — Frontend Foundation

**Goal:** API client, TanStack Query, auth pages, route protection. No business features — just plumbing.
**Dependency:** Phase 3 auth endpoints working.

### 5.1 — Install missing dependencies

```bash
cd task_manager_front
npm install @tanstack/react-query@^5 @tanstack/react-query-devtools@^5
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### 5.2 — Environment

**`task_manager_front/.env.local`**:
```
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

### 5.3 — API client

**`lib/api-client.ts`**: Wrapper around `fetch` with `credentials: 'include'` on every request (required for httpOnly cookies). Throws typed `ApiError(status, message, errors)` on non-2xx. Methods: `get<T>`, `post<T>`, `patch<T>`, `delete<T>`.

### 5.4 — TanStack Query provider

**Create `app/query-provider.tsx`** (client component): `useState(() => new QueryClient(...))` pattern — single instance, not module-level singleton. `staleTime: 60_000, retry: 1`.

**Modify `app/layout.tsx`**: Wrap `ThemeProvider` inside `QueryProvider`. Include `ReactQueryDevtools`.

### 5.5 — Auth route group layout

**Create `app/(auth)/layout.tsx`**: Centered layout, no sidebar. Route group `(auth)` means it does NOT inherit `DashboardLayout` — correct for login/register pages.

### 5.6 — Auth feature

**`features/auth/auth.types.ts`**: `User`, `LoginDto`, `RegisterDto` interfaces.

**`features/auth/auth.api.ts`**: `login`, `register`, `logout`, `me` — all use `apiClient`.

**`features/auth/auth.hooks.ts`**: `useCurrentUser` (query key `['auth','me']`), `useLogin` (onSuccess: set cache + navigate to `/projects`), `useRegister` (onSuccess: navigate to `/login`), `useLogout` (onSuccess: `queryClient.clear()` + navigate to `/login`).

### 5.7 — Login page

**`app/(auth)/login/page.tsx`**: React Hook Form + Zod (`z.object({ email: z.string().email(), password: z.string().min(1) })`). shadcn `Card` + `Form` + `Input` + `Button`. API error shown in `Alert` (destructive variant). Uses `useLogin`.

### 5.8 — Register page

**`app/(auth)/register/page.tsx`**: Schema includes `confirmPassword` with `.refine()` for match validation — client-side only, not sent to API. Uses `useRegister`.

### 5.9 — Route protection middleware

**`middleware.ts`** (Next.js root):
```ts
const PUBLIC_PATHS = ['/login', '/register']
// No cookie → redirect to /login (store `from` param)
// Has cookie + on public page → redirect to /projects
// matcher: excludes api, _next, static assets
```

Note: cookie presence check only (not JWT validation). The backend rejects invalid tokens regardless. Edge JWT validation with `jose` is feasible for Sprint 2.

**Checkpoint**:
1. Navigate to `/projects` without cookie → redirected to `/login`
2. Login → redirected to `/projects`
3. Navigate to `/login` while logged in → redirected to `/projects`
4. TanStack Query DevTools visible

---

## Phase 6 — Frontend Features: Projects, Tasks, Kanban

**Goal:** All features wired to real API data.
**Dependency:** Phase 5 complete + Phase 3 projects/tasks endpoints working.

### Feature directory structure (repeat pattern):
```
features/{feature}/
├── {feature}.types.ts
├── {feature}.api.ts
└── {feature}.hooks.ts
```

### 6.1 — Projects feature

**Types**: `Project { id, name, description?, status, createdById, timestamps }`, `CreateProjectDto { name, description? }`.

**Hooks**: `useProjects` (key `['projects']`), `useProject(id)` (key `['projects', id]`), `useCreateProject` (onSuccess: invalidate `['projects']`), `useUpdateProject`, `useDeleteProject`.

**Modify `app/projects/page.tsx`** (stub → real): Use `useProjects`, show loading skeleton, empty state, project cards. "New Project" button opens `Dialog` with create form. Card click navigates to `/projects/[projectId]`.

**Modify `app/client-layout.tsx`**: Replace local `projects` state with `useProjects` hook so sidebar stays in sync.

### 6.2 — Tasks feature

**Types**: `Task`, `TaskStatus`, `TaskPriority`, `CreateTaskDto`.

**Hooks**: `useProjectTasks(projectId)` (key `['tasks', projectId]`), `useCreateTask`, `useUpdateTaskStatus` (with optimistic update — see below), `useUpdateTask`, `useDeleteTask`.

### 6.3 — Project detail page

**Create `app/projects/[projectId]/page.tsx`**: Uses `useProject(projectId)` + `useProjectTasks(projectId)`. Shows project header, task list (`Table` from shadcn/ui), "New Task" `Dialog` form, link to Kanban view.

### 6.4 — Kanban board

**`features/kanban/kanban.types.ts`**: `KanbanColumn { id: TaskStatus, title, tasks: Task[] }`.

**`features/kanban/KanbanBoard.tsx`** (client component):
- `DndContext` (from `@dnd-kit/core`) wraps entire board with `onDragEnd`.
- Each column = `SortableContext` with `verticalListSortingStrategy`.
- Each task card = `useSortable(task.id)`.
- `onDragEnd`: detect if `over.id` is a different column status → call `updateTaskStatus` mutation.
- Use `DragOverlay` for ghost card while dragging.

**Optimistic updates**: In `useUpdateTaskStatus`, use `onMutate` to update `['tasks', projectId]` cache immediately, `onError` to rollback. Makes drag feel instant.

**`features/kanban/TaskCard.tsx`**: Title, priority badge (LOW=gray, MEDIUM=amber, HIGH=red), responsible avatar, due date. `useSortable` for drag handles.

**Create `app/projects/[projectId]/kanban/page.tsx`**: Loads tasks, renders `KanbanBoard`.

### 6.5 — Wire logout

**Modify `components/dashboard-layout.tsx`**: Attach `useLogout` to the existing "Sign Out" button.

**Checkpoint**:
1. Login → `/projects` loads from API
2. Create project → appears in list and sidebar
3. Create task → appears in task list and Kanban "Pending" column
4. Drag task to "In Progress" → optimistic move, confirmed by API, persists on refresh
5. Logout → `/login`, back navigation blocked

---

## Security Checklist

| Concern | Implementation |
|---|---|
| Passwords | `argon2.hash()` argon2id — never plaintext |
| JWT storage | httpOnly cookie only — never localStorage |
| Cookie flags | `httpOnly`, `secure` in production, `sameSite: 'lax'` |
| User enumeration | Same "Invalid credentials" message for unknown email + wrong password |
| Input validation | Zod at every controller boundary |
| SQL injection | Prisma parameterized queries — no raw string interpolation |
| Authorization | `membershipMiddleware` on all project-scoped routes |
| Sensitive data | Never return `passwordHash` — use Prisma `select` everywhere |
| CORS | Exact origin, `credentials: true`, never wildcard |
| Error leaking | Stack traces only in non-production |
| Rate limiting | 10 req/15min per IP on `/auth/login` and `/auth/register` |
| Security headers | `helmet()` on all routes |

---

## Documentation and CLAUDE.md

After all phases, create:
- `docs/sprint-1/api-endpoints.md` — full API contract with examples
- `docs/sprint-1/database-model.md` — Prisma schema reference
- `docs/sprint-1/environment-setup.md` — local setup guide
- `CLAUDE.md` (project root) — architecture overview, file structure, key decisions, dev commands

---

## Phase Dependency Graph

```
Phase 0 (DevOps)
    └── no deps — start first

Phase 1 (Backend scaffold)     Phase 4 (FastAPI)
    └── needs Phase 0 DB           └── no deps, parallel

Phase 2 (Shared layer)
    └── needs Phase 1

Phase 3 (Modules)
    └── needs Phase 2

Phase 5 (Frontend foundation)
    └── needs Phase 3 auth

Phase 6 (Frontend features)
    └── needs Phase 5 + Phase 3 projects/tasks
```
