# Plan de implementación — Sprint 1

## Software de Gestión Ágil con IA y Colaboración en Tiempo Real

**Base documental:** este plan toma como referencia el Capítulo II “Flujo de desarrollo”, donde el Sprint 1 se enfoca en gestión de usuarios, espacios de trabajo, tareas y tablero Kanban; y el enfoque Scrum definido para Sprint Planning, ejecución, revisión y retrospectiva.  

---

## 1. Objetivo del Sprint 1

Implementar el **MVP funcional inicial** del sistema, permitiendo que un usuario pueda:

* Registrarse e iniciar sesión de forma segura.
* Gestionar su sesión mediante autenticación JWT.
* Crear y administrar espacios de trabajo o proyectos.
* Crear, editar, eliminar y asignar tareas.
* Cambiar el estado de las tareas.
* Visualizar las tareas en un tablero Kanban básico.
* Contar con una base técnica mantenible para futuras integraciones con IA y tiempo real.

> **Nota de planificación:** se toma como fecha coherente del Sprint 1 el rango **21/04/2026 al 28/04/2026**, ya que corresponde a una semana y coincide con el Sprint Backlog. En la documentación aparece una fecha inconsistente `28/09/2025`, que debe corregirse.

---

## 2. Alcance del Sprint 1

### Historias de usuario incluidas

| ID    | Historia                         | Prioridad | Resultado esperado                                               |
| ----- | -------------------------------- | --------: | ---------------------------------------------------------------- |
| HU-1  | Gestión de accesos               |      Alta | Registro, login, logout y protección de rutas                    |
| HU-2  | Configuración de infraestructura |      Alta | Entorno local, conexión frontend-backend-BD y documentación base |
| HU-3  | Espacios de trabajo              |      Alta | CRUD de proyectos y asociación de usuarios                       |
| HU-4  | Gestión de tareas                |      Alta | CRUD de tareas, responsables, prioridad, fecha límite y estado   |
| HU-10 | Tablero Kanban visual            |     Media | Vista de tareas por columnas y cambio de estado                  |

### Fuera del alcance de Sprint 1

Estas funcionalidades deben quedar preparadas arquitectónicamente, pero no implementadas completamente:

* Generación automática de minutas con IA.
* Procesamiento de audio.
* Extracción automática de tareas desde minutas.
* Chat en tiempo real.
* Notificaciones en tiempo real.
* Dashboard avanzado de productividad.

El servicio de **FastAPI** se dejará configurado como base para el Sprint 2, con endpoints mínimos de salud y estructura preparada para IA.

---

## 3. Estructura general del proyecto

La estructura raíz del proyecto debe mantenerse simple y separada por responsabilidad:

```txt
task_manager_project/
├── task_manager_front/          # Next.js
├── task_manager_back/           # Node.js + Express
├── task_manager_ai_back/           # FastAPI para IA y procesamiento futuro
├── docker-compose.yml
├── .env.example
├── README.md
└── docs/
    ├── api/
    ├── architecture/
    └── sprint-1/
```

---

## 4. Arquitectura propuesta

### 4.1 Vista general

```mermaid
flowchart LR
    U[Usuario] --> F[Frontend Next.js]
    F -->|REST API / HTTPS| B[Backend Node.js + Express]
    B -->|ORM Prisma| DB[(PostgreSQL)]
    B -->|API interna futura| AI[FastAPI - Servicio IA]
    B --> DOC[Swagger / OpenAPI]
```

### 4.2 Responsabilidades por componente

| Componente        | Tecnología        | Responsabilidad                                                 |
| ----------------- | ----------------- | --------------------------------------------------------------- |
| Frontend          | Next.js           | Interfaz web, autenticación visual, tablero Kanban, formularios |
| Backend principal | Node.js + Express | API REST, reglas de negocio, autenticación, proyectos, tareas   |
| Servicio IA       | FastAPI           | Base para procesamiento de texto/audio en Sprint 2              |
| Base de datos     | PostgreSQL        | Persistencia de usuarios, roles, proyectos, miembros y tareas   |
| ORM               | Prisma            | Modelado, migraciones y acceso seguro a datos                   |
| Documentación API | Swagger/OpenAPI   | Contrato técnico para probar y consumir endpoints               |
| Contenedores      | Docker Compose    | Ejecución local consistente                                     |

