# PROJECT_STATE

Single source of truth for where development stands. Read this at the start of every session (master prompt §27) and update it at the end.

| Item | State |
|---|---|
| Current build | **Build 3 — Avionics and electronics: complete** (Builds 1–2 complete) |
| Application version | 0.4.0 (Build 3) |
| Licence | Apache-2.0 (LICENSE, NOTICE, CITATION.cff) since v0.4.0 |
| Repository | `batraamul/Drone_Design` — was empty at inspection (2026-11-21); nothing to preserve |
| Current commit | Build 1 on `main`, pushed 2026-11-22; GitHub Actions "Test and build" job passed on GitHub |
| Latest deployed version | Live at https://batraamul.github.io/Drone_Design/ (auto-deployed from `main`) |
| Last successful test run | 2026-11-22 — `npm test`: structural 12/12 groups; Node tests 93/93; Playwright 31/31 (desktop + mobile Chromium) |

## Completed (Build 1)

- Application shell: top bar, navigation (20 modules, grouped, collapsible), inspector, engineering console (console, problems, calculations), resizable panels, mobile drawers, command palette, notifications, keyboard shortcuts.
- Themes: dark (default), light, system; density; reduced motion.
- Dashboard, My Projects (list, Trash, workspace: overview, requirements, notes, versions/compare/restore), Settings (appearance, display units, autosave, storage, backups, updates, scope).
- Persistence: IndexedDB with additive migrations; document schema migrations; autosave; optimistic concurrency and conflict resolution; cross-tab sync; import/export; full backup and merge-only restore; persistent-storage request.
- State store with undo/redo and derived-calculation graph.
- Engineering foundations: units, provenance taxonomy, ISA atmosphere (validated), requirement-consistency checks.
- Learning Centre (partial): 3 lessons with calculators and knowledge checks; 41-term glossary.
- PWA: manifest, icons, versioned service worker, update flow; install card with per-OS instructions.
- Google Drive sync (0.2.0): per-device JSON copies in the user's Drive, three-way merge with deletion markers, erase-local-copy option.
- Manifest id (0.2.2): "/Drone_Design/aerolab-x". It must never be "./" or "/" because that collided with E-Diary's identity (tests/regression/manifest-identity.test.mjs).
- Safari window guard (0.2.2): on batraamul.github.io, any Safari Dock window on a Mac is sent to /e-diary/index.html before the app boots. On the Mac, AEROLAB X is installed via Chrome/Edge until it has its own host.
- Getting-started checklist and plain-English design-review summary.
- Quality: structural gate, Node tests, Playwright tests; GitHub Actions CI + Pages deployment workflow.
- Documentation: README, CHANGELOG, docs/ (architecture, roadmap, engineering models, data model, AI models, deployment).

## Completed (Build 2, v0.3.0)

- Configuration schema (`modules.configuration`): 24 layouts across 5 categories, typed SI parameters with ranges. Project schema v2 with the 1→2 migration, validation and import repair. A category change switches layout in one undo step.
- Geometry model (`js/engineering/geometry.js`):
  - rotor positions and spin directions, wheelbase, tip clearance, disc area and loading, ideal hover velocity and power;
  - wing area, AR, MAC, quarter-chord sweep and aerodynamic centre, wing loading;
  - tail areas and volume coefficients (conventional and V-tail);
  - VTOL lift rotors.

  Checks GEO-MR-001…003, GEO-TAIL-001…004, GEO-FW-001 and GEO-LIFT-004 feed the shared design review (store nodes `geometry` and `review`).
- Drone Architecture page (partial: power and avionics architecture come in Build 3): layout picker, parameter form, live top, front and side SVG drawings, geometry review.
- 3D Design Studio (partial: mass and placement come in Build 5): three.js 0.170.0 vendored in `vendor/three/`, orbit, pan, zoom, standard views, the same dimension form, and a 2D fallback without WebGL.
- Learning: lessons "Multirotor layout, disc loading and ideal hover power" and "Wing planform and tail volume coefficients", with calculators. Glossary now 48 terms, sorted.

