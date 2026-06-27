# Diagramas de secuencia en Enterprise Architect (HU 19, HU 20, HU 21)

> **Propósito:** scripts **JavaScript (JScript)** que, ejecutados dentro del motor de
> scripting de **Enterprise Architect**, generan los **diagramas de secuencia** de tres
> historias de usuario del proyecto Task Manager:
>
> - **HU 19** – Agente RAG “Copiloto de Proyectos”
> - **HU 20** – Generación de Diagramas EA
> - **HU 21** – Documentos Colaborativos por Proyecto
>
> **Ubicación de este documento:** `task_manager_back/docs/tests/diagramas-secuencia-ea.md`
>
> **Fecha:** Junio 2026

---

## Tabla de contenidos

1. [Requisitos previos](#1-requisitos-previos)
2. [Cómo ejecutar los scripts en EA](#2-cómo-ejecutar-los-scripts-en-ea)
3. [Motor reutilizable (pegar al inicio de cada script)](#3-motor-reutilizable-pegar-al-inicio-de-cada-script)
4. [HU 19 — Agente RAG “Copiloto de Proyectos”](#4-hu-19--agente-rag-copiloto-de-proyectos)
5. [HU 20 — Generación de Diagramas EA](#5-hu-20--generación-de-diagramas-ea)
6. [HU 21 — Documentos Colaborativos por Proyecto](#6-hu-21--documentos-colaborativos-por-proyecto)
7. [Notas y limitaciones](#7-notas-y-limitaciones)

---

## 1. Requisitos previos

| Requisito | Detalle |
|-----------|---------|
| Enterprise Architect instalado | versión 15+ recomendada (probado con motor JScript interno). En Windows se usa el mismo `EA.App` que el servicio `ea_service.py`. |
| Modelo base abierto | `modelo_base.eapx` (o `.qea`) — el mismo que usa el backend de IA. Abrirlo en la instancia de EA antes de correr los scripts. |
| Paquete destino seleccionado | En el *Project Browser*, selecciona el paquete donde se crearán los diagramas. Los scripts escriben ahí. |
| Motor de scripting | *Configure > Scripting* (o *Specialize > Scripting* según versión). Crear un nuevo script de tipo **JScript** por cada HU. |

> **Por qué JScript y no Python/COM externo:** los scripts usan el objeto global
> `Repository` del motor interno de EA, sin dependencias externas (`win32com`, Node,
> etc.). La API coincide con la que usa `task_manager_ai_back/app/services/ea_service.py`,
> de modo que el resultado es consistente con lo que genera el backend de IA.

---

## 2. Cómo ejecutar los scripts en EA

1. Abre el modelo `modelo_base.eapx` en EA.
2. En el *Project Browser*, **selecciona el paquete** donde crearás los diagramas.
3. Ve a *Scripting* → botón derecho → **New Script → JScript**.
4. Pega el **bloque del motor (sección 3)** al inicio del script.
5. Debajo, pega el contenido de **una** de las HU (secciones 4, 5 o 6).
6. **Run** (F5 o botón ▶). El diagrama se crea en el paquete seleccionado y se recarga.
7. Repite creando un script nuevo por cada HU.

La salida se registra en la ventana *System Output* (`Session.Output`):
`OK: "HU19 - Copiloto RAG" creado (7 participantes, 15 mensajes).`

---

## 3. Motor reutilizable (pegar al inicio de cada script)

Este bloque define el constructor `construirSecuencia(Repository, config)`.
Es **idéntico** en los tres scripts — solo cambia el objeto `config` de cada HU.

```javascript
//!JScript
// =====================================================================
//  Motor reutilizable para diagramas de secuencia en Enterprise Architect.
//  API equivalente a task_manager_ai_back/app/services/ea_service.py
//  (Sequence: Actor / Object+Lifeline, conectores Sequence con Subtype,
//   InteractionFragment para alt/opt/loop).
//  Pega este bloque al INICIO de cada script de HU.
// =====================================================================

var SEQ_TOP = 60;                    // y superior de los lifelines
var SEQ_PARTICIPANT_W = 150;         // ancho de cada participante
var SEQ_GAP = 40;                    // separacion horizontal entre participantes
var SEQ_MESSAGE_TOP = 140;           // y del primer mensaje
var SEQ_MESSAGE_SPACING = 68;        // separacion vertical entre mensajes
var SEQ_LIFELINE_PAD = 60;           // padding inferior del lifeline
var otPackage = 5;                   // EA.ObjectType.otPackage

// Constantes de subtipo (iguales a ea_service.py)
var SEQ_MSG_SUBTYPES = { sync: 0, async: 1, "return": 3 };
var SEQ_FRAGMENT_SUBTYPES = { alt: 0, opt: 1, loop: 4 };

// Devuelve el paquete seleccionado, o null si no hay uno valido.
function seqObtenerPaquete(repository) {
    var pkg = repository.GetTreeSelectedObject();
    if (!pkg || pkg.ObjectType !== otPackage) {
        Session.Output("ERROR: selecciona un Paquete en el Project Browser.");
        return null;
    }
    return pkg;
}

// Crea un participante: Actor o (Object + estereotipo Lifeline) y lo ubica.
function seqAddParticipante(pkg, diagram, nombre, tipo, left, bottom) {
    var tipoEl = (tipo === "actor") ? "Actor" : "Object";
    var el = pkg.Elements.AddNew(nombre, tipoEl);
    if (tipo !== "actor") {
        el.Stereotype = "Lifeline";
    }
    el.Update();

    var right = left + SEQ_PARTICIPANT_W;
    var geo = "l=" + left + ";r=" + right + ";t=" + SEQ_TOP + ";b=" + bottom + ";";
    var dObj = diagram.DiagramObjects.AddNew(geo, "");
    dObj.ElementID = el.ElementID;
    dObj.Update();
    return el;
}

// Crea un mensaje (conector Sequence) entre dos participantes + DiagramLink.
function seqAddMensaje(diagram, origen, destino, texto, numero, kind) {
    var c = origen.Connectors.AddNew(texto, "Sequence");
    c.ClientID = origen.ElementID;
    c.SupplierID = destino.ElementID;
    c.Direction = "Source -> Destination";
    c.Subtype = SEQ_MSG_SUBTYPES[kind || "sync"];
    c.SequenceNo = String(numero);
    c.Update();
    origen.Connectors.Refresh();

    var dl = diagram.DiagramLinks.AddNew("", "");
    dl.ConnectorID = c.ConnectorID;
    dl.Update();
    return c;
}

// Crea un fragmento alt/opt/loop que envuelve los mensajes [desde..hasta].
function seqAddFragmento(pkg, diagram, tipo, etiqueta, desde, hasta, left, right) {
    var el = pkg.Elements.AddNew(etiqueta || tipo, "InteractionFragment");
    el.Subtype = SEQ_FRAGMENT_SUBTYPES[tipo];
    if (tipo === "alt") {
        el.Stereotype = "alt";
        el.Alias = "alt";
    }
    el.Update();

    var top = SEQ_MESSAGE_TOP + ((desde - 1) * SEQ_MESSAGE_SPACING) - 12;
    var bottom = SEQ_MESSAGE_TOP + (hasta * SEQ_MESSAGE_SPACING) + 12;
    var geo = "l=" + left + ";r=" + right + ";t=" + top + ";b=" + bottom + ";";
    var dObj = diagram.DiagramObjects.AddNew(geo, "");
    dObj.ElementID = el.ElementID;
    dObj.Update();
    return el;
}

// Constructor principal. config = { nombre, participantes[], mensajes[], fragmentos?[] }
function construirSecuencia(repository, config) {
    var pkg = seqObtenerPaquete(repository);
    if (!pkg) return;

    var nMsgs = config.mensajes.length;
    var bottom = SEQ_MESSAGE_TOP + (nMsgs * SEQ_MESSAGE_SPACING) + SEQ_LIFELINE_PAD;

    var diagram = pkg.Diagrams.AddNew(config.nombre, "Sequence");
    diagram.Update();

    // 1) Participantes (de izquierda a derecha)
    var mapa = {};
    var left = 100;
    var lastRight = left;
    for (var i = 0; i < config.participantes.length; i++) {
        var p = config.participantes[i];
        mapa[p.nombre] = seqAddParticipante(pkg, diagram, p.nombre, p.tipo, left, bottom);
        lastRight = left + SEQ_PARTICIPANT_W;
        left = lastRight + SEQ_GAP;
    }

    // 2) Mensajes (el SequenceNo los apila verticalmente al recargar)
    for (var j = 0; j < config.mensajes.length; j++) {
        var m = config.mensajes[j];
        var o = mapa[m.de];
        var d = mapa[m.a];
        if (!o || !d) {
            Session.Output("WARN: participante no encontrado: " + m.de + " -> " + m.a);
            continue;
        }
        seqAddMensaje(diagram, o, d, m.texto, m.numero, m.kind);
    }

    // 3) Fragmentos (opcional): alt / opt / loop
    if (config.fragmentos) {
        for (var k = 0; k < config.fragmentos.length; k++) {
            var f = config.fragmentos[k];
            seqAddFragmento(pkg, diagram, f.tipo, f.etiqueta,
                            f.desde, f.hasta, 90, lastRight + 30);
        }
    }

    diagram.DiagramObjects.Refresh();
    diagram.DiagramLinks.Refresh();
    repository.ReloadDiagram(diagram.DiagramID);

    Session.Output("OK: \"" + config.nombre + "\" creado (" +
        config.participantes.length + " participantes, " + nMsgs + " mensajes).");
}
```

---

## 4. HU 19 — Agente RAG “Copiloto de Proyectos”

**Flujo documentado:** el usuario hace una pregunta; el *Frontend* abre un SSE a
`POST /projects/:id/copilot/ask`; el *Express* orquesta un bucle de herramientas,
llama a `agent_step` (IA) → LLM, el modelo invoca la herramienta `search_knowledge`
(RAG), que embebe el query, recupera chunks por similitud coseno y los inyecta como
contexto; una segunda llamada al LLM produce la respuesta con citas.

**Participantes:** `Usuario`, `CopilotPanel` (Front), `askController` (Express),
`agent_service` (IA), `DeepSeek LLM`, `embedding_service`, `KnowledgeChunk` (DB).

```javascript
//!JScript
// HU 19 - Copiloto RAG (flujo ASK con tool search_knowledge).
// Requiere el bloque del motor (seccion 3) pegado arriba.

var configHU19 = {
    nombre: "HU19 - Copiloto RAG",
    participantes: [
        { nombre: "Usuario",                          tipo: "actor" },
        { nombre: "CopilotPanel (Front)",             tipo: "lifeline" },
        { nombre: "askController (Express)",          tipo: "lifeline" },
        { nombre: "agent_service (IA)",               tipo: "lifeline" },
        { nombre: "DeepSeek LLM",                     tipo: "lifeline" },
        { nombre: "embedding_service",                tipo: "lifeline" },
        { nombre: "KnowledgeChunk (DB)",              tipo: "lifeline" }
    ],
    mensajes: [
        { numero: 1,  de: "Usuario",                 a: "CopilotPanel (Front)",  texto: "1: escribe pregunta",                       kind: "sync" },
        { numero: 2,  de: "CopilotPanel (Front)",    a: "askController (Express)", texto: "2: POST /projects/:id/copilot/ask (SSE)", kind: "async" },
        { numero: 3,  de: "askController (Express)", a: "agent_service (IA)",    texto: "3: agentStep(messages, tools)",             kind: "async" },
        { numero: 4,  de: "agent_service (IA)",      a: "DeepSeek LLM",          texto: "4: chat.completions(tools)",                kind: "sync" },
        { numero: 5,  de: "DeepSeek LLM",            a: "agent_service (IA)",    texto: "5: tool_call: search_knowledge",            kind: "return" },
        { numero: 6,  de: "askController (Express)", a: "embedding_service",     texto: "6: POST /embeddings (query)",               kind: "async" },
        { numero: 7,  de: "embedding_service",       a: "askController (Express)", texto: "7: queryVector[1536]",                     kind: "return" },
        { numero: 8,  de: "askController (Express)", a: "KnowledgeChunk (DB)",   texto: "8: retrieve(projectId, vector, topK)",      kind: "sync" },
        { numero: 9,  de: "KnowledgeChunk (DB)",     a: "askController (Express)", texto: "9: chunks top-K (cosine)",                 kind: "return" },
        { numero: 10, de: "askController (Express)", a: "agent_service (IA)",    texto: "10: agentStep(contexto)",                   kind: "async" },
        { numero: 11, de: "agent_service (IA)",      a: "DeepSeek LLM",          texto: "11: chat.completions(contexto)",            kind: "sync" },
        { numero: 12, de: "DeepSeek LLM",            a: "agent_service (IA)",    texto: "12: respuesta final + citas",               kind: "return" },
        { numero: 13, de: "askController (Express)", a: "CopilotPanel (Front)",  texto: "13: SSE message + citations",               kind: "return" },
        { numero: 14, de: "askController (Express)", a: "KnowledgeChunk (DB)",   texto: "14: saveMessage(assistant)",                kind: "sync" },
        { numero: 15, de: "CopilotPanel (Front)",    a: "Usuario",               texto: "15: renderiza respuesta",                   kind: "sync" }
    ],
    // El bloqueo 3-9 es el cuerpo del bucle de herramientas (una iteracion RAG).
    fragmentos: [
        { tipo: "loop", etiqueta: "loop [bucle de herramientas]", desde: 3, hasta: 9 }
    ]
};

construirSecuencia(Repository, configHU19);
```

---

## 5. HU 20 — Generación de Diagramas EA

**Flujo documentado:** desde el editor colaborativo se abre `EaDiagramModal`
(tipo + prompt) → `POST /projects/:id/diagrams` → Express lo reenvía al backend de IA
`POST /api/v1/ea/generate` → `parse_architecture_prompt` (LLM) produce JSON estructurado
→ `EnterpriseArchitectService.generate_diagram` automatiza **EA por COM**
(`EA.App`, `OpenFile(modelo_base)`, crea participantes/mensajes, exporta PNG con
`PutDiagramImageToFile`) → Express descarga el PNG, lo persiste como asset y lo sirve
por `/api/v1/diagrams/:id/content`.

**Participantes:** `Usuario`, `EaDiagramModal` (Front),
`createGeneratedDiagramForProject` (Express), `generate_diagram` (IA/`ea.py`),
`parse_architecture_prompt` (LLM), `EnterpriseArchitectService`, `EA.App` (COM),
`modelo_base.eapx` (archivo).

```javascript
//!JScript
// HU 20 - Generacion de diagramas EA (proxy Express -> IA -> COM -> PNG).
// Requiere el bloque del motor (seccion 3) pegado arriba.

var configHU20 = {
    nombre: "HU20 - Generacion de Diagramas EA",
    participantes: [
        { nombre: "Usuario",                                   tipo: "actor" },
        { nombre: "EaDiagramModal (Front)",                    tipo: "lifeline" },
        { nombre: "createGeneratedDiagramForProject (Express)", tipo: "lifeline" },
        { nombre: "generate_diagram (IA/ea.py)",               tipo: "lifeline" },
        { nombre: "parse_architecture_prompt (LLM)",           tipo: "lifeline" },
        { nombre: "EnterpriseArchitectService",                tipo: "lifeline" },
        { nombre: "EA.App (COM)",                              tipo: "lifeline" },
        { nombre: "modelo_base.eapx",                          tipo: "lifeline" }
    ],
    mensajes: [
        { numero: 1,  de: "Usuario",                                   a: "EaDiagramModal (Front)",                     texto: "1: selecciona tipo + prompt",                      kind: "sync" },
        { numero: 2,  de: "EaDiagramModal (Front)",                    a: "createGeneratedDiagramForProject (Express)", texto: "2: POST /projects/:id/diagrams",                   kind: "async" },
        { numero: 3,  de: "createGeneratedDiagramForProject (Express)", a: "generate_diagram (IA/ea.py)",               texto: "3: POST /api/v1/ea/generate",                      kind: "async" },
        { numero: 4,  de: "generate_diagram (IA/ea.py)",               a: "parse_architecture_prompt (LLM)",            texto: "4: parse(prompt, diagram_type)",                   kind: "async" },
        { numero: 5,  de: "parse_architecture_prompt (LLM)",           a: "generate_diagram (IA/ea.py)",                texto: "5: architecture_data (JSON)",                      kind: "return" },
        { numero: 6,  de: "generate_diagram (IA/ea.py)",               a: "EnterpriseArchitectService",                 texto: "6: generate_diagram(data, output_path)",           kind: "sync" },
        { numero: 7,  de: "EnterpriseArchitectService",                a: "EA.App (COM)",                               texto: "7: Dispatch(EA.App) + OpenFile(modelo_base)",      kind: "sync" },
        { numero: 8,  de: "EnterpriseArchitectService",                a: "EA.App (COM)",                               texto: "8: crea participantes + mensajes Sequence",        kind: "sync" },
        { numero: 9,  de: "EnterpriseArchitectService",                a: "EA.App (COM)",                               texto: "9: PutDiagramImageToFile (PNG)",                   kind: "sync" },
        { numero: 10, de: "EA.App (COM)",                              a: "modelo_base.eapx",                           texto: "10: escribe diagram_<ts>.png",                     kind: "sync" },
        { numero: 11, de: "generate_diagram (IA/ea.py)",               a: "createGeneratedDiagramForProject (Express)", texto: "11: { status: success, url }",                     kind: "return" },
        { numero: 12, de: "createGeneratedDiagramForProject (Express)", a: "generate_diagram (IA/ea.py)",               texto: "12: downloadGeneratedDiagram (GET png)",           kind: "async" },
        { numero: 13, de: "createGeneratedDiagramForProject (Express)", a: "modelo_base.eapx",                           texto: "13: createGeneratedDiagram (publicUrl)",           kind: "sync" },
        { numero: 14, de: "createGeneratedDiagramForProject (Express)", a: "EaDiagramModal (Front)",                     texto: "14: GeneratedDiagram { publicUrl }",               kind: "return" },
        { numero: 15, de: "EaDiagramModal (Front)",                    a: "createGeneratedDiagramForProject (Express)", texto: "15: GET /api/v1/diagrams/:id/content",             kind: "async" },
        { numero: 16, de: "createGeneratedDiagramForProject (Express)", a: "EaDiagramModal (Front)",                     texto: "16: stream PNG inline",                            kind: "return" },
        { numero: 17, de: "EaDiagramModal (Front)",                    a: "Usuario",                                    texto: "17: muestra diagrama en el documento",             kind: "sync" }
    ]
};

construirSecuencia(Repository, configHU20);
```

---

## 6. HU 21 — Documentos Colaborativos por Proyecto

**Flujo documentado (colaboración en tiempo real, Yjs + Hocuspocus):** cada editor pide
un *realtime token* (`GET /auth/realtime-token`), abre un `HocuspocusProvider` a
`ws(s)://host/collaboration` en la sala `document:<id>`; el servidor autentica por JWT y
verifica membresía del proyecto (`onAuthenticate`), hidrata el `Y.Doc` desde
`Document.contentState` (`onLoadDocument`); al escribir, el update viaja por WS, se
reenvía al otro par (cambio en vivo) y se persiste, *debounced*, vía
`updateDocumentContentState` (`onStoreDocument`). La *awareness* propaga cursores.

**Participantes:** `UsuarioA`, `UsuarioB`, `ProEditorA` (Front),
`ProEditorB` (Front), `realtime-token` (Express auth), `Hocuspocus` (WS server),
`Document.contentState` (DB).

```javascript
//!JScript
// HU 21 - Documentos colaborativos (Yjs + Hocuspocus, co-edicion en tiempo real).
// Requiere el bloque del motor (seccion 3) pegado arriba.

var configHU21 = {
    nombre: "HU21 - Documentos Colaborativos",
    participantes: [
        { nombre: "UsuarioA",                 tipo: "actor" },
        { nombre: "UsuarioB",                 tipo: "actor" },
        { nombre: "ProEditorA (Front)",       tipo: "lifeline" },
        { nombre: "ProEditorB (Front)",       tipo: "lifeline" },
        { nombre: "realtime-token (Express)", tipo: "lifeline" },
        { nombre: "Hocuspocus (WS server)",   tipo: "lifeline" },
        { nombre: "Document.contentState (DB)", tipo: "lifeline" }
    ],
    mensajes: [
        { numero: 1,  de: "UsuarioA",                 a: "ProEditorA (Front)",       texto: "1: abre documento",                          kind: "sync" },
        { numero: 2,  de: "ProEditorA (Front)",       a: "realtime-token (Express)", texto: "2: GET /auth/realtime-token",                kind: "async" },
        { numero: 3,  de: "realtime-token (Express)", a: "ProEditorA (Front)",       texto: "3: { token (JWT httpOnly) }",                kind: "return" },
        { numero: 4,  de: "ProEditorA (Front)",       a: "Hocuspocus (WS server)",   texto: "4: WS connect document:<id> + token",        kind: "async" },
        { numero: 5,  de: "Hocuspocus (WS server)",   a: "Document.contentState (DB)", texto: "5: onAuthenticate + findDocumentStateForUser", kind: "sync" },
        { numero: 6,  de: "Document.contentState (DB)", a: "Hocuspocus (WS server)", texto: "6: contentState (bytes)",                    kind: "return" },
        { numero: 7,  de: "Hocuspocus (WS server)",   a: "ProEditorA (Front)",       texto: "7: onLoadDocument: Y.applyUpdate",           kind: "return" },
        { numero: 8,  de: "UsuarioB",                 a: "ProEditorB (Front)",       texto: "8: abre documento",                          kind: "sync" },
        { numero: 9,  de: "ProEditorB (Front)",       a: "Hocuspocus (WS server)",   texto: "9: WS connect document:<id> + token",        kind: "async" },
        { numero: 10, de: "Hocuspocus (WS server)",   a: "ProEditorB (Front)",       texto: "10: onAuthenticate + onLoadDocument",        kind: "return" },
        { numero: 11, de: "UsuarioA",                 a: "ProEditorA (Front)",       texto: "11: escribe texto (Y.Doc update)",           kind: "sync" },
        { numero: 12, de: "ProEditorA (Front)",       a: "Hocuspocus (WS server)",   texto: "12: WS message: update",                     kind: "async" },
        { numero: 13, de: "Hocuspocus (WS server)",   a: "ProEditorB (Front)",       texto: "13: broadcast update (cambio en vivo)",      kind: "async" },
        { numero: 14, de: "Hocuspocus (WS server)",   a: "Document.contentState (DB)", texto: "14: onStoreDocument: encodeStateAsUpdate",   kind: "sync" },
        { numero: 15, de: "ProEditorA (Front)",       a: "Hocuspocus (WS server)",   texto: "15: awareness: cursor + color",              kind: "async" },
        { numero: 16, de: "Hocuspocus (WS server)",   a: "ProEditorB (Front)",       texto: "16: awareness: caret de UsuarioA",            kind: "async" }
    ],
    // La persistencia es debounced (DOCS_SNAPSHOT_INTERVAL_MS); se repite mientras haya edicion.
    fragmentos: [
        { tipo: "loop", etiqueta: "loop [mientras se edita]", desde: 14, hasta: 16 }
    ]
};

construirSecuencia(Repository, configHU21);
```

---

## 7. Notas y limitaciones

- **API fiel al backend.** Los scripts replican exactamente la API de EA que usa
  `task_manager_ai_back/app/services/ea_service.py`: diagrama `"Sequence"`, participantes
  `Actor` / `Object` + estereotipo `Lifeline`, conectores `Sequence` con `Subtype`
  (`sync=0`, `async=1`, `return=3`) y `SequenceNo`, e `InteractionFragment` con `Subtype`
  (`alt=0`, `opt=1`, `loop=4`).
- **Auto-layout vertical de mensajes.** EA apila los mensajes de un diagrama de secuencia
  según `SequenceNo` al recargar (`ReloadDiagram`); los scripts delegan ese posicionamiento
  y solo fijan la posición horizontal de los participantes.
- **Compatibilidad JScript.** Sintaxis ES3/ES5 (`var`, `function`, sin plantillas ni
  *arrow functions*) para garantizar ejecución en el motor interno de EA. Si usas EA con
  un motor más moderno puedes refactorizar a ES6 sin riesgo.
- **Idempotencia.** Cada ejecución crea un diagrama nuevo (con el mismo nombre) dentro del
  paquete seleccionado. No sobrescribe ni elimina diagramas previos.
- **Mensajes numerados en el texto** (`"3: agentStep(...)"`) — el `SequenceNo` real va en
  la propiedad del conector; el prefijo en el texto es solo legibilidad. Puedes quitarlo
  cambiando el campo `texto`.
- **Sin dependencias externas.** No requieren `win32com`, Node, ni conexión a los
  backends: solo EA abierto con el modelo base y un paquete seleccionado.
- **Validación recomendada.** Tras generar, usa *Layout > Layout Diagram* (Ctrl+Shift+L)
  para un ajuste fino estético; el contenido semántico ya queda correcto.

### Archivos fuente del proyecto referenciados

| HU | Backend Express | Backend IA | Frontend |
|----|-----------------|------------|----------|
| 19 | `src/modules/copilot/` (`service`, `routes`, `indexing/retrieval.service`) | `app/api/v1/agent.py`, `services/agent_service.py`, `embedding_service.py` | `features/copilot/` |
| 20 | `src/modules/documents/documents.service.ts` (`createGeneratedDiagramForProject`) | `app/api/v1/ea.py`, `services/ea_service.py`, `llm_service.py` (`parse_architecture_prompt`) | `features/documents/components/EaDiagramModal.tsx` |
| 21 | `src/modules/documents/`, `src/collaboration/` (`collaboration.server.ts`) | — (sin IA) | `features/documents/` (`pro-collaborative-editor.tsx`), `lib/realtime-auth.ts` |