---

## 5. Principios de arquitectura mantenible

### 5.1 Backend como monolito modular

Para Sprint 1 se recomienda un **monolito modular** en Node.js, porque permite avanzar rápido sin sacrificar orden interno.

Cada módulo debe contener sus propias rutas, controladores, servicios, validaciones y repositorios.

```txt
backend/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.repository.ts
│   │   │   └── auth.schema.ts
│   │   ├── users/
│   │   ├── projects/
│   │   └── tasks/
│   ├── middlewares/
│   │   ├── auth.middleware.ts
│   │   ├── role.middleware.ts
│   │   ├── error.middleware.ts
│   │   └── validation.middleware.ts
│   ├── config/
│   │   ├── env.ts
│   │   ├── cors.ts
│   │   └── swagger.ts
│   ├── shared/
│   │   ├── errors/
│   │   ├── utils/
│   │   └── types/
│   ├── prisma/
│   ├── app.ts
│   └── server.ts
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── tests/
└── package.json
```

### 5.2 Capas del backend

| Capa         | Función                      | Regla                                  |
| ------------ | ---------------------------- | -------------------------------------- |
| Routes       | Define endpoints             | No debe contener lógica de negocio     |
| Controllers  | Recibe request y responde    | No debe acceder directo a la BD        |
| Services     | Contiene lógica de negocio   | Valida reglas del sistema              |
| Repositories | Acceso a datos               | Única capa que usa Prisma directamente |
| Schemas/DTOs | Valida entradas              | Usar Zod, Joi o similar                |
| Middlewares  | Seguridad, errores, permisos | Reutilizables y desacoplados           |

---

## 6. Decisiones técnicas recomendadas

| Área                 | Decisión                  |
| -------------------- | ------------------------- |
| Lenguaje backend     | TypeScript                |
| Framework backend    | Express                   |
| ORM                  | Prisma                    |
| Base de datos        | PostgreSQL                |
| Validación           | Zod                       |
| Autenticación        | JWT con cookie `httpOnly` |
| Hash de contraseña   | bcrypt o argon2           |
| Documentación        | Swagger/OpenAPI           |
| Testing backend      | Jest + Supertest          |
| Frontend             | Next.js con App Router    |
| Formularios          | React Hook Form + Zod     |
| Estado remoto        | TanStack Query            |
| Drag and drop Kanban | dnd-kit                   |
| Estilos              | Tailwind CSS              |
| Testing frontend     | Vitest + Testing Library  |
| Servicio IA          | FastAPI + Pydantic        |
| Testing FastAPI      | Pytest                    |
| Contenedores         | Docker Compose            |

---

## 7. Estándares de desarrollo

### 7.1 Convenciones de código

* Usar **TypeScript estricto** en frontend y backend.
* Usar nombres en inglés para código fuente:

  * `User`, `Project`, `Task`, `ProjectMember`.
  * `createTask`, `updateTaskStatus`, `findUserByEmail`.
* Usar español para textos visibles al usuario.
* Componentes React en `PascalCase`.
* Funciones y variables en `camelCase`.
* Constantes en `UPPER_SNAKE_CASE`.
* Endpoints REST en plural y minúscula:

  * `/api/v1/users`
  * `/api/v1/projects`
  * `/api/v1/tasks`

### 7.2 Estándar de commits

Usar Conventional Commits:

```txt
feat(auth): implement user login
feat(tasks): add task status update endpoint
fix(projects): validate duplicated project members
docs(api): add swagger documentation
test(auth): add login integration tests
chore(ci): add lint pipeline
```

### 7.3 Estrategia de ramas

```txt
main
develop
feature/HU-1-auth
feature/HU-3-projects
feature/HU-4-tasks
feature/HU-10-kanban
fix/*
hotfix/*
```

Reglas:

* `main`: solo versiones estables.
* `develop`: integración del Sprint.
* `feature/*`: una rama por historia de usuario.
* Todo cambio debe pasar por Pull Request.
* No hacer commits directos a `main`.

---

## 8. Modelo de datos inicial

Se recomienda mejorar el modelo físico propuesto en la documentación agregando campos de auditoría, enums y restricciones.

### 8.1 Entidades principales

```mermaid
erDiagram
    Role ||--o{ User : has
    User ||--o{ ProjectMember : belongs
    Project ||--o{ ProjectMember : has
    Project ||--o{ Task : contains
    User ||--o{ Task : creates
    User ||--o{ Task : responsible
```

### 8.2 Modelo lógico recomendado

| Tabla             | Propósito                           |
| ----------------- | ----------------------------------- |
| `roles`           | Roles globales del sistema          |
| `users`           | Usuarios registrados                |
| `projects`        | Espacios de trabajo                 |
| `project_members` | Relación entre usuarios y proyectos |
| `tasks`           | Tareas del tablero Kanban           |

### 8.3 Enums recomendados

```txt
RoleName:
- ADMIN
- MEMBER
- GUEST

TaskStatus:
- PENDING
- IN_PROGRESS
- DONE

TaskPriority:
- LOW
- MEDIUM
- HIGH
```

### 8.4 Campos mínimos por entidad

#### `users`

```txt
id
name
email
passwordHash
roleId
isActive
createdAt
updatedAt
```

#### `projects`

```txt
id
name
description
status
createdById
createdAt
updatedAt
```

#### `project_members`

```txt
id
userId
projectId
memberRole
joinedAt
isActive
```

#### `tasks`

```txt
id
title
description
dueDate
priority
status
projectId
createdById
responsibleId
createdAt
updatedAt
```

---

## 9. Contrato de API para Sprint 1

Todos los endpoints deben iniciar con:

```txt
/api/v1
```

### 9.1 Auth

| Método | Endpoint         | Descripción                 | Auth |
| ------ | ---------------- | --------------------------- | ---- |
| POST   | `/auth/register` | Registrar usuario           | No   |
| POST   | `/auth/login`    | Iniciar sesión              | No   |
| POST   | `/auth/logout`   | Cerrar sesión               | Sí   |
| GET    | `/auth/me`       | Obtener usuario autenticado | Sí   |

### 9.2 Usuarios

| Método | Endpoint    | Descripción                     | Auth |
| ------ | ----------- | ------------------------------- | ---- |
| GET    | `/users/me` | Ver perfil propio               | Sí   |
| PATCH  | `/users/me` | Actualizar perfil propio        | Sí   |
| GET    | `/users`    | Listar usuarios para asignación | Sí   |

### 9.3 Proyectos

| Método | Endpoint                | Descripción                    | Auth |
| ------ | ----------------------- | ------------------------------ | ---- |
| GET    | `/projects`             | Listar proyectos del usuario   | Sí   |
| POST   | `/projects`             | Crear proyecto                 | Sí   |
| GET    | `/projects/:id`         | Ver detalle de proyecto        | Sí   |
| PATCH  | `/projects/:id`         | Editar proyecto                | Sí   |
| DELETE | `/projects/:id`         | Eliminar o desactivar proyecto | Sí   |
| POST   | `/projects/:id/members` | Agregar miembro                | Sí   |
| GET    | `/projects/:id/members` | Listar miembros                | Sí   |

### 9.4 Tareas

| Método | Endpoint                     | Descripción                | Auth |
| ------ | ---------------------------- | -------------------------- | ---- |
| GET    | `/projects/:projectId/tasks` | Listar tareas por proyecto | Sí   |
| POST   | `/projects/:projectId/tasks` | Crear tarea                | Sí   |
| GET    | `/tasks/:id`                 | Ver detalle de tarea       | Sí   |
| PATCH  | `/tasks/:id`                 | Editar tarea               | Sí   |
| PATCH  | `/tasks/:id/status`          | Cambiar estado             | Sí   |
| DELETE | `/tasks/:id`                 | Eliminar tarea             | Sí   |

