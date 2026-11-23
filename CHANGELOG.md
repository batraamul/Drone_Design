# Changelog

All notable changes to AEROLAB X are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.5.0] — 2026-11-23 — Build 4: Propulsion and energy, design flow, balloon glide-sonde

### Added

- **Propulsion & Energy** (Propulsion Laboratory and Power & Energy):
  - motor and propeller selection (illustrative library or your own datasheet or measured values, with a source);
  - the hover operating point (speed, torque, current, voltage, efficiency, throttle), total thrust versus throttle and full-throttle thrust-to-weight;
  - hot-and-high conditions;
  - a battery model with an open-circuit voltage curve, internal resistance and sag;
  - time-stepped endurance and range;
  - a mass budget against the take-off mass target;
  - fixed-wing cruise power.

  Thirteen new checks.
- **Design flow:** seven simple steps from targets to build sheet, with a step bar and Back/Next on every design page and a progress card on the dashboard.
- **Design Summary and build sheet:** flow status, open problems, scale drawing, dimensions, parts list (CSV), key results with model and provenance, and guidance for a journal paper (for example the Defence Science Journal) or a patent (InPASS prior-art search first). It prints cleanly.
- **Stratospheric Sounding Lab (early Build 13):**
  - balloon ascent to 33 km (gas, free lift, ascent rate, burst altitude and margin);
  - release, stall drop and pull-out within a load-factor limit (2-D simulation, Mach and Reynolds number);
  - glide with sonde vertical resolution;
  - a hybrid powered stage on the battery energy left;
  - a mission profile chart and stage table;
  - wind-aware ascent through the open SondeHub/Tawhiri predictor, with KML export.
- **Courses, books & tools:** NPTEL, Coursera and MIT courses, reference books, UIUC measured data, open-source tools (OpenVSP, XFLR5, FreeCAD, Blender, ArduPilot, PX4, QGroundControl, Gazebo, QGIS), and defence publication and patent services.
- **3D export** to STL (FreeCAD, OpenVSP, 3D printing) and glTF (Blender).
- Lessons "Matching motor, propeller and battery" and "Balloon-launched glide-sondes", with calculators.
- Non-weapon **defence applications** (logistics, surveillance and reconnaissance, met support, high-altitude operations) and disaster relief.
- Project schema **v4** (propulsion) and **v5** (balloon mission), with automatic migrations. Batteries gain an optional internal-resistance field.

### Changed

- "Propulsion Laboratory" is now titled "Propulsion & Energy"; "Civilian application" is now "Application".

## [0.4.0] — 2026-11-22 — Build 3: Avionics and electronics

### Added

- **Avionics Laboratory** (partial; link budget and SDR in Build 7):
  - add components from the library, add your own with a datasheet source, or start from an example quadcopter set;
  - connect power and data (UART, I²C, SPI, CAN, PWM/DShot, USB, Ethernet);
  - an auto-laid-out block diagram with colour-coded links and outlined problems;
  - a component editor for SI specifications, quantity, ports, provenance and source.
- **Electrical model** (`js/engineering/electrical.js`):
  - battery and regulator rails, and the pass-through flight-controller rail;
  - worst-case power budget per rail with utilisation, and converter input current at the lowest input voltage;
  - battery current, power and life;
  - checks for over-voltage, under-voltage, overload, 80 % derating, unpowered parts, power loops, missing ports, port overuse, 3.3 V/5 V logic mismatch, unconnected devices and unsourced data.

  The checks feed the design review, the inspector and the Problems panel.
- **Component Library** (partial; motors and propellers in Build 4): 20 illustrative "Example …" parts with search, type filter and "Add to project". There is no real product data; a test enforces this.
- Project schema **v3**: `modules.components`, with the 2→3 migration and import repair.
- Lesson "Avionics power budgets, regulators and logic levels" with a regulator and battery-life calculator, and 7 glossary terms.
- **Apache-2.0 licence** (`LICENSE`, `NOTICE`) and `CITATION.cff`.
- Roadmap Builds **13** (Stratospheric Sounding Laboratory), **14** (defence-style assurance with civilian scope) and **15** (open publication for IEEE Transactions). The Stratospheric Sounding Lab appears as a planned module.

