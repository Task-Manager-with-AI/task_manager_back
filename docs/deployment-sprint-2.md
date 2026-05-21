# Plan de despliegue — Sprint 2 (IA, reuniones y minutas)

Este documento describe cómo desplegar el incremento del **Sprint 2**: reuniones con videollamada, transcripción de audio, generación de minutas, sugerencias de tareas, análisis por tipo de reunión (Daily / Sprint Planning / Regular) y detección de actualizaciones en Kanban.

Está alineado con la planificación en [`sprint-2/sprint_2.md`](./sprint-2/sprint_2.md), la guía operativa en [`sprint-2/GUIA_EJECUCION.md`](./sprint-2/GUIA_EJECUCION.md) y las pruebas en [`sprint-2/testing-ai-expanded.md`](./sprint-2/testing-ai-expanded.md).

---

## 1. Alcance del despliegue

| Componente | Puerto | Rol en Sprint 2 |
|------------|--------|-----------------|
| **PostgreSQL** | 5432 | Modelos `Meeting`, `Minute`, `TaskSuggestion`, `DailyAnalysis`, trazabilidad, etc. |
| **Backend Node** (`task_manager_back`) | 4000 | API REST, JWT, almacenamiento de audio, orquestación hacia el servicio IA, Socket.IO |
| **Backend IA** (`task_manager_ai_back`) | 8000 | Transcripción (Whisper), LLM (minutas, sugerencias, análisis) |
| **Frontend** (`task_manager_front`) | 3000 | UI de reuniones, sala de video, revisión de minutas y sugerencias |

El backend Node **no ejecuta NLP**; delega en el servicio FastAPI mediante `AI_BACKEND_URL` (cliente en `src/services/ai-client.service.ts`).

### Endpoints del servicio IA (FastAPI)

| Método | Ruta | Uso |
|--------|------|-----|
| `GET` | `/api/v1/health` | Comprobación de vida |
| `POST` | `/api/v1/transcribe` | Audio → texto |
| `POST` | `/api/v1/minutes` | Transcripción → minuta estructurada |
| `POST` | `/api/v1/suggestions` | Acuerdos → tareas sugeridas |
| `POST` | `/api/v1/detect-type` | Clasificación Daily / Sprint Planning / Regular |
| `POST` | `/api/v1/analyze-daily` | Análisis Daily Scrum |
| `POST` | `/api/v1/analyze-sprint` | Análisis Sprint Planning |
| `POST` | `/api/v1/detect-kanban-updates` | Cambios de estado en tareas mencionadas |

Documentación interactiva: `http://<host>:8000/api/docs`.

---

## 2. Arquitectura de despliegue

```mermaid
flowchart LR
    subgraph Cliente
        FE[Frontend :3000]
    end
    subgraph Aplicacion
        API[Backend Node :4000]
        IA[Backend IA FastAPI :8000]
    end
    subgraph Datos
        DB[(PostgreSQL)]
        S3[(AWS S3 privado / audios)]
        DISK[(Fallback local / uploads audio)]
    end
    subgraph ProveedorIA["Proveedor IA (elige uno)"]
        OAI[OpenAI API]
        LOC[faster-whisper + Ollama]
    end

    FE --> API
    API --> DB
    API --> S3
    API -. desarrollo sin S3 .-> DISK
    API -->|HTTP AI_BACKEND_URL| IA
    IA --> OAI
    IA --> LOC
```

**Flujo tras finalizar una reunión:** el Node guarda el audio en S3 privado si esta configurado (`s3://bucket/key`) o en disco local como fallback, lee el buffer para enviarlo al servicio IA, llama en secuencia a transcribe → detect-type → detect-kanban-updates → análisis/minutas/sugerencias según el tipo, y persiste en PostgreSQL.

---

## 3. Requisitos previos

| Requisito | Desarrollo | Producción |
|-----------|------------|------------|
| Node.js | ≥ 18 (20 recomendado) | ≥ 20 LTS |
| Python | ≥ 3.10 (3.12 en Docker) | ≥ 3.12 |
| PostgreSQL | ≥ 14 | ≥ 16 |
| **ffmpeg** | Obligatorio para decodificar audio (Whisper local y algunos formatos) | Instalar en el host o en la imagen del servicio IA |
| Navegador | Chrome / Edge / Firefox (WebRTC) | HTTPS obligatorio fuera de `localhost` |

**Windows — ffmpeg:**

```powershell
winget install Gyan.FFmpeg
```

