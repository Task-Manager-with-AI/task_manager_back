# Guía de Ejecución — Videoconferencia + Minutas Automáticas

Esta guía explica cómo correr el flujo completo del Sprint 2 (videollamada → audio → transcripción → minutas → tareas Kanban) en una máquina local, tanto con **OpenAI (pago)** como con **modelos locales (gratis)**.

---

## 1. Requisitos previos

| Software | Versión |
|---|---|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| PostgreSQL | ≥ 14 (corriendo en `localhost:5432`) |
| Python | ≥ 3.10 |
| ffmpeg | (requerido por Whisper para decodificar audio) |

**Windows — instalar ffmpeg:**
```powershell
winget install Gyan.FFmpeg
# o con Chocolatey: choco install ffmpeg
```
Reinicia la terminal para que `ffmpeg` esté en el PATH.

**Navegador:** Chrome, Edge o Firefox actualizado (necesario para WebRTC + MediaRecorder).  
WebRTC requiere `localhost` (que cuenta como contexto seguro) o HTTPS. Funciona directo en `http://localhost:3000`.

---

## 2. Configurar la base de datos

Crear la base `agile_ai_db` en Postgres y aplicar migraciones:

```powershell
cd task_manager_back
# Asegúrate de que DATABASE_URL en .env apunte a tu Postgres local
npx prisma migrate deploy
npx prisma generate
npm run prisma:seed   # opcional — crea datos iniciales
```

---

## 3. Elegir el proveedor de IA

Tienes dos opciones para transcripción + LLM. Configura **una sola** en `task_manager_ai_back/.env`.

### Opción A — OpenAI (pago, fácil)

Costos aproximados (mayo 2026):
- **Whisper API**: ~$0.006 USD por minuto de audio.
- **GPT-4o-mini**: ~$0.15 USD por millón de tokens input, $0.60 USD por millón de tokens output. Una reunión típica de 30 min consume ~$0.02 USD entre minutas y sugerencias.

**Setup:**
1. Obtén una API key en https://platform.openai.com/api-keys
2. Crea `task_manager_ai_back/.env`:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=sk-tu-api-key
OPENAI_WHISPER_MODEL=whisper-1
OPENAI_LLM_MODEL=gpt-4o-mini
DEFAULT_LANGUAGE=es
```

3. Instala dependencias Python:

```powershell
cd task_manager_ai_back
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Opción B — Modelos locales (gratis)

Usa **faster-whisper** (Whisper local) + **Ollama** (LLM local). Sin costos, todo corre en tu máquina.

**Requisitos:**
- 8 GB RAM mínimo (16 GB recomendado para modelos medianos).
- CPU moderna (los modelos `tiny` y `base` corren bien en CPU).
- Opcional: GPU NVIDIA con CUDA para velocidad.

**Pasos:**

1. **Instalar Ollama:**
   - Descarga el instalador para Windows en https://ollama.com/download
   - Ollama queda corriendo como servicio en `http://localhost:11434`

2. **Descargar un modelo LLM** (en una terminal nueva):

```powershell
# Recomendado: Llama 3.1 8B (≈ 4.7 GB, balance calidad/rendimiento)
ollama pull llama3.1:8b

# Alternativas más livianas:
ollama pull llama3.2:3b      # ~2 GB, más rápido pero menos preciso
ollama pull mistral:7b       # alternativa de buena calidad

# Verificar que funciona:
ollama run llama3.1:8b
# Escribe algo y > /bye para salir
```

3. **Configurar `task_manager_ai_back/.env`:**

```env
AI_PROVIDER=local

# Whisper local
LOCAL_WHISPER_MODEL=base     # tiny|base|small|medium|large-v3
LOCAL_WHISPER_DEVICE=cpu     # cambia a "cuda" si tienes GPU NVIDIA
LOCAL_WHISPER_COMPUTE_TYPE=int8

# Ollama LLM
OLLAMA_HOST=http://localhost:11434
OLLAMA_LLM_MODEL=llama3.1:8b

DEFAULT_LANGUAGE=es
```

4. **Instalar dependencias Python con extras locales:**

```powershell
cd task_manager_ai_back
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install faster-whisper==1.0.3 ollama==0.3.0
```

> **Modelos de Whisper recomendados:**
> - `tiny` (75 MB): rapidísimo, calidad baja — solo para pruebas
> - `base` (140 MB): rápido, calidad razonable — **default sugerido**
> - `small` (460 MB): mejor calidad, todavía manejable en CPU
> - `medium` (1.5 GB): muy buena calidad, requiere GPU para tiempos aceptables
> - `large-v3` (3 GB): la mejor calidad, solo con GPU

La primera vez que el AI backend transcriba, descargará automáticamente el modelo Whisper elegido en `~/.cache/huggingface/`.