### Changed

- Engineering checks without an equation or inputs no longer show empty sections.

## [0.3.0] — 2026-11-22 — Build 2: Configuration and 3D design

### Added

- **Drone Architecture** (partial, Build 2 scope done). Choose the aircraft category and one of 24 layouts:
  - multirotor X, +, H, Y, hexa, octo and coaxial Y6/X8;
  - fixed-wing conventional, V-tail, flying wing, delta and glider;
  - VTOL quadplane, tilt-rotor and tailsitter;
  - special and micro layouts.

  Set the key dimensions in any unit. Top, front and side scale drawings redraw as you type. A geometry review shows every derived value with its equation, inputs and provenance.
- **Geometry model** (`js/engineering/geometry.js`), each value documented and tested:
  - rotor positions and spin directions, wheelbase, propeller tip clearance, disc area, disc loading, and ideal hover induced velocity and power (momentum theory, ISA density at the operating-altitude target);
  - wing area, aspect ratio, mean aerodynamic chord and its position, quarter-chord sweep and aerodynamic centre;
  - tail areas and tail volume coefficients (conventional and V-tail), wing loading and fuselage fineness.
- **Geometry checks** in the design review, the inspector and the Problems panel: overlapping or crowded propellers, propellers over the body or fuselage, small tails, and a tail overlapping the wing.
- **3D Design Studio** (partial). An interactive 3D conceptual model built from the same geometry: rotate, pan, zoom, and perspective, top, front and side views. The dimension form sits beside the model. The 2D drawings are shown when WebGL is unavailable. three.js 0.170.0 is vendored with its MIT licence (`vendor/three`) and loaded only on this page.
- Project schema **v2**: `modules.configuration` with a 1→2 migration that keeps all content. Imports, Drive-merged copies and old versions are migrated and repaired with warnings. Changing the category switches to a layout of that category in one undo step.

## [0.2.2] — 2026-11-22 — E-Diary and AEROLAB X fully separate on the Mac

### Fixed

- **Root cause: shared app identity.** The manifest `id` was `"./"`, the same as E-Diary's. Chrome resolves a relative id against the origin, so both apps had the identity `https://batraamul.github.io/`. The browser treated AEROLAB X as a new version of E-Diary: the E-Diary icon opened AEROLAB X, and Chrome offered to "update" E-Diary's name and logo to AEROLAB X. The id is now `/Drone_Design/aerolab-x`, unique to AEROLAB X. A regression test stops it ever matching E-Diary again.
- **Repair for already-installed E-Diary apps.** While the ids collided, the browser could overwrite E-Diary's saved start address with AEROLAB X's. AEROLAB X's start_url now carries `launch=aerolab-x`. Any installed-app window on this host that opens AEROLAB X without it is sent to `/e-diary/index.html`. The browser then re-reads E-Diary's own manifest and restores E-Diary.
- The 0.2.1 guard let AEROLAB X keep running inside the E-Diary Safari window. The rule is now strict: on batraamul.github.io, AEROLAB X never runs inside any Safari Dock window on a Mac; it sends the window straight to E-Diary (`/e-diary/index.html`) before anything starts. The `?app=aerolab` exception and the address tagging are removed, and any stored exception is cleared.
- The service worker activates immediately for this release, so the corrected guard reaches windows that still run 0.2.1.
- macOS install help now says to install AEROLAB X with Chrome or Edge, not Safari "Add to Dock".

## [0.2.1] — 2026-11-22 — Keep E-Diary and AEROLAB X apart in Safari

### Fixed