Reinicia la terminal para que `ffmpeg` esté en el `PATH`.

---

## 4. Variables de entorno

### 4.1 Backend Node (`task_manager_back/.env`)

| Variable | Descripción | Ejemplo desarrollo | Ejemplo producción |
|----------|-------------|--------------------|--------------------|
| `DATABASE_URL` | Conexión Prisma | `postgresql://postgres:postgres@localhost:5432/agile_ai_db` | URL del servidor gestionado |
| `JWT_SECRET` | ≥ 32 caracteres | (secreto fuerte) | (secreto fuerte, rotación periódica) |
| `FRONTEND_URL` | CORS + cookies | `http://localhost:3000` | `https://app.tudominio.com` |
| `AI_BACKEND_URL` | Base URL del servicio IA | `http://localhost:8000` | `http://ai-backend:8000` (Docker) o URL interna |
| `AUDIO_UPLOAD_DIR` | Fallback local de audios si S3 no esta configurado | `./public/uploads/audio` | Volumen temporal solo para fallback |
| `AWS_REGION` | Region del bucket S3 | `us-east-1` | Region real del bucket |
| `AWS_S3_BUCKET` | Bucket privado para audios/videos de reuniones | `gestionagil-331145994790-us-east-1-an` | Bucket privado de produccion |
| `AWS_S3_AUDIO_PREFIX` | Prefijo de objetos de audio | `meetings/audio` | `meetings/audio` |
| `AWS_ACCESS_KEY_ID` | Access key IAM para desarrollo/despliegue fuera de AWS | No commitear | Preferir rol IAM si corre en AWS |
| `AWS_SECRET_ACCESS_KEY` | Secret key IAM | No commitear | Preferir rol IAM si corre en AWS |

Plantilla: [`task_manager_back/.env.example`](../.env.example).

### 4.2 Backend IA (`task_manager_ai_back/.env`)

Toda la configuración del proveedor de IA vive aquí. Plantilla: [`task_manager_ai_back/.env.example`](../../task_manager_ai_back/.env.example).

La variable clave es **`AI_PROVIDER`**: `openai` o `local`. Solo debe estar activa **una** alternativa a la vez.

| Variable | Aplica cuando | Descripción |
|----------|---------------|-------------|
| `AI_PROVIDER` | Siempre | `openai` o `local` |
| `OPENAI_API_KEY` | `openai` | Clave de https://platform.openai.com/api-keys |
| `OPENAI_WHISPER_MODEL` | `openai` | Por defecto `whisper-1` |
| `OPENAI_LLM_MODEL` | `openai` | Por defecto `gpt-4o-mini` |
| `LOCAL_WHISPER_MODEL` | `local` | `tiny`, `base`, `small`, `medium`, `large-v3` |
| `LOCAL_WHISPER_DEVICE` | `local` | `cpu` o `cuda` (GPU NVIDIA) |
| `LOCAL_WHISPER_COMPUTE_TYPE` | `local` | p. ej. `int8` en CPU |
| `OLLAMA_HOST` | `local` | URL del servidor Ollama |
| `OLLAMA_LLM_MODEL` | `local` | Modelo ya descargado con `ollama pull` |
| `DEFAULT_LANGUAGE` | Siempre | Por defecto `es` |

### 4.3 Docker (sin Compose en el repo)

> Este repositorio no incluye `docker-compose.yml`. Si deseas usar Compose, crea tu propio archivo con los servicios `backend`, `ai_backend`, `db` y `frontend`.

Para desplegar en Docker por servicio, utiliza los `Dockerfile` existentes y define las variables de entorno en cada contenedor (por ejemplo, `AI_BACKEND_URL` en el backend Node y `AI_PROVIDER`/`OPENAI_API_KEY` en el backend IA).

---

## 5. Despliegue del backend de IA (FastAPI)

El servicio vive en `task_manager_ai_back/`. Arranque estándar:

```bash
cd task_manager_ai_back
python -m venv .venv
# Windows PowerShell:
# .\.venv\Scripts\Activate.ps1
source .venv/bin/activate   # Linux/macOS
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Verificación:

```bash
curl http://localhost:8000/api/v1/health
```

En producción, evita `--reload`; usa un proceso manager (systemd, supervisord) o la imagen Docker existente.

---

## 6. Alternativa A — OpenAI (API key)

**Cuándo usarla:** demos, producción sin GPU, menor tiempo de configuración. Requiere internet y facturación en OpenAI.

### 6.1 Configuración

1. Crea una API key en [OpenAI Platform](https://platform.openai.com/api-keys).
2. Crea o edita `task_manager_ai_back/.env`:

```env
AI_PROVIDER=openai

