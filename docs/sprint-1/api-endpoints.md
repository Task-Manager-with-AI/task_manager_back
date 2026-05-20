# Sprint 1 API Endpoints

Base URL: `http://localhost:4000/api/v1`

Authentication uses an httpOnly cookie named by `COOKIE_NAME` in the backend environment. Send requests with credentials enabled from the frontend.

## Health

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Backend health check |

## Auth

| Method | Path | Body | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | `{ "name": "Ana", "email": "ana@example.com", "password": "secret123" }` | Create a member account |
| POST | `/auth/login` | `{ "email": "ana@example.com", "password": "secret123" }` | Start session and set cookie |
| POST | `/auth/logout` | none | Clear session cookie |
| GET | `/auth/me` | none | Read current user from the cookie |

## Users

| Method | Path | Body | Purpose |
| --- | --- | --- | --- |
| GET | `/users` | none | List active users for assignment and project membership |
| GET | `/users/me` | none | Read current user profile |
| PATCH | `/users/me` | `{ "name": "Ana Perez" }` | Update current user profile |

## Projects

| Method | Path | Body | Purpose |
| --- | --- | --- | --- |
| GET | `/projects` | none | List active projects where the current user is a member |
| POST | `/projects` | `{ "name": "Sprint 1", "description": "MVP scope" }` | Create project and add creator as admin member |
| GET | `/projects/:id` | none | Read a project and active members |
| PATCH | `/projects/:id` | `{ "name": "Sprint 1", "description": "Updated" }` | Update project metadata |
| DELETE | `/projects/:id` | none | Soft delete project by setting status inactive |
| GET | `/projects/:id/members` | none | List active project members |
| POST | `/projects/:id/members` | `{ "userId": "<uuid>", "memberRole": "MEMBER" }` | Add an active user to a project |

## Tasks

| Method | Path | Body | Purpose |
| --- | --- | --- | --- |
| GET | `/projects/:projectId/tasks` | none | List project tasks |
| POST | `/projects/:projectId/tasks` | `{ "title": "Design board", "columnId": "<uuid>", "dueDate": "2026-05-01T14:00:00.000Z", "priority": "HIGH", "responsibleId": "<uuid>" }` | Create a task (`columnId` optional) |
| GET | `/tasks/:id` | none | Read a task if the user belongs to its project |
| PATCH | `/tasks/:id` | `{ "title": "Updated", "dueDate": "2026-05-02T14:00:00.000Z", "responsibleId": null }` | Update task fields |
| PATCH | `/tasks/:id/column` | `{ "columnId": "<uuid>" }` | Move task to another Kanban column |
| DELETE | `/tasks/:id` | none | Delete a task |

## Kanban columns

| Method | Path | Body | Purpose |
| --- | --- | --- | --- |
| GET | `/projects/:id/kanban/columns` | none | List columns with task counts |
| PUT | `/projects/:id/kanban/columns` | `{ "columns": [{ "id": "<uuid>", "title": "Done", "color": "emerald" }] }` | Replace board layout (1–8 columns) |

See also [kanban-api.md](../kanban-api.md).

All protected project and task routes validate membership before returning data.