### 9.5 Salud del sistema

| Servicio | Método | Endpoint         | Descripción             |
| -------- | ------ | ---------------- | ----------------------- |
| Backend  | GET    | `/api/v1/health` | Verificar API principal |
| FastAPI  | GET    | `/api/v1/health` | Verificar servicio IA   |

---

## 10. Estándar de respuesta API

Todas las respuestas deben seguir una estructura uniforme.

### Respuesta exitosa

```json
{
  "success": true,
  "message": "Operación realizada correctamente",
  "data": {}
}
```

### Respuesta con error

```json
{
  "success": false,
  "message": "Error de validación",
  "errors": [
    {
      "field": "email",
      "message": "El correo es obligatorio"
    }
  ]
}
```

### Códigos HTTP esperados

| Código | Uso                                    |
| -----: | -------------------------------------- |
|    200 | Consulta o actualización exitosa       |
|    201 | Creación exitosa                       |
|    400 | Datos inválidos                        |
|    401 | Usuario no autenticado                 |
|    403 | Usuario sin permisos                   |
|    404 | Recurso no encontrado                  |
|    409 | Conflicto, por ejemplo email duplicado |
|    500 | Error interno controlado               |

---

## 11. Plan por carpeta

## 11.1 Frontend — Next.js

### Objetivo

Construir la interfaz inicial del MVP: login, registro, dashboard de proyectos, gestión de tareas y tablero Kanban.

### Estructura recomendada

```txt
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── dashboard/page.tsx
│   │   └── projects/
│   │       ├── page.tsx
│   │       └── [projectId]/
│   │           ├── page.tsx
│   │           └── kanban/page.tsx
│   ├── features/
│   │   ├── auth/
│   │   ├── projects/
│   │   ├── tasks/
│   │   └── kanban/
│   ├── components/
│   │   ├── ui/
│   │   ├── layout/
│   │   └── feedback/
│   ├── lib/
│   │   ├── api-client.ts
│   │   ├── validations.ts
│   │   └── constants.ts
│   ├── hooks/
│   └── types/
├── tests/
└── package.json
```

### Pantallas a implementar

| Ruta                           | Descripción                     |
| ------------------------------ | ------------------------------- |
| `/login`                       | Inicio de sesión                |
| `/register`                    | Registro de usuario             |
| `/dashboard`                   | Resumen inicial                 |
| `/projects`                    | Listado y creación de proyectos |
| `/projects/[projectId]`        | Detalle del proyecto            |
| `/projects/[projectId]/kanban` | Tablero Kanban                  |

### Buenas prácticas frontend

* No guardar JWT en `localStorage`.
* Usar cookies `httpOnly` manejadas por backend.
* Centralizar llamadas HTTP en `api-client.ts`.
* Validar formularios con Zod.
* Separar componentes visuales de lógica de negocio.
* Crear componentes reutilizables:

  * `Button`
  * `Input`
  * `Modal`
  * `TaskCard`
  * `KanbanColumn`
  * `ProjectCard`
* Mostrar estados de carga, error y vacío.
* Proteger rutas privadas desde middleware o validación de sesión.
* No duplicar tipos: idealmente sincronizar contratos con el backend.

---

## 11.2 Backend — Node.js + Express

### Objetivo

Implementar la API principal del sistema para autenticación, usuarios, proyectos y tareas.

### Módulos Sprint 1

```txt
auth
users
projects
tasks
health
```

### Flujo de autenticación

```mermaid
sequenceDiagram
    participant User as Usuario
    participant FE as Next.js
    participant API as Node.js API
    participant DB as PostgreSQL

    User->>FE: Ingresa credenciales
    FE->>API: POST /auth/login
    API->>DB: Buscar usuario por email
    DB-->>API: Usuario encontrado
    API->>API: Validar contraseña
    API->>API: Generar JWT
    API-->>FE: Cookie httpOnly + usuario
    FE-->>User: Redirige al dashboard
```

### Reglas de negocio

#### Auth

