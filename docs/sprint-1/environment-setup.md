# Sprint 1 Environment Setup

## Requirements

- Node.js 20
- npm
- Docker Desktop
- Python 3.12 if running the AI service outside Docker

## Environment

Copy `.env.example` to `.env` at the project root and adjust values when needed.

Frontend API URL lives in `task_manager_front/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
```

## Start With Docker

```bash
docker compose up --build
```

Services:

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:3000` |
| Backend API | `http://localhost:4000/api/v1` |
| Swagger | `http://localhost:4000/api/docs` |
| AI service | `http://localhost:8000/api/v1/health` |
| PostgreSQL | `localhost:5432` |

## Local Backend

```bash
cd task_manager_back
npm install
npx prisma migrate dev
npm run prisma:seed
npm run dev
```

## Local Frontend

```bash
cd task_manager_front
npm install
npm run dev
```

## Verification

```bash
cd task_manager_back
npm run build

cd ../task_manager_front
npx tsc --noEmit
npm run build
```

On Windows PowerShell, use `npm.cmd` or `npx.cmd` if script execution policy blocks `npm.ps1`.