## Completed (Build 3, v0.4.0)

- Component model (`js/engineering/components.js`): 10 types, SI specifications, port counts, quantity, provenance and source per component. Project schema v3 (`modules.components`) with the 2→3 migration and import repair.
- Illustrative catalogue (`js/engineering/catalogue.js`): 20 "Example …" parts plus a coherent example quadcopter set. Real product data is never reproduced; a test enforces it.
- Electrical model (`js/engineering/electrical.js`):
  - battery and regulator rails, pass-through flight-controller rail;
  - worst-case loads, converter input current at the lowest V_in;
  - battery current, power and life.

  Checks AV-PWR-000…008, AV-IF-001…004 and AV-DATA-001/002 feed the shared design review (store node `electrical`).
- Avionics Laboratory (partial: link budget and SDR in Build 7): toolbar (library, custom, example set), block diagram, component editors, connections, power-budget table with utilisation bars, compatibility checks.
- Component Library (partial: motors and propellers in Build 4): search and type filter, specification summaries, add to project.
- Lesson "Avionics power budgets, regulators and logic levels" with a regulator and battery-life calculator; 7 new glossary terms.
- Licence: Apache-2.0 with NOTICE and CITATION.cff. Roadmap extended with Builds 13 (stratospheric sounding), 14 (defence-style assurance, civilian scope) and 15 (open publication). The Stratospheric Sounding Lab appears as a planned module (21 navigation entries).

## Pending modules

3D Studio mass/CG/placement (Build 5) · Avionics link budget and SDR (Build 7) · Component Library motors and propellers (Build 4) · Propulsion Laboratory, Power & Energy (Build 4) · Aerodynamics, Structural Analysis (Build 5) · Flight Dynamics, Micro Drone Laboratory, Flight Simulator (Builds 6/10) · Payload Laboratory, Mission Planner (Build 7) · AI & Autonomous Intelligence Lab (Builds 8–10) · Safety & Reliability, Engineering Reports (Build 11) · Learning Centre completion (continuous) · Release hardening (Build 12) · Stratospheric Sounding Lab (Build 13) · Defence-style assurance (Build 14) · Open publication (Build 15).

## Known issues and limitations

- No known functional bugs.
- Panels can be collapsed and resized but not rearranged (deferred; prompt says "where practical").
- The simulation-status indicator is static until the simulator exists (Build 6).
- Interactive charts are basic SVG; Chart.js arrives in Build 4.
- The 3D model is a conceptual shape: flat surfaces, no aerofoil thickness, landing gear or components yet.
- The geometry review uses MTOW from the requirements; there is no mass estimate yet (Build 4).
- Component data merges as one unit in Drive sync: if two devices edit components at the same time, the later edit set wins. Other project fields still merge field by field.
- When a Drive merge combines a category change with a layout edit from another device, the Architecture page asks for a layout. This is handled, but the user has to choose one.
- Projects are per browser and per origin (hosted site vs. localhost); move them with backups.

## Blocked / needs owner action

- Permanent separation from E-Diary: move the repo to its own host (free GitHub organisation, e.g. aerolab-x.github.io), then update CANONICAL_URL and the OAuth origins. The 0.2.1 guard is the interim fix.

1. ~~Push access~~ — resolved 2026-11-22; Build 1 pushed to `main`.
2. ~~Enable GitHub Pages~~ — done 2026-11-22.
4. **Google Drive sync:** paste the OAuth Client ID (same as E-Diary) in Settings on each device.
3. Optional: protect `main` (require the "Test and build" check). Licence chosen: Apache-2.0.

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

**Build 4, task 1:** motor and propeller data model (Kv, resistance, no-load current, limits; diameter, pitch, C_T/C_P), with provenance per value and project schema v4 with a 3→4 migration and tests. See `docs/roadmap.md` (Build 4 plan).