* El email debe ser único.
* La contraseña debe almacenarse hasheada.
* El login debe fallar con mensaje genérico para evitar exposición de datos.
* El token debe tener expiración.
* Las rutas privadas deben requerir JWT válido.

#### Proyectos

* Un proyecto debe tener un creador.
* El creador debe agregarse automáticamente como miembro administrador del proyecto.
* Un usuario solo puede ver proyectos donde es miembro.
* No se debe permitir duplicar miembros en un mismo proyecto.

#### Tareas

* Una tarea siempre pertenece a un proyecto.
* Una tarea debe tener creador.
* El responsable debe ser miembro del proyecto.
* El estado permitido debe ser:

  * `PENDING`
  * `IN_PROGRESS`
  * `DONE`
* El cambio de estado debe persistirse inmediatamente.
* La eliminación puede manejarse como borrado lógico para mantener trazabilidad.

### Buenas prácticas backend

* Usar `helmet` para cabeceras de seguridad.
* Configurar CORS por ambiente.
* Usar rate limiting en endpoints de auth.
* Validar todos los inputs.
* Manejar errores con middleware global.
* No retornar `passwordHash`.
* No exponer errores internos al cliente.
* Usar transacciones para operaciones críticas.
* Documentar endpoints con Swagger.
* Crear seeds iniciales para roles.

---

## 11.3 FastAPI — Servicio IA

### Objetivo Sprint 1

Dejar preparado el servicio independiente para futuras funcionalidades de IA, sin implementar todavía procesamiento real de minutas.

### Estructura recomendada

```txt
fastapi/
├── app/
│   ├── main.py
│   ├── api/
│   │   └── v1/
│   │       ├── health.py
│   │       └── routes.py
│   ├── core/
│   │   ├── config.py
│   │   └── logging.py
│   ├── schemas/
│   ├── services/
│   └── tests/
├── requirements.txt
└── README.md
```

### Endpoints mínimos

| Método | Endpoint         | Descripción                            |
| ------ | ---------------- | -------------------------------------- |
| GET    | `/api/v1/health` | Verifica si el servicio está activo    |
| GET    | `/api/v1/info`   | Devuelve nombre y versión del servicio |

### Buenas prácticas FastAPI

* Usar Pydantic para configuración y validaciones.
* Mantener versionado `/api/v1`.
* No permitir acceso público innecesario.
* Preparar autenticación interna por API key para Sprint 2.
* Registrar logs estructurados.
* Agregar pruebas con Pytest.
* Documentar automáticamente con OpenAPI.

---

## 12. Plan de implementación por días

### Día 1 — Configuración base e infraestructura

| Tarea                           | Carpeta           | Resultado                                         |
| ------------------------------- | ----------------- | ------------------------------------------------- |
| Configurar Docker Compose       | raíz              | PostgreSQL, backend y FastAPI levantan localmente |
| Crear `.env.example`            | raíz              | Variables documentadas                            |
| Configurar Next.js              | frontend          | Proyecto base funcionando                         |
| Configurar Express + TypeScript | backend           | API base funcionando                              |
| Configurar FastAPI              | fastapi           | Servicio IA base funcionando                      |
| Configurar Prisma               | backend           | Conexión a PostgreSQL                             |
| Crear endpoint health           | backend / fastapi | Health checks disponibles                         |

### Día 2 — Base de datos y autenticación

| Tarea                          | Carpeta          | Resultado                |
| ------------------------------ | ---------------- | ------------------------ |
| Diseñar schema Prisma          | backend          | Modelo inicial           |
| Crear migraciones              | backend          | Tablas creadas           |
| Crear seed de roles            | backend          | Roles iniciales          |
| Implementar registro           | backend          | `POST /auth/register`    |
| Implementar login              | backend          | `POST /auth/login`       |
| Implementar logout             | backend          | `POST /auth/logout`      |
| Crear pantallas login/register | frontend         | Formularios funcionales  |
| Integrar auth frontend-backend | frontend/backend | Flujo de sesión completo |

### Día 3 — Proyectos y miembros

