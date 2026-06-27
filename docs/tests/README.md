# Pruebas del proyecto Task Manager

> **Alcance:** pruebas automatizadas y manuales documentadas en el repositorio.  
> **Última revisión:** Junio 2026

---

## Tabla de contenidos

1. [Resumen ejecutivo](#1-resumen-ejecutivo)
2. [Estrategia de pruebas](#2-estrategia-de-pruebas)
3. [Pruebas automatizadas — Backend Express](#3-pruebas-automatizadas--backend-express)
4. [Pruebas automatizadas — Backend de IA](#4-pruebas-automatizadas--backend-de-ia)
5. [Pruebas manuales y exploratorias](#5-pruebas-manuales-y-exploratorias)
6. [Cobertura y limitaciones](#6-cobertura-y-limitaciones)
7. [Ejecución de las suites](#7-ejecución-de-las-suites)

---

## 1. Resumen ejecutivo

El proyecto concentra las pruebas **automatizadas** en los dos backends. El frontend (`task_manager_front`) no incluye suite de tests unitarios ni E2E en el repositorio.

| Paquete | Framework | Ubicación | Casos | Módulos cubiertos |
|---------|-----------|-----------|-------|-------------------|
| `task_manager_back` | Vitest | `tests/` | 13 | Documentos colaborativos, chunking del copilot |
| `task_manager_ai_back` | pytest | `tests/` | 73 | Generación de diagramas EA, parsing LLM |
| `task_manager_front` | — | — | 0 | — |

Complementariamente existen **informes de pruebas manuales** (Playwright CLI) documentados en [`../manual-testing/`](../manual-testing/README.md), orientados a flujos de usuario en Sprint 1 y Sprint 2.

---

## 2. Estrategia de pruebas

### Tipos de prueba implementados

| Tipo | Descripción | Dónde se aplica |
|------|-------------|-----------------|
| **Unitarias puras** | Funciones sin dependencias externas; entradas y salidas verificadas directamente | Chunking del copilot, algoritmos de layout EA |
| **Unitarias con mocks** | Capa de servicio/repositorio con Prisma, almacenamiento o LLM simulados | Módulo de documentos (Express), parsing LLM (IA) |
| **Integración de API (ligera)** | Endpoint HTTP probado con cliente de test; dependencias externas mockeadas | `POST /api/v1/ea/generate` (FastAPI TestClient) |
| **Validación / casos negativos** | Entradas inválidas, permisos denegados, estructuras insuficientes | Ambos backends |
| **Manuales / exploratorias** | Sesiones guiadas contra la app en local con Playwright CLI | Kanban, reuniones, accesibilidad |

### Principios de aislamiento

- **No se usa base de datos real** en las suites automatizadas: Prisma y repositorios se mockean.
- **No se invocan APIs externas** en tiempo de test: LLM (`_call_llm`), Enterprise Architect COM y almacenamiento S3/disco se sustituyen por stubs.
- **No hay pruebas end-to-end** automatizadas que recorran frontend + backend + IA en cadena.

Esta estrategia prioriza **velocidad, reproducibilidad y verificación de reglas de negocio** sobre la fidelidad del entorno de producción.

---

## 3. Pruebas automatizadas — Backend Express

**Framework:** [Vitest](https://vitest.dev/) v4  
**Comando:** `npm test` (equivale a `vitest run`)  
**Directorio:** `task_manager_back/tests/`

### 3.1. Módulo Copilot — chunking (`copilot.chunking.test.ts`)

Pruebas **unitarias puras** sobre `src/modules/copilot/indexing/chunking.ts`, usado para indexar conocimiento del agente RAG.

| Caso | Qué verifica |
|------|--------------|
| Texto vacío o solo espacios | `chunkText` devuelve arreglo vacío |
| Texto corto | Un solo chunk con `tokenCount`, `contentHash` (64 chars) |
| Texto largo | Múltiples chunks con solapamiento (`maxTokens`, `overlapTokens`) |
| `contentHash` | Hash estable para contenido idéntico; distinto para contenido diferente |
| `estimateTokens` | Estimación proporcional a la longitud del texto |
| `singleChunk` | Envoltorio atómico con hash correcto |

**Técnica:** sin mocks; funciones puras.

### 3.2. Módulo Documentos — repositorio (`documents.repository.test.ts`)

Pruebas **unitarias con mock de Prisma** sobre `updateDocumentContentState`.

| Caso | Qué verifica |
|------|--------------|
| Persistencia de snapshot Yjs | El buffer `contentState` se guarda en `Document.contentState` vía `prisma.document.update` con el `where` y `select` esperados |

**Técnica:** `vi.mock("../src/prisma/client")`, `vi.hoisted`.

### 3.3. Módulo Documentos — servicio (`documents.service.test.ts`)

Pruebas **unitarias de capa de negocio** sobre `documents.service.ts` con mocks de Prisma, repositorio y almacenamiento de assets.

| Caso | Qué verifica |
|------|--------------|
| Creación de documento | Solo miembros activos del proyecto pueden crear; llama a `createDocument` |
| Rechazo por no-miembro | Usuario sin membresía recibe error 403; no se persiste |
| Lectura con autorización | `getDocument` devuelve documento + rol de acceso; rechaza sin permiso |
| Renombrado y borrado lógico | `renameDocument` y `deleteDocument` operan tras validar acceso |
| Subida de asset | Almacena en S3/disco vía `storeDocumentAsset`; respuesta **no** expone `s3Key` |
| Listado, descarga y eliminación | Flujo completo de assets con validación de membresía y borrado del objeto en storage |

**Dependencias mockeadas:**

- `../src/prisma/client` — consulta de `projectMember`
- `../src/modules/documents/documents.repository`
- `../src/services/document-asset-storage.service`

**Técnica:** `vi.mock`, `vi.hoisted`, `beforeEach` con `vi.clearAllMocks`.

---

## 4. Pruebas automatizadas — Backend de IA

**Framework:** [pytest](https://docs.pytest.org/) 8.2.2  
**Comando:** `python -m pytest tests/`  
**Directorio:** `task_manager_ai_back/tests/`  
**Dependencia:** incluida en `requirements.txt` (omitida en `requirements-render.txt` de producción)

Aunque viven en el paquete de IA, forman parte de la estrategia de pruebas del proyecto completo.

### 4.1. API de diagramas EA (`test_ea_api.py`)

Pruebas de **integración ligera** con `FastAPI TestClient` contra `POST /api/v1/ea/generate`.

| Caso | Resultado esperado |
|------|-------------------|
| `diagram_type` inválido | HTTP 400, mensaje `"Unsupported diagram_type"` |
| Secuencia / actividad / componente / despliegue — éxito | HTTP 200, `status: success`, URL terminada en `.png` |
| Mismo tipos — fallo de EA COM | HTTP 500, mensaje descriptivo sobre requisito de Enterprise Architect |

**Técnica:** `monkeypatch` de `parse_architecture_prompt` y `EnterpriseArchitectService`.

### 4.2. Servicio Enterprise Architect (`test_ea_service.py`)

44 pruebas **unitarias** sobre `EnterpriseArchitectService`: enrutamiento, generación y algoritmos de layout.

**Grupos principales:**

| Grupo | Contenido |
|-------|-----------|
| Enrutamiento por tipo | Secuencia, actividad, componente y despliegue usan EA; clase hace fallback a Mermaid |
| Errores COM | Excepciones con mensajes claros por tipo de diagrama |
| Dispatch interno | `_dispatch_ea_generation` enruta al handler correcto |
| Layout de despliegue | Posicionamiento por roles, anti-solapamiento, compactación de escena, estereotipos |
| Layout de componentes | Columnas por capa, notas de interfaces |
| Layout de actividad | Ramas, lanes v2, fork/join, decisiones, loopback |
| Layout de secuencia | Fragmentos `alt`/`loop`, activaciones inferidas, compactación de cajas |

**Técnica:** `monkeypatch`, `tmp_path`, `pytest.raises`.

### 4.3. Parsing LLM de arquitectura (`test_llm_service_*.py`)

20 pruebas sobre `parse_architecture_prompt()` en `llm_service.py`, organizadas por tipo de diagrama.

| Archivo | Casos cubiertos |
|---------|-----------------|
| `test_llm_service_sequence.py` | Prompt vacío, normalización, estructura insuficiente, fusión/expansión de fragmentos `alt` |
| `test_llm_service_activity.py` | Nodos y flujos, etiquetas de decisión, lanes v2, referencias inválidas, nodos requeridos |
| `test_llm_service_component.py` | Componentes y dependencias, referencias desconocidas, estructura mínima |
| `test_llm_service_deployment.py` | Nodos, artefactos y conexiones, referencias inválidas, estructura mínima |

**Técnica:** `monkeypatch` de `_call_llm` con respuestas JSON simuladas; `asyncio.run` para funciones async; `pytest.raises(ValueError)` en casos negativos.

---

## 5. Pruebas manuales y exploratorias

Las pruebas manuales **no forman parte de las suites automatizadas**, pero están documentadas como evidencia de validación funcional.

| Recurso | Alcance |
|---------|---------|
| [`../manual-testing/README.md`](../manual-testing/README.md) | Índice de informes Playwright CLI |
| [`../manual-testing/bugs-2026-05-18.md`](../manual-testing/bugs-2026-05-18.md) | Sprint 1 + flujos Sprint 2 (reuniones, sala, minutas) |
| [`../manual-testing/kanban-dark-mode-a11y-2026-05-18.md`](../manual-testing/kanban-dark-mode-a11y-2026-05-18.md) | Kanban — accesibilidad y modo oscuro |
| [`../manual-testing/kanban-v2-personalization.md`](../manual-testing/kanban-v2-personalization.md) | Kanban v2 — personalización |
| [`../sprint-2/testing-ai-expanded.md`](../sprint-2/testing-ai-expanded.md) | Guía manual del pipeline de IA (Daily, Sprint Planning, Kanban automático) |

**Herramienta:** `@playwright/cli` contra frontend en `http://localhost:3000` con backend en `http://localhost:4000`.

---

## 6. Cobertura y limitaciones

### Módulos con pruebas automatizadas

- Documentos colaborativos (Express): servicio, repositorio, assets
- Indexación del copilot: chunking de texto
- Generación de diagramas EA (IA): API, servicio, parsing LLM

### Módulos sin pruebas automatizadas documentadas

| Área | Estado |
|------|--------|
| Autenticación y usuarios | Sin suite |
| Proyectos, tareas, Kanban | Validación manual |
| Reuniones, minutas, sugerencias | Guía manual Sprint 2 |
| Chat en tiempo real (Socket.IO) | Sin suite |
| Video llamadas / WebRTC | Sin suite |
| Dashboard | Sin suite |
| Frontend Next.js | Sin suite |
| Transcripción Whisper / LLM en producción | Solo mocks en tests EA |

### Limitaciones conocidas

- Las pruebas automatizadas **no sustituyen** la verificación con Enterprise Architect COM instalado en Windows.
- Las pruebas de documentos **no ejercitan** PostgreSQL ni el flujo completo de colaboración Yjs en red.
- Algunos tests de servicio pueden requerir mocks adicionales si el módulo de documentos invoca el indexador del copilot en la creación.

---

## 7. Ejecución de las suites

### Backend Express (Vitest)

```bash
cd task_manager_back
npm test
```

Requisitos: Node.js, dependencias instaladas (`npm install` o `pnpm install`).

### Backend de IA (pytest)

```bash
cd task_manager_ai_back
pip install -r requirements.txt
python -m pytest tests/
```

Opciones útiles:

```bash
# Verbose
python -m pytest tests/ -v

# Un archivo
python -m pytest tests/test_ea_api.py

# Un caso concreto
python -m pytest tests/test_ea_api.py::test_generate_diagram_rejects_invalid_type
```

### Pruebas manuales (referencia)

Ver [`../manual-testing/README.md`](../manual-testing/README.md) para levantar frontend, backend y reproducir sesiones Playwright CLI.

---

## Referencias cruzadas

| Documento | Relación |
|-----------|----------|
| [`../manual-testing/`](../manual-testing/) | Informes de pruebas manuales |
| [`../sprint-2/testing-ai-expanded.md`](../sprint-2/testing-ai-expanded.md) | Escenarios manuales del pipeline de IA |
| [`../../tests/`](../../tests/) | Código fuente de tests Express |
| [`../../../task_manager_ai_back/tests/`](../../../task_manager_ai_back/tests/) | Código fuente de tests IA |
