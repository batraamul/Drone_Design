# AEROLAB X

**Drone Design, Intelligence & Simulation Studio** — a modular, local-first engineering workstation for civilian UAVs and micro aerial vehicles: configuration, avionics, propulsion, energy, aerodynamics, structures, flight dynamics, mission planning, simulation, AI and engineering documentation, built around one shared project model.

> **Status: Build 1 of 12 (Foundation), version 0.2.0 (adds Google Drive sync).** The shell, project management, local persistence, engineering foundations and part of the Learning Centre are complete. Other modules are labelled *Planned* in the app and perform no calculations yet. See [`docs/roadmap.md`](docs/roadmap.md).

Hosted app (after deployment): **https://batraamul.github.io/Drone_Design/**

## What it does (Builds 1–3)

- **Projects** — create, duplicate, tag, describe, version, compare, restore, Trash, import/export and full backups; autosave with protection against two tabs overwriting each other; undo/redo.
- **Design requirements** — MTOW, payload, endurance, range, cruise airspeed, operating altitude and maximum wind, stored in SI units with display units of your choice, with live consistency checks (each shows its equation, inputs, assumptions and provenance).
- **Standard atmosphere** — ISA (U.S. Standard Atmosphere 1976) to 86 km, validated against the published tables; air properties at the operating altitude.
- **Drone Architecture** (Build 2) — pick one of 24 layouts:
  - quad, hexa, octo, coaxial and H multirotors;
  - conventional, V-tail, flying-wing, delta and glider fixed wings;
  - quadplane, tilt-rotor and tailsitter VTOL;
  - special and micro layouts.

  Set its dimensions in any unit. Scale top, front and side drawings and a geometry review update as you type: propeller clearance, disc loading, ideal hover power, wing area, aspect ratio, MAC and tail volume coefficients, each with its equation.
- **3D Design Studio** (Build 2) — rotate, pan and zoom a 3D conceptual model built from the same numbers, with standard views. The 2D drawings are shown if WebGL is unavailable.
- **Avionics Laboratory** (Build 3) — add batteries, regulators, flight controller, ESCs, radios, GNSS, sensors and payloads. Connect power and data and see a block diagram. A worst-case power budget per rail and compatibility checks cover voltages, current ratings, ports and 3.3 V/5 V logic levels. The **Component Library** offers illustrative example parts; your own parts carry their datasheet source.
- **Learning Centre** — lessons on data provenance and model fidelity, SI units, the standard atmosphere, multirotor layout and hover, wing planform and tail sizing, and avionics power budgets, with calculators and knowledge checks; searchable glossary.
- **Workstation** — dark/light themes, command palette (`Ctrl/⌘ + K`), resizable inspector and engineering console (log, problems, calculation register), offline use and installable PWA.

## Install it

Open **https://batraamul.github.io/Drone_Design/** and install it from the browser. No download or administrator rights are needed; it gets its own window and icon, works offline, and updates itself whenever a new version is published here.

| System | How |
|---|---|
| Windows | Chrome or Edge → install icon at the right of the address bar (or menu → *Install AEROLAB X*) |
| macOS | Chrome or Edge as above; Safari (macOS 14+) → File → *Add to Dock* |
| Ubuntu / Kali Linux | Chrome or Chromium → install icon in the address bar |
| Android / iPhone | Chrome → *Install app*; Safari → Share → *Add to Home Screen* |

Settings → *Install the app* has a one-click install button where the browser supports it.

## Your data in Google Drive (multi-device sync)

Like E-Diary, AEROLAB X can keep your projects as JSON files in **your own Google Drive** and merge changes made on different computers:

1. Settings → **Google Drive sync** → paste your Google OAuth Client ID (the same one E-Diary uses; its *Authorized JavaScript origins* must include `https://batraamul.github.io`, and the Google Drive API must be enabled in that Google Cloud project).
2. Give this device a name (e.g. *Office PC*) and click **Connect Google Drive and sync**.
3. Repeat on each computer. Each device writes `AEROLAB X — <device>.json` in the Drive folder *AEROLAB X sync* and merges the others item by item: edits on different computers are combined, the later edit wins on the same field, deleted items stay deleted, nothing is lost.