| Tarea                  | Carpeta  | Resultado                         |
| ---------------------- | -------- | --------------------------------- |
| CRUD de proyectos      | backend  | Endpoints `/projects`             |
| Asociación de miembros | backend  | Endpoints `/projects/:id/members` |
| Validación de permisos | backend  | Solo miembros acceden             |
| Pantalla de proyectos  | frontend | Crear/listar proyectos            |
| Detalle de proyecto    | frontend | Visualización básica              |

### Día 4 — Tareas y Kanban

| Tarea                     | Carpeta          | Resultado                               |
| ------------------------- | ---------------- | --------------------------------------- |
| CRUD de tareas            | backend          | Endpoints de tareas                     |
| Cambio de estado          | backend          | `PATCH /tasks/:id/status`               |
| Validar responsable       | backend          | Responsable debe pertenecer al proyecto |
| Crear formulario de tarea | frontend         | Alta y edición de tareas                |
| Crear tablero Kanban      | frontend         | Columnas por estado                     |
| Implementar drag and drop | frontend         | Movimiento entre columnas               |
| Integrar Kanban con API   | frontend/backend | Estado actualizado en BD                |

### Día 5 — QA, documentación y cierre

| Tarea                    | Carpeta  | Resultado                      |
| ------------------------ | -------- | ------------------------------ |
| Pruebas unitarias auth   | backend  | Servicios validados            |
| Pruebas integración API  | backend  | Endpoints principales probados |
| Prueba health FastAPI    | fastapi  | Servicio base validado         |
| Pruebas UI básicas       | frontend | Formularios y Kanban validados |
| Swagger                  | backend  | Documentación disponible       |
| README Sprint 1          | docs     | Guía de ejecución              |
| Revisión de criterios HU | docs     | Checklist completado           |
| Preparar demo            | todas    | Incremento listo para revisión |

---

## 13. Sprint Backlog técnico recomendado

| ID    | Tarea                                      | Carpeta          | Estimación | Responsable sugerido | Estado inicial |
| ----- | ------------------------------------------ | ---------------- | ---------: | -------------------- | -------------- |
| SP-1  | Configurar estructura general del proyecto | raíz             |         2h | Equipo               | Por hacer      |
| SP-2  | Crear Docker Compose con PostgreSQL        | raíz             |         2h | Backend              | Por hacer      |
| SP-3  | Configurar Next.js con TypeScript          | frontend         |         2h | Frontend             | Por hacer      |
| SP-4  | Configurar Express con TypeScript          | backend          |         3h | Backend              | Por hacer      |
| SP-5  | Configurar FastAPI base                    | fastapi          |         2h | Backend/IA           | Por hacer      |
| SP-6  | Diseñar schema Prisma                      | backend          |         4h | Backend              | Por hacer      |
| SP-7  | Crear migraciones y seeds                  | backend          |         3h | Backend              | Por hacer      |
| SP-8  | Implementar registro de usuario            | backend          |         4h | Backend              | Por hacer      |
| SP-9  | Implementar login/logout JWT               | backend          |         5h | Backend              | Por hacer      |
| SP-10 | Crear pantallas login/register             | frontend         |         4h | Frontend             | Por hacer      |
| SP-11 | Implementar protección de rutas            | frontend/backend |         3h | Equipo               | Por hacer      |
| SP-12 | Implementar CRUD de proyectos              | backend          |         5h | Backend              | Por hacer      |
| SP-13 | Crear vista de proyectos                   | frontend         |         4h | Frontend             | Por hacer      |
| SP-14 | Implementar CRUD de tareas                 | backend          |         6h | Backend              | Por hacer      |
| SP-15 | Crear formulario de tareas                 | frontend         |         4h | Frontend             | Por hacer      |
| SP-16 | Implementar cambio de estado de tareas     | backend          |         3h | Backend              | Por hacer      |
| SP-17 | Crear tablero Kanban                       | frontend         |         6h | Frontend             | Por hacer      |
| SP-18 | Integrar tablero Kanban con API            | frontend/backend |         5h | Equipo               | Por hacer      |
| SP-19 | Documentar API con Swagger                 | backend          |         3h | Backend              | Por hacer      |
| SP-20 | Crear pruebas mínimas                      | todas            |         6h | Equipo               | Por hacer      |
| SP-21 | Preparar demo y documentación              | docs             |         3h | Equipo               | Por hacer      |