---

## 4. Variables de entorno del backend Node

`task_manager_back/.env` ya incluye las nuevas variables:

```env
AI_BACKEND_URL=http://localhost:8000
AUDIO_UPLOAD_DIR=./public/uploads/audio

# Opcional: almacenamiento privado en AWS S3 para audios/videos de reuniones.
# Si AWS_REGION y AWS_S3_BUCKET existen, el backend usa S3.
# Si faltan, usa AUDIO_UPLOAD_DIR como fallback local.
AWS_REGION=us-east-1
AWS_S3_BUCKET=gestionagil-331145994790-us-east-1-an
AWS_S3_AUDIO_PREFIX=meetings/audio
AWS_ACCESS_KEY_ID=tu_access_key_id
AWS_SECRET_ACCESS_KEY=tu_secret_access_key
```

No necesitas tocar nada mas si Postgres esta en `localhost:5432`. Para desarrollo sin S3, deja comentadas o vacias las variables AWS y el audio se guardara en `AUDIO_UPLOAD_DIR`.

---

## 5. Arrancar los 3 servicios

Abre **3 terminales** simultáneas:

**Terminal 1 — Backend Node (puerto 4000):**
```powershell
cd task_manager_back
npm install                  # solo la primera vez
npm run dev
```
Verifica: `http://localhost:4000/api/v1/health` debe responder OK.

**Terminal 2 — AI Backend FastAPI (puerto 8000):**
```powershell
cd task_manager_ai_back
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```
Verifica: `http://localhost:8000/api/v1/health` debe responder OK.

**Terminal 3 — Frontend Next.js (puerto 3000):**
```powershell
cd task_manager_front
npm install                  # solo la primera vez
npm run dev
```
Abre: `http://localhost:3000`

---

## 6. Probar el flujo completo

1. **Login** con un usuario existente (o registra uno).
2. **Entra a un proyecto** y asegúrate de que tiene al menos un miembro activo.
3. Click en **"Reuniones"** (botón nuevo, arriba a la derecha del proyecto).
4. **"Nueva reunión"** → completa título y selecciona participantes (incluido tú).
5. En el detalle de la reunión, click **"Unirse a la llamada"**.
6. El navegador pedirá permiso de cámara y micrófono — acepta.
7. Verás tu video y, si otro participante se une desde otra ventana, su video aparecerá automáticamente.
8. La grabación de audio empieza sola al unirte (verás "🔴 Grabando" en el header).
9. Habla unos 30 segundos como mínimo (la IA necesita contenido para extraer acuerdos).
10. Click en **"Terminar"**:
    - El audio se sube al backend.
    - Si S3 esta configurado, el audio queda como objeto privado en `meetings/audio/`.
    - Si S3 no esta configurado, el audio queda en `public/uploads/audio/`.
    - Se inicia el pipeline AI (transcripción → minutas → sugerencias).
    - Verás un loader: "Procesando audio y generando minutas..."
    - Cuando termine (30 segundos a varios minutos según duración), te redirige automáticamente a `/meetings/{id}/minutes`.
11. Revisa la minuta:
    - Resumen + puntos clave + acuerdos extraídos.
    - Lista de sugerencias de tareas con prioridad y responsable sugerido.
12. **Acepta una sugerencia** → la tarea aparece automáticamente en el tablero **Kanban** del proyecto.

### Verificacion de storage S3

Si configuraste AWS S3:

1. Abre el bucket `gestionagil-331145994790-us-east-1-an`.
2. Entra al prefijo `meetings/audio/`.
3. Confirma que exista un objeto con formato `{meetingId}-{suffix}.{extension}`.
4. En la base de datos, `Meeting.audioUrl` debe tener formato `s3://bucket/key`.

Si no configuraste S3, confirma que el archivo exista en `task_manager_back/public/uploads/audio/` y que `Meeting.audioUrl` tenga formato `/uploads/audio/{fileName}`.

---

## 7. Probar con varios participantes en una sola máquina

Para verificar el flujo multi-usuario sin necesidad de dos computadoras:

1. Abre Chrome en una ventana normal (Usuario A) y otra ventana en modo **incógnito** (Usuario B).
2. Inicia sesión con cuentas distintas en cada ventana.
3. Crea un proyecto con ambos usuarios como miembros.
4. Crea una reunión que invite a ambos.
5. Únete desde las dos ventanas — verás los streams cruzados.

---

## 8. Troubleshooting