OPENAI_API_KEY=sk-tu-clave-secreta
OPENAI_WHISPER_MODEL=whisper-1
OPENAI_LLM_MODEL=gpt-4o-mini

DEFAULT_LANGUAGE=es
```

3. Instala dependencias (OpenAI ya está en `requirements.txt`):

```bash
pip install -r requirements.txt
```

4. Reinicia uvicorn tras cualquier cambio en `.env`.

### 6.2 Costos orientativos (referencia)

| Servicio | Orden de magnitud |
|----------|------------------|
| Whisper API | ~USD 0.006 / minuto de audio |
| GPT-4o-mini (minutas + sugerencias + análisis) | ~USD 0.02 por reunión de ~30 min (estimado) |

### 6.3 Despliegue con Docker (OpenAI)

1. Define las variables de la sección 6.1 en el contenedor de IA.
2. En el contenedor del backend Node, configura `AI_BACKEND_URL` apuntando al host del servicio IA.
3. Construye y ejecuta cada servicio con su `Dockerfile`.

Comprueba: `http://localhost:8000/api/v1/health` y `http://localhost:4000/api/v1/health`.

La imagen [`task_manager_ai_back/Dockerfile`](../../task_manager_ai_back/Dockerfile) instala solo `requirements.txt` (incluye `openai`). **No requiere** Ollama ni `faster-whisper`.

### 6.4 Producción

- Guarda `OPENAI_API_KEY` en un gestor de secretos (no en el repositorio).
- Limita egress del contenedor si la política de seguridad lo exige.
- Monitoriza cuotas y errores 429/5xx de OpenAI en los logs del servicio IA.

---

## 7. Alternativa B — Modelos locales (faster-whisper + Ollama)

**Cuándo usarla:** desarrollo sin costo, entornos con restricción de datos (audio y texto no salen de la red), o demos offline tras descargar modelos.

### 7.1 Componentes locales

| Pieza | Función | Dónde corre |
|-------|---------|-------------|
| **faster-whisper** | Transcripción en máquina | Proceso Python del backend IA |
| **Ollama** | LLM (minutas, sugerencias, análisis) | Servicio aparte (por defecto `:11434`) |
| **ffmpeg** | Decodificación de audio | Sistema o contenedor IA |

### 7.2 Instalación de Ollama y modelo LLM

1. Instala Ollama: https://ollama.com/download  
2. Descarga el modelo configurado en `.env`:

```bash
ollama pull llama3.1:8b
# Alternativas más livianas: llama3.2:3b, mistral:7b
ollama run llama3.1:8b   # prueba rápida; salir con /bye
```

3. Verifica que responde: `curl http://localhost:11434/api/tags`

### 7.3 Configuración `task_manager_ai_back/.env`

```env
AI_PROVIDER=local

# Whisper local (primera transcripción descarga el modelo en ~/.cache/huggingface)
LOCAL_WHISPER_MODEL=base
LOCAL_WHISPER_DEVICE=cpu
LOCAL_WHISPER_COMPUTE_TYPE=int8

# Ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_LLM_MODEL=llama3.1:8b

DEFAULT_LANGUAGE=es
```

**Modelos Whisper recomendados:**

| Modelo | Tamaño aprox. | Uso |
|--------|---------------|-----|
| `tiny` | 75 MB | Solo pruebas |
| `base` | 140 MB | **Default sugerido** en CPU |
| `small` | 460 MB | Mejor calidad, más lento en CPU |
| `medium` / `large-v3` | 1.5–3 GB | Preferible con GPU (`LOCAL_WHISPER_DEVICE=cuda`) |

### 7.4 Dependencias Python adicionales

Descomenta o instala los extras locales:

```bash
pip install -r requirements.txt
pip install faster-whisper ollama
```

En `requirements.txt` las líneas de `faster-whisper` y `ollama` están comentadas; son obligatorias con `AI_PROVIDER=local`.

### 7.5 Arranque en desarrollo (3 procesos)

Además del backend IA, **Ollama debe estar corriendo** antes de procesar reuniones.

| Terminal | Comando |
|----------|---------|
| Ollama | Servicio del instalador (Windows/macOS) o `ollama serve` |
| IA | `uvicorn app.main:app --reload --port 8000` en `task_manager_ai_back` |
| Node + Front | Según [`sprint-2/GUIA_EJECUCION.md`](./sprint-2/GUIA_EJECUCION.md) |