---

## 14. Criterios de aceptación por historia

## HU-1 — Gestión de accesos

* El usuario puede registrarse con nombre, email y contraseña.
* El sistema valida email único.
* La contraseña se guarda hasheada.
* El usuario puede iniciar sesión con credenciales válidas.
* El sistema rechaza credenciales inválidas.
* El usuario autenticado puede consultar `/auth/me`.
* El usuario puede cerrar sesión.
* Las rutas privadas bloquean usuarios no autenticados.

## HU-2 — Configuración de infraestructura

* Frontend, backend, FastAPI y PostgreSQL pueden ejecutarse localmente.
* Existe archivo `.env.example`.
* El backend se conecta correctamente a PostgreSQL.
* El frontend consume la API del backend.
* FastAPI expone health check.
* Existe documentación mínima de instalación.
* Swagger está disponible para backend.

## HU-3 — Espacios de trabajo

* Un usuario autenticado puede crear proyectos.
* El usuario creador queda asociado como miembro del proyecto.
* El usuario puede listar sus proyectos.
* El usuario puede editar proyectos donde tiene permiso.
* El usuario puede eliminar o desactivar proyectos.
* El sistema impide acceder a proyectos donde el usuario no es miembro.

## HU-4 — Gestión de tareas

* El usuario puede crear tareas dentro de un proyecto.
* La tarea debe tener título.
* La tarea puede tener descripción, fecha límite, prioridad y responsable.
* El responsable debe pertenecer al proyecto.
* El usuario puede editar tareas.
* El usuario puede eliminar tareas.
* El usuario puede cambiar el estado de una tarea.
* El usuario puede listar tareas por proyecto.

## HU-10 — Tablero Kanban visual

* El tablero muestra columnas:

  * Pendiente
  * En proceso
  * Finalizado
* Las tareas aparecen en la columna correspondiente a su estado.
* El usuario puede mover una tarea entre columnas.
* Al mover una tarea, el estado se actualiza en backend.
* El tablero muestra información básica:

  * título
  * responsable
  * prioridad
  * fecha límite
* El tablero se filtra por proyecto activo.

---

## 15. Definition of Done del Sprint 1

Una tarea se considera terminada solo si cumple:

* Código implementado.
* Código revisado mediante Pull Request.
* Sin errores de lint.
* Sin errores de TypeScript.
* Pruebas mínimas ejecutadas correctamente.
* Endpoint documentado en Swagger, si aplica.
* Variables de entorno documentadas.
* No hay secretos en el repositorio.
* La funcionalidad cumple sus criterios de aceptación.
* La funcionalidad puede demostrarse desde la interfaz.
* La rama fue integrada a `develop`.

---

## 16. Pruebas y QA

### 16.1 Backend

Pruebas mínimas:

* Registro exitoso.
* Registro con email duplicado.
* Login exitoso.
* Login inválido.
* Acceso a ruta protegida sin token.
* Crear proyecto.
* Listar proyectos del usuario.
* Crear tarea.
* Cambiar estado de tarea.
* Impedir asignar responsable externo al proyecto.

### 16.2 Frontend

Pruebas mínimas:

* Render de login.
* Validación de formulario de registro.
* Redirección después de login.
* Render de proyectos.
* Render de columnas Kanban.
* Movimiento de tarea entre columnas.

### 16.3 FastAPI

Pruebas mínimas:

* `/api/v1/health` responde correctamente.
* `/api/v1/info` responde nombre y versión del servicio.

### 16.4 Pruebas manuales de aceptación

| Flujo              | Resultado esperado                                  |
| ------------------ | --------------------------------------------------- |
| Registrar usuario  | Usuario creado y sesión iniciada o login disponible |
| Crear proyecto     | Proyecto aparece en listado                         |
| Crear tarea        | Tarea aparece en columna Pendiente                  |
| Cambiar estado     | Tarea cambia de columna                             |
| Cerrar sesión      | Usuario vuelve a login                              |
| Acceder sin sesión | Sistema redirige o bloquea acceso                   |