The browser keeps a working copy so the app opens instantly and works offline; changes go to Drive a few seconds later. On a shared computer, **Erase this browser's copy** removes it once everything is in Drive.

## Engineering honesty

Every value is labelled with its provenance (requirement, user input, assumption, illustrative, datasheet, conceptual estimate, analytical, simulation, measured, validated). Results are preliminary estimates for learning and early design exploration — **not** certified engineering analysis, validated CFD/FEA, flight approval or regulatory authorisation. AEROLAB X never labels a design flight-ready.

## Responsible use

For civilian, scientific, educational, inspection, mapping, environmental-monitoring and search-and-rescue research aircraft. AEROLAB X contains no weapon design or integration, targeting, weapon release or delivery, autonomous attack or harmful-payload functions. AI and autonomy experiments run only in simulation and are never connected to physical flight controls.

## Run locally

No build step is needed to run the app; it must be served over `http(s)` (ES modules do not load from `file://`).

```bash
git clone https://github.com/batraamul/Drone_Design.git
cd Drone_Design
python3 -m http.server 8080        # or: npm run serve
# open http://localhost:8080/
```

Data lives in your browser's IndexedDB for that address. Use **Settings → Export full backup** to keep a copy.

## Develop and test

Requires Node.js 22 or newer.

```bash
npm ci
npm run check        # structural quality gate
npm run test:unit    # unit, engineering, integration and regression tests (Node test runner)
npm run build        # assemble _site/ (what GitHub Pages serves)
npx playwright install chromium
npm run test:e2e     # browser tests against _site/ under /Drone_Design/
npm test             # all of the above
```

## Deployment

GitHub Actions (`.github/workflows/ci-deploy.yml`) tests every push and deploys `main` to GitHub Pages after all gates pass. One-time setting: **Settings → Pages → Source: GitHub Actions**. Update behaviour for installed apps and local copies is described in [`docs/deployment.md`](docs/deployment.md).

## Repository layout

```
index.html, manifest.json, service-worker.js, version.json
css/            main, dashboard, engineering, responsive
js/
  app.js, router.js, database.js, project-manager.js, project-schema.js, state-manager.js, version.js
  engineering/  units, provenance, atmosphere, requirements, configuration, geometry, components, catalogue, electrical   (pure, tested models)
  modules/      dashboard, projects, architecture, design-studio, avionics, component-library, settings, planned-module, module-registry, learning/
  ui/           shell, inspector, bottom panel, command palette, dialogs, notifications, components, icons
  utils/        dom, events, ids, immutable data, diff, format, logger, preferences, file, PWA
  visualisation/ plots, views2d (scale drawings), view3d (three.js model), block-diagram
vendor/three/   three.js 0.170.0 (MIT), see its README
assets/icons/   app icons
tests/          unit/, engineering/, integration/, regression/, e2e/
scripts/        serve, build-site, check-structure
docs/           architecture, roadmap, engineering-models, data-model, ai-models, deployment
```

## Documentation

- [`PROJECT_STATE.md`](PROJECT_STATE.md) — current build, completed and pending work, known issues, next task
- [`CHANGELOG.md`](CHANGELOG.md)
- [`docs/architecture.md`](docs/architecture.md) — architecture, libraries, simulation/AI approach, risks, acceptance evidence
- [`docs/engineering-models.md`](docs/engineering-models.md) — equations, assumptions, validation
- [`docs/data-model.md`](docs/data-model.md) — project schema, storage, file formats, migrations
- [`docs/ai-models.md`](docs/ai-models.md) — AI scope and rules
- [`docs/deployment.md`](docs/deployment.md) — CI/CD, updates, rollback
- [`docs/roadmap.md`](docs/roadmap.md)

## Licence

AEROLAB X is open source under the **Apache License 2.0** (see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE)). You may use, study, modify and redistribute it, including commercially. Keep the copyright and licence notices, and state the changes you make. The licence includes a patent grant from contributors and comes with no warranty.

Third-party code keeps its own licence: three.js is MIT (`vendor/three/LICENSE`).

To cite AEROLAB X in a publication, use [`CITATION.cff`](CITATION.cff); GitHub shows a "Cite this repository" button.
