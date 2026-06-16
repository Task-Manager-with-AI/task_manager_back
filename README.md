# Task Manager Backend

Backend principal del sistema Task Manager AI. Esta API esta construida con Node.js, Express, TypeScript y Prisma, usando PostgreSQL como base de datos.

## Requisitos

- Node.js 20 o superior
- pnpm 10 o superior
- PostgreSQL corriendo localmente
- Una base de datos llamada `agile_ai_db`

## 1. Entrar a la carpeta del backend

Desde la raiz del proyecto:

```powershell
cd task_manager_back
```

Si estas en Windows y el proyecto esta en `D:\Proyecto_grado`:

```powershell
cd D:\Proyecto_grado\task_manager_back
```

## 2. Instalar dependencias

La primera vez que levantes el backend, instala las dependencias:

Este proyecto usa `pnpm` como package manager. Instala las dependencias asi:

```powershell
pnpm install
```

Luego puedes ejecutar los scripts del backend con:

```powershell
pnpm dev
pnpm build
pnpm start
pnpm prisma:migrate
pnpm prisma:seed
```

Este proyecto usa `argon2`, que es una dependencia nativa. Con `pnpm` debe estar permitido su script de build. El `package.json` ya incluye:

```json
"pnpm": {
  "onlyBuiltDependencies": [
    "argon2"
  ]
}
```

Si aparece un error parecido a `Cannot find module ... argon2.node`, reconstruye la dependencia:

```powershell
pnpm rebuild argon2
```

Si aparece un error parecido a `Cannot find module '.prisma/client/default'`, genera el Prisma Client:

```powershell
pnpm exec prisma generate
```

## 3. Crear el archivo `.env`

El proyecto incluye un archivo de ejemplo llamado `.env.example`.

Copia ese archivo y crea un `.env`:

```powershell
Copy-Item .env.example .env
```

Luego revisa que el `.env` tenga valores similares a estos:

```env
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agile_ai_db
JWT_SECRET=local_development_secret_32_chars_minimum
JWT_EXPIRES_IN=1d
COOKIE_NAME=access_token
BACKEND_PORT=4000
COLLABORATION_PORT=4001
FRONTEND_URL=http://localhost:3000
AI_BACKEND_URL=http://localhost:8000
AI_FETCH_TIMEOUT_MS=900000
AUDIO_UPLOAD_DIR=./public/uploads/audio
```

Importante:

- `DATABASE_URL` debe coincidir con tu usuario, password, host, puerto y nombre de base de datos de PostgreSQL.
- Por defecto se usa la base de datos `agile_ai_db`.
- `JWT_SECRET` debe tener al menos 32 caracteres.
- `AI_BACKEND_URL` apunta al backend de IA. Para levantar solo el backend principal, puede quedarse como `http://localhost:8000`, aunque el servicio de IA aun no este encendido.
- `COLLABORATION_PORT` levanta Hocuspocus/Yjs para documentos colaborativos. En local se usa `ws://localhost:4001/collaboration`.

### Almacenamiento de audios en S3

Por defecto, los audios se guardan localmente en `AUDIO_UPLOAD_DIR`.

Si configuras AWS S3, el backend guardara los audios y videos de reuniones en un bucket privado:

```env
AWS_REGION=us-east-1
AWS_S3_BUCKET=gestionagil-331145994790-us-east-1-an
AWS_S3_AUDIO_PREFIX=meetings/audio
AWS_ACCESS_KEY_ID=tu_access_key_id
AWS_SECRET_ACCESS_KEY=tu_secret_access_key
```

Cuando `AWS_REGION` y `AWS_S3_BUCKET` estan configurados, el backend usa S3. Si faltan, usa el almacenamiento local como fallback.

Los objetos se guardan con este formato:

```text
meetings/audio/{meetingId}-{suffix}.{extension}
```

En la base de datos, `Meeting.audioUrl` guarda una referencia privada:

```text
s3://bucket/key
```

No subas credenciales AWS a Git. Mantenlas solo en `.env`.

### Documentos colaborativos

El backend Node tambien levanta el servidor colaborativo Hocuspocus/Yjs en el mismo proceso, usando el puerto configurado en `COLLABORATION_PORT`.

En local:

```text
API REST: http://localhost:4000/api/v1
WebSocket documentos: ws://localhost:4001/collaboration
Frontend: http://localhost:3000
```

El frontend debe tener:

```env
NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_COLLABORATION_URL=ws://localhost:4001/collaboration
```

Validacion manual recomendada:

1. Crear un documento desde `/projects/:projectId/documents`.
2. Abrir el mismo documento en dos navegadores o sesiones.
3. Editar simultaneamente y confirmar que ambos ven los cambios.
4. Recargar y confirmar que el contenido persiste.
5. Reiniciar el backend y confirmar que el documento vuelve a cargar.
6. Subir, descargar y eliminar un adjunto.
7. Intentar abrir el documento con un usuario que no pertenece al proyecto y confirmar bloqueo.

## 4. Crear la base de datos local

Abre PostgreSQL y crea la base de datos:

```sql
CREATE DATABASE agile_ai_db;
```

Si usas `psql`, puedes hacerlo asi:

```powershell
psql -U postgres -c "CREATE DATABASE agile_ai_db;"
```

Si la base de datos ya existe, puedes continuar con el siguiente paso.

## 5. Ejecutar migraciones de Prisma

Con PostgreSQL corriendo y el `.env` configurado:

```powershell
pnpm exec prisma migrate dev
```

Esto crea o actualiza las tablas necesarias en la base de datos.

## 6. Generar Prisma Client

Normalmente `migrate dev` ya genera el cliente, pero si necesitas hacerlo manualmente:

```powershell
pnpm exec prisma generate
```

## 7. Cargar datos iniciales

Ejecuta el seed para crear los roles iniciales:

```powershell
pnpm prisma:seed
```

Este comando crea los roles:

- `ADMIN`
- `MEMBER`
- `GUEST`

## 8. Levantar el backend en modo desarrollo

Inicia el servidor:

```powershell
pnpm dev
```

Si todo esta correcto, deberias ver una salida similar:

```text
Server running on http://localhost:4000
Swagger docs at http://localhost:4000/api/docs
```

## 9. Verificar que funciona

Abre en el navegador:

```text
http://localhost:4000/api/v1/health
```

Tambien puedes probar con PowerShell:

```powershell
Invoke-RestMethod http://localhost:4000/api/v1/health
```

La documentacion Swagger esta disponible en:

```text
http://localhost:4000/api/docs
```

## Scripts disponibles

```powershell
pnpm dev
```

Levanta el backend en modo desarrollo con recarga automatica.

```powershell
pnpm build
```

Compila TypeScript y genera la carpeta `dist`.

```powershell
pnpm start
```

Ejecuta el backend compilado desde `dist/server.js`.

```powershell
pnpm prisma:migrate
```

Ejecuta `prisma migrate dev`.

```powershell
pnpm prisma:seed
```

Carga datos iniciales en la base de datos.

## Problemas comunes

### `DATABASE_URL is required`

El archivo `.env` no existe o no esta siendo leido. Crea el archivo `.env` en la raiz de `task_manager_back`.

### `JWT_SECRET must be at least 32 characters`

El valor de `JWT_SECRET` es muy corto. Usa un texto de al menos 32 caracteres.

### No conecta a PostgreSQL

Verifica que PostgreSQL este corriendo en el puerto `5432`:

```powershell
Test-NetConnection localhost -Port 5432
```

Tambien revisa que la base de datos exista:

```powershell
psql -U postgres -l
```

### La base de datos no existe

Crea la base:

```powershell
psql -U postgres -c "CREATE DATABASE agile_ai_db;"
```

### Error con `npm.ps1` en Windows

Si PowerShell bloquea la ejecucion de scripts, usa:

```powershell
npm.cmd install
npm.cmd run dev
```

### Error `EPERM: operation not permitted, rename` con Prisma en Windows

Este error suele aparecer cuando `pnpm dev`, `ts-node-dev` o algun proceso Node sigue usando el archivo nativo de Prisma:

```text
query_engine-windows.dll.node
```

Primero detén el servidor con `Ctrl + C`. Si el problema continua, revisa procesos Node vivos:

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node|pnpm|ts-node' } | Select-Object ProcessId,Name,CommandLine
```

Luego cierra los procesos relacionados con `task_manager_back` y vuelve a generar Prisma:

```powershell
pnpm exec prisma generate
```

## Orden recomendado completo

```powershell
cd D:\Proyecto_grado\task_manager_back
pnpm install
Copy-Item .env.example .env
pnpm exec prisma migrate dev
pnpm prisma:seed
pnpm dev
```

Luego verifica:

```text
http://localhost:4000/api/v1/health
```