---

## 17. Seguridad mínima para Sprint 1

* Contraseñas hasheadas con bcrypt o argon2.
* JWT con expiración.
* Cookie `httpOnly`, `secure` en producción y `sameSite`.
* CORS restringido por ambiente.
* Validación de datos en backend.
* Sanitización básica de entradas.
* Rate limit en login y registro.
* No retornar información sensible.
* Logs sin contraseñas ni tokens.
* Variables sensibles en `.env`, nunca en Git.

---

## 18. Configuración de ambientes

### Variables raíz sugeridas

```env
NODE_ENV=development
DATABASE_URL=postgresql://user:password@localhost:5432/agile_ai_db

BACKEND_PORT=4000
BACKEND_URL=http://localhost:4000

FRONTEND_URL=http://localhost:3000

FASTAPI_PORT=8000
FASTAPI_URL=http://localhost:8000

JWT_SECRET=change_me
JWT_EXPIRES_IN=1d

COOKIE_NAME=access_token
```

### Puertos recomendados

| Servicio         | Puerto |
| ---------------- | -----: |
| Frontend Next.js |   3000 |
| Backend Node.js  |   4000 |
| FastAPI          |   8000 |
| PostgreSQL       |   5432 |

---

## 19. CI/CD mínimo recomendado

Crear un workflow que ejecute en cada Pull Request:

```txt
frontend:
- install
- lint
- typecheck
- test
- build

backend:
- install
- lint
- typecheck
- test
- prisma validate

fastapi:
- install dependencies
- lint opcional
- pytest
```

Regla: no se integra a `develop` si falla lint, build o tests principales.

---

## 20. Documentación requerida al cerrar el Sprint

```txt
docs/sprint-1/
├── sprint-goal.md
├── sprint-backlog.md
├── api-endpoints.md
├── database-model.md
├── test-report.md
├── sprint-review.md
└── sprint-retrospective.md
```

### Contenido mínimo de `sprint-review.md`

* Objetivo del Sprint.
* Historias completadas.
* Funciones demostradas.
* Evidencias o capturas.
* Feedback recibido.
* Ajustes para Sprint 2.

### Contenido mínimo de `sprint-retrospective.md`

* Qué salió bien.
* Qué no salió bien.
* Qué se debe mejorar.
* Acciones concretas para el siguiente Sprint.

---

## 21. Riesgos y mitigaciones

| Riesgo                                 | Impacto    | Mitigación                                                   |
| -------------------------------------- | ---------- | ------------------------------------------------------------ |
| Querer implementar IA en Sprint 1      | Alto       | Limitar FastAPI a estructura base y health check             |
| Falta de validación de permisos        | Alto       | Implementar middleware de auth y membership desde el inicio  |
| Guardar JWT en localStorage            | Medio/Alto | Usar cookie `httpOnly`                                       |
| Modelo de datos incompleto             | Medio      | Agregar auditoría, enums y relaciones desde el Sprint 1      |
| Kanban consume más tiempo del esperado | Medio      | Implementar primero cambio por botones y luego drag and drop |
| Acoplamiento frontend-backend          | Medio      | Centralizar API client y mantener contratos documentados     |
| Falta de pruebas                       | Alto       | Definir pruebas mínimas por HU antes de cerrar tareas        |

---

## 22. Resultado esperado del Sprint 1

Al finalizar el Sprint 1 debe existir un incremento funcional donde:

* Un usuario se registra e inicia sesión.
* El sistema protege rutas privadas.
* El usuario crea un proyecto.
* El usuario crea tareas dentro del proyecto.
* El usuario asigna responsables.
* El usuario cambia estados de tareas.
* El usuario visualiza las tareas en un tablero Kanban.
* La API está documentada.
* La base de datos está modelada y versionada con migraciones.
* FastAPI queda preparado para la integración de IA del Sprint 2.
* El proyecto cuenta con estándares mínimos de calidad, seguridad y mantenibilidad.