- **E-Diary window showing AEROLAB X (Safari on macOS).** A Safari "Add to Dock" web app claims the whole host, and E-Diary shares `batraamul.github.io`. When AEROLAB X now loads inside a standalone Safari window that was not launched as AEROLAB X, it does not start; it shows "Returning to E-Diary…" and sends the window back to `/e-diary/` after 1.5 s. A button keeps a genuine AEROLAB X web app if one was installed before this release.
- AEROLAB X's own launch address carries `?app=aerolab` (manifest `start_url` and the address of a normal tab), so its own Dock app is recognised. Chrome, Edge, iOS and Android are unaffected.

## [0.2.0] — 2026-11-22 — Build 1.1: Google Drive sync and usability

### Added

- **Google Drive sync** (same design as E-Diary): sign in with your own OAuth Client ID (scope `drive.file`); each device keeps its copy as a JSON file in the Drive folder "AEROLAB X sync"; copies from all devices are merged item by item (three-way merge: edits on different devices are combined, the later edit wins on the same field, deletions stay deleted, nothing is lost). Syncs a few seconds after each change, every two minutes, on returning to the tab and when back online. Top-bar chip shows the sync state.
- **Erase this browser's copy**: once everything is in Google Drive, a shared computer can keep nothing; the data comes back at the next sign-in.
- **Install the app** card with a one-click install button where the browser supports it and instructions for Windows, macOS, Ubuntu/Kali Linux, Android and iOS.
- **Getting started** checklist on the dashboard that ticks off as you go; plain-English summary of the design review on the dashboard and inspector.
- Permanent deletions leave a deletion marker so other devices never bring a deleted project back.

## [0.1.0] — 2026-11-21 — Build 1: Foundation

### Added

- **Application shell**: top bar (current project, save state, undo/redo, simulation status, search, notifications, theme, inspector toggle, settings), grouped collapsible navigation for all 20 modules, resizable inspector and engineering console, mobile drawers, keyboard shortcuts, command palette (modules, projects, commands, glossary).
- **Dark aerospace theme** (default), light and system themes, compact density, reduced motion; strict Content-Security-Policy.
- **Dashboard** with current project, requirements, design review, recent projects, build roadmap, data safety and scope.
- **Project manager**: create, open, rename, describe, categorise, tag, duplicate, Trash/restore, permanent delete, notes (design log), named versions, version compare and restore (with safety snapshot, undoable), project import/export, full backup and merge-only restore.
- **IndexedDB persistence** with additive schema migrations and a migration log; document schema versioning with step-wise migrations and pre-migration snapshots.
- **Autosave** (debounced with maximum wait; also on hide, switch and before updates), optimistic concurrency with conflict resolution, cross-tab synchronisation, persistent-storage request.
- **State store** with immutable documents, coalesced undo/redo and a dependency-tracked derived-calculation graph.
- **Engineering foundations**: SI unit system with explicit conversions; provenance and model-fidelity taxonomy; International Standard Atmosphere (U.S. Standard Atmosphere 1976, to 86 km) validated against tabulated values; requirement-consistency checks with equations, inputs, assumptions and provenance.
- **Learning Centre (partial)**: three lessons (data provenance and fidelity; SI units; standard atmosphere) with calculators and knowledge checks; 41-term glossary.
- **Honest planned-module pages** for modules scheduled in later builds.
- **PWA**: manifest, icons, versioned offline cache, user-controlled update flow.
- **Quality gates**: structural checks, unit/engineering/integration/regression tests (Node), browser tests (Playwright, desktop and mobile).
- **CI/CD**: GitHub Actions workflow that tests every push and deploys `main` to GitHub Pages.
- **Documentation**: README, PROJECT_STATE, architecture, roadmap, engineering models, data model, AI models, deployment.

### Known limitations

- Modules other than Dashboard, My Projects, Settings and (partly) the Learning Centre are planned for later builds and perform no calculations yet.
- Requirement checks test only the consistency of targets, not whether a design meets them.
- Projects are stored per browser and origin; export backups to keep copies elsewhere.
