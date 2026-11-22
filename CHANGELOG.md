# Changelog

All notable changes to AEROLAB X are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.2.2] — 2026-11-22 — E-Diary and AEROLAB X fully separate on the Mac

### Fixed

- **Root cause: shared app identity.** The manifest `id` was `"./"`, the same as E-Diary's. Chrome resolves a relative id against the origin, so both apps had the identity `https://batraamul.github.io/`. The browser treated AEROLAB X as a new version of E-Diary: the E-Diary icon opened AEROLAB X, and Chrome offered to "update" E-Diary's name and logo to AEROLAB X. The id is now `/Drone_Design/aerolab-x`, unique to AEROLAB X. A regression test stops it ever matching E-Diary again.
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