| Problema | Solución |
|---|---|
| `OPENAI_API_KEY is not configured` | Configura la key en `task_manager_ai_back/.env` y reinicia uvicorn. O cambia a `AI_PROVIDER=local`. |
| `faster-whisper is not installed` | `pip install faster-whisper` en el venv activo. |
| `ollama package not installed` | `pip install ollama` en el venv activo. |
| Ollama responde 404 / "model not found" | Ejecuta `ollama pull llama3.1:8b` (o el modelo de tu `.env`). |
| El video local aparece pero no veo a otros | Asegúrate de que la otra pestaña abrió la misma reunión y aceptó permisos. Revisa la consola del browser. |
| Socket.IO no conecta | Verifica que `next.config.mjs` tiene la rewrite `/socket.io/*` → backend. |
| "No audio uploaded" en el estado FAILED | El MediaRecorder no llegó a grabar nada. Habla al menos 5 segundos antes de terminar. |
| El audio no aparece en S3 | Verifica `AWS_REGION`, `AWS_S3_BUCKET`, credenciales IAM y permisos `s3:PutObject` sobre `meetings/audio/*`. |
| S3 no configurado | El backend usa fallback local en `AUDIO_UPLOAD_DIR`; confirma que el archivo exista en `public/uploads/audio/`. |
| Whisper local muy lento | Cambia a `LOCAL_WHISPER_MODEL=tiny` o `base`. Si tienes GPU: `LOCAL_WHISPER_DEVICE=cuda`. |
| Migración Prisma falla | Verifica que Postgres está corriendo y `DATABASE_URL` es correcto. |

---

## 9. Comparación rápida: OpenAI vs Local

| Criterio | OpenAI | Local (faster-whisper + Ollama) |
|---|---|---|
| Costo | ~$0.02 USD por reunión de 30 min | Gratis |
| Setup | API key y listo | Instalar Ollama + descargar modelos (~5 GB) |
| Calidad transcripción | Excelente | Buena con `base`, excelente con `large-v3` |
| Calidad minutas | Excelente (GPT-4o-mini) | Buena con Llama 3.1 8B |
| Velocidad (reunión 30 min, CPU media) | ~30-60 seg total | ~3-8 min total |
| Privacidad | Datos van a OpenAI | 100% local |
| Internet requerido | Sí | No (tras descarga inicial) |

**Recomendación para desarrollo:** usa `AI_PROVIDER=local` con `LOCAL_WHISPER_MODEL=base` + `llama3.2:3b` para iteraciones rápidas, y cambia a OpenAI solo cuando quieras demostrar el producto final.

---

## 10. Estructura de archivos del nuevo flujo

```
task_manager_back/
  prisma/
    schema.prisma                                  ← +6 modelos nuevos
    migrations/20260518222346_add_meetings_minutes_suggestions/
  src/
    server.ts                                      ← http.createServer + Socket.IO
    app.ts                                         ← +3 routers + static /uploads
    config/env.ts                                  ← +AI_BACKEND_URL, AUDIO_UPLOAD_DIR, AWS S3 opcional
    services/
      ai-client.service.ts                         ← cliente HTTP al AI backend
      audio-storage.service.ts                     ← guardar/leer audio en S3 o fallback local
    signaling/
      signaling.server.ts                          ← Socket.IO con JWT auth + relay
    modules/
      meetings/    (routes, controller, service, repository, schema)
      minutes/     (routes, controller, service, repository)
      suggestions/ (routes, controller, service, repository, schema)

task_manager_ai_back/
  app/
    main.py                                        ← +3 routers
    core/config.py                                 ← pydantic-settings + AI_PROVIDER
    services/
      whisper_service.py                           ← OpenAI O faster-whisper
      llm_service.py                               ← OpenAI O Ollama
    schemas/
      transcription.py
      minutes.py
      suggestions.py
    api/v1/
      transcription.py                             ← POST /api/v1/transcribe
      minutes.py                                   ← POST /api/v1/minutes
      suggestions.py                               ← POST /api/v1/suggestions
  .env.example                                     ← ambas opciones documentadas
  requirements.txt                                 ← +openai, +aiofiles, +python-multipart

task_manager_front/
  next.config.mjs                                  ← +rewrites /socket.io y /uploads
  features/
    meetings/    (types, api, hooks)
    suggestions/ (types, api, hooks)
    video-call/
      useSignaling.ts                              ← socket.io-client
      useWebRTC.ts                                 ← RTCPeerConnection map
      useAudioRecorder.ts                          ← MediaRecorder hook
      VideoCallRoom.tsx                            ← composición full-screen
      VideoGrid.tsx
      VideoTile.tsx
      CallControls.tsx
  app/(dashboard)/projects/[projectId]/meetings/
    page.tsx                                       ← lista
    new/page.tsx                                   ← formulario
    [meetingId]/page.tsx                           ← lobby / detalle
    [meetingId]/room/layout.tsx                    ← layout sin sidebar
    [meetingId]/room/page.tsx                      ← sala video
    [meetingId]/minutes/page.tsx                   ← revisión minutas + sugerencias
```