### 7.6 Despliegue local + Docker (recomendación híbrida)

El contenedor `ai_backend` **no incluye** Ollama ni `faster-whisper` por defecto. Opciones:

| Estrategia | Descripción |
|------------|-------------|
| **H1 — IA fuera de Docker** | Postgres + Node + Front en Compose; FastAPI y Ollama en el host. `AI_BACKEND_URL=http://host.docker.internal:8000` en el backend. |
| **H2 — Ollama en host, IA en Docker** | Extiende el Dockerfile con `ffmpeg`, `faster-whisper` y `ollama`. En `.env`: `OLLAMA_HOST=http://host.docker.internal:11434`. |
| **H3 — Todo en un servidor Linux** | Instala Ollama en el mismo host que uvicorn; `OLLAMA_HOST=http://127.0.0.1:11434`. Sin Compose para IA, o imagen custom con GPU. |

Ejemplo **H1** — `task_manager_back/.env` dentro de Docker, IA en host Windows:

```env
AI_BACKEND_URL=http://host.docker.internal:8000
```

`task_manager_ai_back/.env` en el host:

```env
AI_PROVIDER=local
OLLAMA_HOST=http://localhost:11434
LOCAL_WHISPER_MODEL=base
LOCAL_WHISPER_DEVICE=cpu
```

### 7.7 Recursos hardware

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| RAM | 8 GB | 16 GB (Llama 8B + Whisper `base`) |
| CPU | 4 núcleos modernos | 8+ núcleos |
| GPU | Opcional | NVIDIA + CUDA para Whisper `medium`/`large` y Ollama más rápido |
| Disco | ~5 GB (modelos Ollama + Whisper) | 10+ GB si usas varios modelos |

Tiempos orientativos (reunión ~30 min, CPU media): transcripción + LLM **3–8 min** frente a **30–60 s** con OpenAI.

---

## 8. Integración con el backend Node

Tras desplegar el servicio IA:

1. **Migraciones Sprint 2:**

```bash
cd task_manager_back
npx prisma migrate deploy
npx prisma generate
```

2. **`AI_BACKEND_URL`** debe ser alcanzable desde el proceso Node (misma red Docker, `localhost`, o URL interna del balanceador).

3. **Storage de audios:** configura `AWS_REGION` y `AWS_S3_BUCKET` para usar S3 privado. El backend guardara `Meeting.audioUrl` como `s3://bucket/key` y leera el objeto desde S3 para enviarlo al servicio IA.

4. **Fallback local:** si faltan `AWS_REGION` o `AWS_S3_BUCKET`, `AUDIO_UPLOAD_DIR` debe existir y ser escribible. Este modo es para desarrollo o contingencia, no como almacenamiento principal de produccion.

5. El Node no valida `AI_PROVIDER`; solo hace HTTP al FastAPI. Los errores de configuración (sin API key, Ollama caído) aparecen como fallos del pipeline de reunión (`FAILED` / mensaje controlado).

---

## 9. Despliegue del stack completo

### 9.1 Orden recomendado

```text
1. PostgreSQL (healthy)
2. Migraciones Prisma (backend)
3. Backend IA (health OK) + proveedor (OpenAI u Ollama+Whisper)
4. Backend Node (health OK, AI_BACKEND_URL correcto)
5. Frontend
```

### 9.2 Docker (por servicio)

Ejecuta cada servicio con su `Dockerfile` y configura las variables de entorno correspondientes.

| Servicio | URL local |
|----------|-----------|
| Frontend | http://localhost:3000 |
| API Node | http://localhost:4000/api/v1 |
| Swagger Node | http://localhost:4000/api/docs |
| IA | http://localhost:8000/api/v1/health |
| Docs IA | http://localhost:8000/api/docs |

### 9.3 Despliegue manual (sin Docker)

Sigue [`sprint-2/GUIA_EJECUCION.md`](./sprint-2/GUIA_EJECUCION.md) secciones 2–5: base de datos, `.env` del IA, tres terminales (Node, IA, Front).

---

## 10. Verificación post-despliegue

### 10.1 Checks automáticos

```bash
# Servicio IA
curl -s http://localhost:8000/api/v1/health

# Backend Node
curl -s http://localhost:4000/api/v1/health
```

### 10.2 Checklist funcional (mínimo)

