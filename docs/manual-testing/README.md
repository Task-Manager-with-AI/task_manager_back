# Pruebas manuales (Playwright CLI)

Informes generados con la skill `playwright-cli` contra la aplicación en local.

| Informe | Fecha | Alcance |
| --- | --- | --- |
| [bugs-2026-05-18.md](./bugs-2026-05-18.md) | 2026-05-18 | Sprint 1 + flujos Sprint 2 (reuniones, sala, minutas) |
| [kanban-dark-mode-a11y-2026-05-18.md](./kanban-dark-mode-a11y-2026-05-18.md) | 2026-05-18 | Kanban — accesibilidad y UI/UX al activar/desactivar modo oscuro |
| [kanban-v2-personalization.md](./kanban-v2-personalization.md) | 2026-05-19 | Kanban v2 — escenarios de personalización |
| [kanban-v2-bugs-fixes-2026-05-19.md](./kanban-v2-bugs-fixes-2026-05-19.md) | 2026-05-19 | Kanban v2 — bugs al reordenar columnas, agregar tarea, y fixes propuestos |

## Entorno de la sesión

| Servicio | URL | Estado |
| --- | --- | --- |
| Frontend | http://localhost:3000 | En ejecución (`npm run dev`) |
| Backend | http://localhost:4000 | En ejecución (`npm run dev`) |
| AI backend | http://localhost:8000 | No verificado en esta sesión |

## Cómo reproducir

```bash
# Terminal 1 — backend
cd task_manager_back && npm run dev

# Terminal 2 — frontend
cd task_manager_front && npm run dev

# Terminal 3 — automatización
cd task_manager_project
playwright-cli -s=qa open http://localhost:3000/login
playwright-cli -s=qa snapshot
# … interacciones según el informe
playwright-cli -s=qa close
```

Herramienta: `@playwright/cli` v0.1.13, navegador Chrome (Playwright).
