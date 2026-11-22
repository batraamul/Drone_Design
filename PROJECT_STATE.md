# PROJECT_STATE

Single source of truth for where development stands. Read this at the start of every session (master prompt §27) and update it at the end.

| Item | State |
|---|---|
| Current build | **Build 1 — Foundation: complete and tested locally** |
| Application version | 0.1.0 |
| Repository | `batraamul/Drone_Design` — was empty at inspection (2026-11-21); nothing to preserve |
| Current commit | Build 1 on `main`, pushed 2026-11-22; GitHub Actions "Test and build" job passed on GitHub |
| Latest deployed version | **None yet** — deploy job waits for GitHub Pages to be enabled (Settings → Pages → Source: GitHub Actions), then re-run the workflow |
| Last successful test run | 2026-11-21 — `npm test`: structural checks 12/12 groups; Node tests 60/60 (Node 22 and 24); Playwright 16/16 (desktop + mobile Chromium) |

## Completed (Build 1)

- Application shell: top bar, navigation (20 modules, grouped, collapsible), inspector, engineering console (console, problems, calculations), resizable panels, mobile drawers, command palette, notifications, keyboard shortcuts.
- Themes: dark (default), light, system; density; reduced motion.
- Dashboard, My Projects (list, Trash, workspace: overview, requirements, notes, versions/compare/restore), Settings (appearance, display units, autosave, storage, backups, updates, scope).
- Persistence: IndexedDB with additive migrations; document schema migrations; autosave; optimistic concurrency and conflict resolution; cross-tab sync; import/export; full backup and merge-only restore; persistent-storage request.
- State store with undo/redo and derived-calculation graph.
- Engineering foundations: units, provenance taxonomy, ISA atmosphere (validated), requirement-consistency checks.
- Learning Centre (partial): 3 lessons with calculators and knowledge checks; 41-term glossary.
- PWA: manifest, icons, versioned service worker, update flow.
- Quality: structural gate, Node tests, Playwright tests; GitHub Actions CI + Pages deployment workflow.
- Documentation: README, CHANGELOG, docs/ (architecture, roadmap, engineering models, data model, AI models, deployment).

## Pending modules

Drone Architecture, 3D Design Studio (Build 2) · Avionics Laboratory, Component Library (Build 3) · Propulsion Laboratory, Power & Energy (Build 4) · Aerodynamics, Structural Analysis (Build 5) · Flight Dynamics, Micro Drone Laboratory, Flight Simulator (Builds 6/10) · Payload Laboratory, Mission Planner (Build 7) · AI & Autonomous Intelligence Lab (Builds 8–10) · Safety & Reliability, Engineering Reports (Build 11) · Learning Centre completion (continuous) · Release hardening (Build 12).

## Known issues and limitations

- No known functional bugs.
- Panels can be collapsed and resized but not rearranged (deferred; prompt says "where practical").
- The simulation-status indicator is static until the simulator exists (Build 6).
- Interactive charts are basic SVG; Chart.js arrives in Build 4.
- Projects are per browser and per origin (hosted site vs. localhost); move them with backups.

## Blocked / needs owner action

1. ~~Push access~~ — resolved 2026-11-22; Build 1 pushed to `main`.
2. **Enable GitHub Pages:** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Optional: protect `main` (require the "Test and build" check); choose a licence.

## Technical decisions

| Decision | Reason |
|---|---|
| No bundler; native ES modules | Deploys as-is to Pages; readable; required layout preserved |
| Hash routing | Works on the `/Drone_Design/` sub-path and in local copies |
| Immutable store + derived graph | Cheap undo/redo; automatic propagation of parameter changes |
| Optimistic concurrency (revision) + BroadcastChannel | No silent overwrites between tabs |
| Additive-only DB migrations; pre-migration snapshots | Updates can never delete user data |
| Cache-first single-version app shell; user-approved updates | No mixed-version pages; edits saved before reload |
| Strict CSP; no innerHTML | Imported files cannot inject code |
| ISA to 86 km | Covers balloon-assisted / high-altitude research platforms |
| No "flight-ready" design stage | The app must never certify a design |

## Next exact task

**Build 2, task 1:** define the configuration schema (`modules.configuration` with category-specific layouts), bump the project schema to v2 with a v1→v2 document migration, and add migration and validation tests. Then the configuration wizard in Drone Architecture. See `docs/roadmap.md`.
