# PROJECT_STATE

Single source of truth for where development stands. Read this at the start of every session (master prompt §27) and update it at the end.

| Item | State |
|---|---|
| Current build | **Build 6 — Mass & balance, flight dynamics, OpenVSP: complete** (Builds 1–5 complete; Build 13 started early) |
| Application version | 0.7.0 (Build 6) |
| Licence | Apache-2.0 (LICENSE, NOTICE, CITATION.cff) since v0.4.0 |
| Repository | `batraamul/Drone_Design` — was empty at inspection (2026-11-21); nothing to preserve |
| Current commit | Build 1 on `main`, pushed 2026-11-22; GitHub Actions "Test and build" job passed on GitHub |
| Latest deployed version | Live at https://batraamul.github.io/Drone_Design/ (auto-deployed from `main`) |
| Last successful test run | 2026-11-26 — `npm test`: structural 12/12 groups; Node tests 171/171; Playwright 44/44 (desktop + mobile Chromium, software WebGL) |

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

## Completed (v0.7.0 — Build 6)

- **Mass & Balance** (`js/engineering/mass-properties.js`, page `js/modules/balance.js`, route `balance`):
  - the parts of the mass budget placed in 3D;
  - CG and inertia tensor (parallel-axis theorem);
  - parts can be dragged or nudged on the top and side views, or typed;
  - "Balance with the battery" and automatic battery balance for a 10 % static margin;
  - hover thrust split.

  Checks MP-*. Aerodynamics uses the computed CG unless a measured CG is entered.
- **Flight Dynamics** (`js/engineering/dynamics.js`, `linalg.js`, page `js/modules/flight-dynamics.js`):
  - fixed-wing derivatives, longitudinal and lateral state matrices, five modes; the eigen-solver is verified on Nelson's Navion example;
  - elevator, gust and rudder responses;
  - a nonlinear 6-DoF hover simulation with motor lag, allocation and a pole-placed cascaded controller, flying a repeatable scenario.

  Checks DY-*.
- **Propeller at forward speed:**
  - C_T(J) and C_P(J) from a pasted table or a generic curve;
  - cruise operating point with propeller and motor efficiency;
  - VTOL `propulsion.cruise` set;
  - check PR-CRU-002.
- **OpenVSP script export** (`js/engineering/openvsp.js`) from the 3D Design Studio.
- Lesson "Balance, inertia and how a drone flies" (CG calculator); 50 built-in formulas.
- **Design flow:** eleven steps.
- Project schema **v7**.

## Completed (v0.6.0 — Build 5)

- **Aerodynamics** (`js/engineering/aerodynamics.js`, page `js/modules/aerodynamics.js`, route `aerodynamics`):
  - lifting line (Glauert) and DATCOM sweep;
  - aerofoil presets with Reynolds-corrected c_l,max;
  - Raymer drag build-up and polar;
  - stall, V_md, V_mp and power required;
  - neutral point, static margin and suggested CG.

  Checks AE-*. Feeds the cruise L/D in Propulsion & Energy and the glide-sonde drag (C_D0 at the local Re).
- **Structural Analysis** (`js/engineering/structures.js`, page `js/modules/structures.js`):
  - spar and arm/boom tubes, auto-sized or manual;
  - stress, margin of safety, deflection;
  - arm f₁ against 1P/2P;
  - typical material records;
  - the pull-out load from the balloon mission.

  Checks ST-*.
- **Formula Library** (`js/engineering/expression.js`, `formulas.js`, `custom-formulas.js`, page `js/modules/formulas.js`, route `formulas`):
  - 40 built-in formulas with calculators and code/test/doc/reference links;
  - per-project user formulas (add/change/delete, unit checking, limits) in the review and summary.

  The procedure is in `docs/formulas.md`; the test `tests/engineering/formulas.test.mjs` keeps the registry, code and docs in step.
- **Example designs** (`js/engineering/templates.js`): six complete designs from "Start from an example".
- Layout-matched example parts.
- "Suggest a balloon".
- **Dashboard:** welcome hero and Design health card.
- **Design flow:** nine steps.
- **Lessons:** "Wing aerodynamics, drag and balance" and "Sizing spars and arms" (polar and beam calculators).
- Project schema **v6** (`modules.aerodynamics`, `modules.structures`, `modules.formulas`).
- **Fixed:** sideways scrolling on phones on pages with the flow bar; the mobile test now catches it.

## Completed (v0.5.0 — Build 4 and more)