| # | Verificación | Criterio de éxito |
|---|--------------|-------------------|
| 1 | Health IA | JSON con estado OK |
| 2 | `AI_PROVIDER=openai` | Transcripción de un audio corto sin error 500 por API key |
| 3 | `AI_PROVIDER=local` | `ollama list` muestra el modelo de `OLLAMA_LLM_MODEL`; transcripción no falla por paquetes faltantes |
| 4 | Flujo reunión | Crear reunión → videollamada → terminar → minuta o análisis según tipo |
| 5 | Sugerencias | Al menos una sugerencia o tarea desde minuta / Sprint Planning |
| 6 | Kanban | Actualización automática si se menciona tarea completada (ver [`testing-ai-expanded.md`](./sprint-2/testing-ai-expanded.md)) |

### 10.3 Errores frecuentes

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| `OPENAI_API_KEY is not configured` | `AI_PROVIDER=openai` sin clave | Añadir clave o cambiar a `local` |
| `faster-whisper is not installed` | `AI_PROVIDER=local` sin pip extra | `pip install faster-whisper` |
| `ollama package not installed` | Falta dependencia | `pip install ollama` |
| Ollama 404 / model not found | Modelo no descargado | `ollama pull <OLLAMA_LLM_MODEL>` |
| Node no alcanza IA | `AI_BACKEND_URL` incorrecto en Docker | Usar nombre de servicio o `host.docker.internal` |
| Pipeline lento | Whisper grande en CPU | `LOCAL_WHISPER_MODEL=base` o `tiny`; GPU + `cuda` |
| Sin audio al terminar | Grabación &lt; 5 s | Hablar al menos ~30 s en la prueba |

---

## 11. Comparación de alternativas IA

| Criterio | OpenAI (`AI_PROVIDER=openai`) | Local (`AI_PROVIDER=local`) |
|----------|-------------------------------|-----------------------------|
| Costo | Por uso (Whisper + GPT) | Gratis (electricidad / hardware) |
| Setup | API key en `.env` | Ollama + `ollama pull` + pip extras + ffmpeg |
| Calidad | Muy alta | Buena con `base` + Llama 3.1 8B |
| Latencia | Baja | Alta en CPU |
| Privacidad | Datos en OpenAI | 100 % en tu infraestructura |
| Internet | Requerido | Solo para descarga inicial de modelos |
| Docker “out of the box” | Sí (imagen actual) | Requiere imagen extendida u host Ollama |

**Recomendación:** desarrollo iterativo con **local** (`base` + `llama3.2:3b`); staging/demo/producto con **OpenAI** si no hay GPU dedicada.

---

## 12. Seguridad y producción

- No commitear `.env` ni API keys; usar `.env.example` como referencia.
- El servicio IA **no expone autenticación propia**; debe estar en red privada o detrás del backend (solo el Node llama al puerto 8000).
- `FRONTEND_URL` y `JWT_SECRET` del backend deben coincidir con el dominio real (HTTPS).
- WebRTC en producción exige **HTTPS** (no solo `localhost`).
- Rotar `OPENAI_API_KEY` si se filtra; revisar logs sin volcar transcripciones completas en cliente.
- S3 debe permanecer privado; usar IAM con permisos minimos sobre `meetings/audio/*` y no usar credenciales root.
- No commitear `AWS_ACCESS_KEY_ID` ni `AWS_SECRET_ACCESS_KEY`; en AWS preferir roles IAM sobre claves estaticas.
- Backups: PostgreSQL + politicas/versionado del bucket S3. La carpeta `AUDIO_UPLOAD_DIR` solo aplica si se usa fallback local.

---

## 13. Referencias

| Documento | Contenido |
|-----------|-----------|
| [`sprint-2/sprint_2.md`](./sprint-2/sprint_2.md) | Historias de usuario, arquitectura, modelo de datos |
| [`sprint-2/GUIA_EJECUCION.md`](./sprint-2/GUIA_EJECUCION.md) | Ejecución local paso a paso y troubleshooting |
| [`sprint-2/testing-ai-expanded.md`](./sprint-2/testing-ai-expanded.md) | Pruebas Daily / Sprint / Kanban |
| [`sprint-1/environment-setup.md`](./sprint-1/environment-setup.md) | Entorno Sprint 1 y Docker base |
| [`task_manager_ai_back/.env.example`](../../task_manager_ai_back/.env.example) | Plantilla completa de variables IA |

---

*Última actualización: mayo 2026 — Sprint 2 (videoconferencia, minutas IA, análisis expandido).*
