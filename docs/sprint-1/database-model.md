# Sprint 1 Database Model

The backend uses Prisma with PostgreSQL.

## Enums

| Enum | Values |
| --- | --- |
| `RoleName` | `ADMIN`, `MEMBER`, `GUEST` |
| `TaskStatus` | `PENDING`, `IN_PROGRESS`, `DONE` |
| `TaskPriority` | `LOW`, `MEDIUM`, `HIGH` |

## Tables

| Model | Key Fields | Notes |
| --- | --- | --- |
| `Role` | `id`, `name` | Seeded with the three role names |
| `User` | `id`, `name`, `email`, `passwordHash`, `roleId`, `isActive` | `email` is unique; API responses never expose `passwordHash` |
| `Project` | `id`, `name`, `description`, `status`, `createdById` | Deletion is soft via `status = "INACTIVE"` |
| `ProjectMember` | `id`, `userId`, `projectId`, `memberRole`, `isActive` | `@@unique([userId, projectId])` prevents duplicate membership |
| `Task` | `id`, `title`, `description`, `dueDate`, `priority`, `status`, `projectId`, `responsibleId` | `responsibleId` is optional and must belong to the project when set on create |

## Relationships

- A user has one global role through `roleId`.
- A project is created by one user and has many project members.
- A task belongs to one project and one creator.
- A task may have one responsible user.
- Authorization is based on active `ProjectMember` rows.