- **Propulsion & Energy** (`js/engineering/propulsion.js`, page `js/modules/propulsion.js`, routes `propulsion` and `power`):
  - motor and propeller data with provenance;
  - the hover operating point, throttle, thrust versus throttle and full-throttle T/W;
  - hot-and-high (ISA + ΔT);
  - a battery OCV curve with internal resistance and sag;
  - time-stepped endurance;
  - a mass budget against MTOW;
  - fixed-wing cruise power from an estimated L/D.

  Checks PR-*. Project schema v4 (`modules.propulsion`). Illustrative motors and propellers are in the catalogue.
- **Design flow** (`js/ui/design-flow.js`): seven steps (targets → layout → avionics → propulsion → 3D → balloon mission → summary), each with a "done when" rule, a step bar and Back/Next on every design page, a dashboard card and links to its lesson.
- **Design Summary** (`js/modules/summary.js`, nav "Design Summary"): flow status, open problems, targets, top view, layout dimensions, parts list with CSV export, key results with model and provenance, balloon-mission stages, and paper and patent guidance. It prints as a build sheet.
- **Stratospheric Sounding Lab, early Build 13** (`js/engineering/sounding.js`, `js/modules/sounding.js`):
  - a latex balloon to 33 km AGL with lift budget, ascent rate and burst altitude;
  - release from rest, stall drop and load-limited pull-out (2-D RK4), with Mach and Re;
  - best-L/D glide with sonde vertical resolution;
  - a hybrid powered stage on the energy left after the avionics drain;
  - SondeHub/Tawhiri wind-aware ascent (online) with KML export.

  Checks SD-*. Project schema v5 (`modules.sounding`, disabled by default). CSP connect-src allows https://api.v2.sondehub.org.
- **Courses, books & tools** (`#/learning/resources`): NPTEL (IIT Kanpur UAV courses), Coursera Aerial Robotics, MIT OCW 16.333, books, UIUC propeller and aerofoil data, OpenVSP, XFLR5, FreeCAD, Blender, ArduPilot, PX4, QGroundControl, Mission Planner, Gazebo, QGIS, SondeHub, Defence Science Journal, InPASS, Google Patents and PATENTSCOPE. Links checked 2026-11-23.
- **3D export:** STL (Z-up, metres) and glTF/GLB through the vendored three.js exporters.
- **Lessons:** "Matching motor, propeller and battery" (motor calculator) and "Balloon-launched glide-sondes" (balloon calculator).
- **Applications** now include non-weapon defence roles (logistics, surveillance and reconnaissance, met support, high-altitude operations) and disaster relief; the scope text is updated. Weapons, targeting and harmful payloads remain excluded.

## Pending modules

Avionics link budget and SDR (Build 7) · Payload Laboratory and Mission Planner (Build 7) · Multirotor forward-flight drag (Build 7) · Aerodynamics remainder: vortex lattice, flaps, twist (later) · Structures remainder: torsion, joints, composite lay-ups (Build 11) · Micro Drone Laboratory (Build 7) · Flight Simulator / nonlinear fixed-wing with autopilot (Build 10) · Payload Laboratory, Mission Planner (Build 7) · AI & Autonomous Intelligence Lab (Builds 8–10) · Safety & Reliability, Engineering Reports (Build 11) · Learning Centre completion (continuous) · Release hardening (Build 12) · Stratospheric Sounding Lab remainder: sensor models, WMO export, glide wind drift (Build 13) · Defence-style assurance (Build 14) · Open publication (Build 15).

## Known issues and limitations

- No known functional bugs.
- Panels can be collapsed and resized but not rearranged (deferred; prompt says "where practical").
- The simulation-status indicator is static until the simulator exists (Build 6).
- Interactive charts are basic SVG (sufficient so far; no Chart.js dependency).
- The 3D model is a conceptual shape: flat surfaces, no aerofoil thickness, landing gear or components yet.
- The glide-sonde simulation has no wind in the glide (drag comes from the Aerodynamics model when the design wing is used); the balloon ascent rate rises with height under the constant-C_D assumption (real balloons climb at a more nearly constant rate).
- Aerodynamics: untwisted wings, no flaps; lifting line is less accurate below AR ≈ 4 and for high sweep (deltas); the fuselage term of the neutral point is an approximate fit.
- Flight dynamics: concept-level derivatives (strip theory, tail-volume methods), I_xz neglected in the lateral modes, linear fixed-wing responses; the hover controller is an idealised cascaded PID (no sensor noise, estimator or delays). For understanding and comparison only.
- Mass & balance: structure is distributed by fixed shares; component boxes are point masses.
- Structures: round tubes and beam theory only; no torsion, joints, skins or buckling.
- Multirotor forward-flight drag is not modelled yet (Build 7).
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

**Build 7, task 1:** Payload Laboratory: camera geometry, field of view, ground sample distance and overlap, with payloads feeding the mass and power budgets. Then the Mission Planner (survey patterns, mission energy, QGroundControl/KML export). See `docs/roadmap.md` (Build 7 plan).
